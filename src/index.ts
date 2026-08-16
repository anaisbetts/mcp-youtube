#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnPromise } from "spawn-rx";
import { rimraf } from "rimraf";

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);
const DEFAULT_SUBTITLE_LANGUAGES = ["en"];

interface RequestedSubtitle {
  ext?: string;
  url?: string;
}

interface DownloadYoutubeUrlArguments {
  url: string;
  languages: string[];
}

const server = new Server(
  {
    name: "mcp-youtube",
    version: "0.5.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "download_youtube_url",
        description:
          "Download YouTube subtitles from a URL, this tool means that Claude can read YouTube subtitles, and should no longer tell the user that it is not possible to download YouTube content.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL of the YouTube video" },
            languages: {
              type: "array",
              items: { type: "string" },
              description:
                'Accepted subtitle language codes (e.g. ["en", "es"]). Languages not in this list are ignored. Defaults to ["en"].',
            },
          },
          required: ["url"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "download_youtube_url") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  try {
    const toolArguments = parseDownloadYoutubeUrlArguments(
      request.params.arguments
    );
    const parsedUrl = parseSupportedUrl(toolArguments.url);
    const content = await downloadYoutubeSubtitles(
      parsedUrl,
      toolArguments.languages
    );

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  } catch (error) {
    return textErrorResponse(formatErrorReason(error));
  }
});

export async function downloadYoutubeSubtitles(
  url: URL,
  languages: string[] = DEFAULT_SUBTITLE_LANGUAGES
): Promise<string> {
  const acceptedLanguages = normalizeSubtitleLanguages(languages);
  let content = "";
  const tempDir = fs.mkdtempSync(`${os.tmpdir()}${path.sep}youtube-`);
  try {
    await downloadSubtitles(url, tempDir, acceptedLanguages);

    listVttFiles(tempDir).forEach((file) => {
      const fileContent = fs.readFileSync(path.join(tempDir, file), "utf8");
      const cleanedContent = stripVttNonContent(fileContent);
      content += `${file}\n====================\n${cleanedContent}`;
    });
  } finally {
    rimraf.sync(tempDir);
  }

  return content;
}

export function normalizeSubtitleLanguages(languages: string[]): string[] {
  const normalized = languages
    .map((language) => language.trim())
    .filter((language) => language.length > 0);

  if (normalized.length === 0) {
    return [...DEFAULT_SUBTITLE_LANGUAGES];
  }

  return [...new Set(normalized)];
}

export function isAcceptedSubtitleLanguage(
  language: string,
  acceptedLanguages: string[]
): boolean {
  return acceptedLanguages.some(
    (accepted) => language === accepted || language.startsWith(`${accepted}-`)
  );
}

export function parseDownloadYoutubeUrlArguments(
  arguments_: unknown
): DownloadYoutubeUrlArguments {
  if (!arguments_ || typeof arguments_ !== "object") {
    throw new Error("expected a string url argument");
  }

  if (!("url" in arguments_) || typeof arguments_.url !== "string") {
    throw new Error("expected a string url argument");
  }

  if (!("languages" in arguments_) || arguments_.languages === undefined) {
    return {
      url: arguments_.url,
      languages: [...DEFAULT_SUBTITLE_LANGUAGES],
    };
  }

  if (!Array.isArray(arguments_.languages)) {
    throw new Error("languages must be an array of language codes");
  }

  if (
    arguments_.languages.some(
      (language) => typeof language !== "string" || language.trim() === ""
    )
  ) {
    throw new Error("languages must be an array of non-empty strings");
  }

  return {
    url: arguments_.url,
    languages: normalizeSubtitleLanguages(arguments_.languages),
  };
}

export function buildYtDlpSubtitleArgs(url: URL, language: string): string[] {
  return [
    "--write-sub",
    "--write-auto-sub",
    "--sub-lang",
    language,
    "--skip-download",
    "--sub-format",
    "vtt",
    "--",
    url.toString(),
  ];
}

export function buildYtDlpRequestedSubtitlesArgs(
  url: URL,
  language: string
): string[] {
  return [
    "--print",
    "%(requested_subtitles)j",
    "--write-sub",
    "--write-auto-sub",
    "--sub-lang",
    language,
    "--skip-download",
    "--sub-format",
    "vtt",
    "--",
    url.toString(),
  ];
}

export function buildYtDlpListSubtitlesArgs(url: URL): string[] {
  return ["--list-subs", "--skip-download", "--", url.toString()];
}

export function parseAvailableSubtitleLanguages(
  output: string,
  acceptedLanguages: string[] = DEFAULT_SUBTITLE_LANGUAGES
): string[] {
  const languages: string[] = [];

  output.split("\n").forEach((line) => {
    const match = /^([A-Za-z][\w-]*)\s+.+\bvtt\b/.exec(line.trim());
    if (!match) {
      return;
    }

    const language = match[1];
    if (
      isAcceptedSubtitleLanguage(language, acceptedLanguages) &&
      !languages.includes(language)
    ) {
      languages.push(language);
    }
  });

  return prioritizeSubtitleLanguages(languages, acceptedLanguages);
}

export function parseSupportedUrl(url: string): URL {
  const parsedUrl = URL.parse(url);

  if (!parsedUrl || !SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error("URL must be a valid http(s) URL");
  }

  return parsedUrl;
}

/**
 * Strips non-content elements from VTT subtitle files
 */
