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
import { spawnPromise } from "spawn-rx";
import { rimraf } from "rimraf";

const server = new Server(
  {
    name: "mcp-youtube",
    version: "0.6.0",
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
          "Download YouTube subtitles from a URL. Supports multiple languages and formats. Claude can read YouTube subtitles and analyze video content through this tool.",
        inputSchema: {
          type: "object",
          properties: {
            url: { 
              type: "string", 
              description: "URL of the YouTube video (supports youtube.com, youtu.be, etc.)" 
            },
            language: { 
              type: "string", 
              description: "Preferred subtitle language (e.g., 'en', 'es', 'fr'). Defaults to 'en' if not specified.",
              default: "en"
            },
            format: {
              type: "string",
              description: "Subtitle format preference ('vtt', 'srt', 'ass'). Defaults to 'vtt' if not specified.",
              default: "vtt"
            }
          },
          required: ["url"],
        },
      },
    ],
  };
});

/**
 * Validates if a URL is a valid YouTube URL
 */
function isValidYouTubeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // Only allow HTTPS protocol
    if (urlObj.protocol !== "https:") {
      return false;
    }
    return (
      (urlObj.hostname === "www.youtube.com" || urlObj.hostname === "youtube.com" || urlObj.hostname === "youtu.be") &&
      (urlObj.pathname.includes("/watch") || urlObj.pathname.includes("/shorts") || urlObj.hostname === "youtu.be")
    );
  } catch {
    return false;
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "download_youtube_url") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  try {
    const { url, language = "en", format = "vtt" } = request.params.arguments as { 
      url: string; 
      language?: string; 
      format?: string; 
    };

    // Validate URL
    if (!isValidYouTubeUrl(url)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Invalid YouTube URL. Please provide a valid YouTube video URL (e.g., https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID)`,
          },
        ],
        isError: true,
      };
    }

    // Validate format
    const validFormats = ["vtt", "srt", "ass"];
    if (!validFormats.includes(format.toLowerCase())) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Invalid subtitle format '${format}'. Supported formats: ${validFormats.join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    const tempDir = fs.mkdtempSync(`${os.tmpdir()}${path.sep}youtube-`);
    
    // Build yt-dlp command with improved options
    const ytdlpArgs = [
      "--write-sub",
      "--write-auto-sub",
      "--sub-lang",
      language,
      "--skip-download",
      "--sub-format",
      format.toLowerCase(),
      "--no-warnings",
      "--quiet",
      url,
    ];

    await spawnPromise("yt-dlp", ytdlpArgs, { 
      cwd: tempDir, 
      detached: true,
      timeout: 30000 // 30 second timeout
    });

    let content = "";
    let subtitleFiles: string[] = [];
    
    try {
      const files = fs.readdirSync(tempDir);
      subtitleFiles = files.filter(file => 
        file.endsWith(`.${format.toLowerCase()}`) || 
        file.endsWith('.vtt') || 
        file.endsWith('.srt') || 
        file.endsWith('.ass')
      );

      if (subtitleFiles.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No subtitles found for this video in language '${language}'. The video may not have subtitles available, or they may not be available in the requested language.`,
            },
          ],
          isError: true,
        };
      }

      subtitleFiles.forEach((file) => {
        const fileContent = fs.readFileSync(path.join(tempDir, file), "utf8");
        const cleanedContent = stripVttNonContent(fileContent);
        if (cleanedContent.trim()) {
          content += `\n--- ${file} ---\n${cleanedContent}\n`;
        }
      });

      if (!content.trim()) {
        return {
          content: [
            {
              type: "text",
              text: `Subtitles were downloaded but contained no readable content. This may be due to formatting issues or empty subtitle files.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Successfully downloaded subtitles for YouTube video:\n${url}\n\nLanguage: ${language}\nFormat: ${format}\nFiles processed: ${subtitleFiles.join(", ")}\n\n${content}`,
          },
        ],
      };
    } finally {
      rimraf.sync(tempDir);
    }
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error downloading video subtitles: ${err instanceof Error ? err.message : String(err)}. Please ensure yt-dlp is installed and the video URL is accessible.`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Strips non-content elements from VTT subtitle files
 * 
 * This function processes WebVTT subtitle content by:
 * - Removing timestamp markers (e.g., "00:00:01.000 --> 00:00:03.000")
 * - Removing positioning metadata (align:, position:)
 * - Cleaning up HTML-like tags (e.g., <c>, </c>, <00:00:07.759>)
 * - Removing duplicate adjacent lines
 * - Filtering out empty lines
 * 
 * @param vttContent - Raw VTT subtitle content as a string
 * @returns Cleaned subtitle text with only the spoken content
 * 
 * @example
 * ```typescript
 * const vtt = `WEBVTT
 * 00:00:01.000 --> 00:00:03.000
 * Hello world
 * 00:00:03.000 --> 00:00:05.000
 * <c>This is formatted text</c>`;
 * 
 * const cleaned = stripVttNonContent(vtt);
 * // Returns: "Hello world\nThis is formatted text"
 * ```
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

runServer().catch(console.error);