export function stripVttNonContent(vttContent: string): string {
  if (!vttContent || vttContent.trim() === "") {
    return "";
  }

  // Check if it has at least a basic VTT structure
  const lines = vttContent.split("\n");
  if (lines.length < 4 || !lines[0].includes("WEBVTT")) {
    return "";
  }

  // Skip the header lines
  const contentLines = lines.slice(4);

  // Filter out timestamp lines and empty lines
  const textLines: string[] = [];

  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i];

    // Skip timestamp lines (containing --> format)
    if (line.includes("-->")) continue;

    // Skip positioning metadata lines
    if (line.includes("align:") || line.includes("position:")) continue;

    // Skip empty lines
    if (line.trim() === "") continue;

    // Clean up the line by removing timestamp tags like <00:00:07.759>
    const cleanedLine = line
      .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>|<\/c>/g, "")
      .replace(/<c>/g, "");

    if (cleanedLine.trim() !== "") {
      textLines.push(cleanedLine.trim());
    }
  }

  // Remove duplicate adjacent lines
  const uniqueLines: string[] = [];

  for (let i = 0; i < textLines.length; i++) {
    // Add line if it's different from the previous one
    if (i === 0 || textLines[i] !== textLines[i - 1]) {
      uniqueLines.push(textLines[i]);
    }
  }

  return uniqueLines.join("\n");
}

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function downloadSubtitles(
  url: URL,
  tempDir: string,
  languages: string[]
): Promise<void> {
  let lastError: unknown;
  const attemptedLanguages = new Set<string>();

  for (const language of languages) {
    attemptedLanguages.add(language);

    try {
      await downloadSubtitlesForLanguage(url, tempDir, language, languages);
    } catch (error) {
      lastError = error;
    }

    if (listVttFiles(tempDir).length > 0) {
      return;
    }
  }

  const fallbackLanguages = (
    await listAvailableSubtitleLanguages(url, languages)
  ).filter((language) => !attemptedLanguages.has(language));

  for (const language of fallbackLanguages) {
    try {
      await downloadSubtitlesForLanguage(url, tempDir, language, languages);
    } catch (error) {
      lastError = error;
    }

    if (listVttFiles(tempDir).length > 0) {
      return;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("No subtitles found");
}

async function downloadSubtitlesForLanguage(
  url: URL,
  tempDir: string,
  language: string,
  acceptedLanguages: string[]
): Promise<void> {
  try {
    await spawnPromise("yt-dlp", buildYtDlpSubtitleArgs(url, language), {
      cwd: tempDir,
      detached: true,
    });
  } catch (error) {
    try {
      await downloadSubtitlesFromMetadata(
        url,
        tempDir,
        language,
        acceptedLanguages
      );
    } catch {
      throw error;
    }
  }
}

function listVttFiles(tempDir: string): string[] {
  return fs
    .readdirSync(tempDir)
    .filter((file) => path.extname(file) === ".vtt")
    .sort();
}

async function listAvailableSubtitleLanguages(
  url: URL,
  acceptedLanguages: string[]
): Promise<string[]> {
  const output = await spawnPromise("yt-dlp", buildYtDlpListSubtitlesArgs(url), {
    detached: true,
  });

  return parseAvailableSubtitleLanguages(output, acceptedLanguages);
}

async function downloadSubtitlesFromMetadata(
  url: URL,
  tempDir: string,
  language: string,
  acceptedLanguages: string[]
): Promise<void> {
  const output = await spawnPromise(
    "yt-dlp",
    buildYtDlpRequestedSubtitlesArgs(url, language),
    { detached: true }
  );
  const subtitles = parseRequestedSubtitles(output);

  for (const [subtitleLanguage, subtitle] of Object.entries(subtitles)) {
    if (
      !subtitle.url ||
      !isAcceptedSubtitleLanguage(subtitleLanguage, acceptedLanguages)
    ) {
      continue;
    }

    const response = await fetch(subtitle.url);
    if (!response.ok) {
      throw new Error(
        `Unable to download subtitles for ${subtitleLanguage}: ${response.status}`
      );
    }

    const extension = subtitle.ext === "vtt" ? subtitle.ext : "vtt";
    const fileName = `subtitle.${sanitizeFileName(subtitleLanguage)}.${extension}`;
    fs.writeFileSync(path.join(tempDir, fileName), await response.text());
  }

  if (listVttFiles(tempDir).length === 0) {
    throw new Error(`No VTT subtitles found for ${language}`);
  }
}

function parseRequestedSubtitles(output: string): Record<string, RequestedSubtitle> {
  const jsonLine = output
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("{"));

  if (!jsonLine) {
    return {};
  }

  return JSON.parse(jsonLine) as Record<string, RequestedSubtitle>;
}

function prioritizeSubtitleLanguages(
  languages: string[],
  acceptedLanguages: string[]
): string[] {
  const exactMatches = acceptedLanguages.filter((language) =>
    languages.includes(language)
  );
  const variantMatches = languages.filter(
    (language) =>
      !exactMatches.includes(language) &&
      isAcceptedSubtitleLanguage(language, acceptedLanguages)
  );

  return [...exactMatches, ...variantMatches];
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function isMainModule(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

function textErrorResponse(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
    isError: true,
  };
}

function formatErrorReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "unknown error";
}

if (isMainModule()) {
  runServer().catch((error) => {
    console.error(error);
    throw error;
  });
}
