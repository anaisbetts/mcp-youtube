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
import process from "node:process";
import { spawnPromise } from "spawn-rx";
import { rimraf } from "rimraf";

const args = process.argv.slice(2);
let extraYtDlpArgs: string[] = [];

const argsIndex = args.indexOf('--args');
if (argsIndex !== -1 && argsIndex + 1 < args.length) {
  extraYtDlpArgs = args[argsIndex + 1].split(' ');
  console.log(`Extra yt-dlp arguments: ${extraYtDlpArgs.join(' ')}`);
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
            extraArgs: { 
              type: "string", 
              description: "Extra arguments to pass to yt-dlp (optional)",
              default: "" 
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
    const { url, extraArgs } = request.params.arguments as { 
      url: string;
      extraArgs?: string;
    };

    const tempDir = fs.mkdtempSync(`${os.tmpdir()}${path.sep}youtube-`);
    
    // prepare yt-dlp default arguments
    const ytDlpArgs = [
      "--write-sub",
      "--write-auto-sub",
      "--sub-lang",
      "en",
      "--skip-download",
      "--sub-format",
      "vtt",
    ];
    
    // add extra args from cmdline
    ytDlpArgs.push(...extraYtDlpArgs);
    
    // add extra args from API call
    if (extraArgs) {
      ytDlpArgs.push(...extraArgs.split(' '));
    }
    
    // add URL
    ytDlpArgs.push(url);
    
    await spawnPromise(
      "yt-dlp",
      ytDlpArgs,
      { cwd: tempDir, detached: true }
    );

    let content = "";
    try {
      fs.readdirSync(tempDir).forEach((file) => {
        const fileContent = fs.readFileSync(path.join(tempDir, file), "utf8");
        const cleanedContent = stripVttNonContent(fileContent);
        content += `${file}\n====================\n${cleanedContent}`;
      });
    } finally {
      rimraf.sync(tempDir);
    }

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error downloading video: ${err}`,
        },
      ],
      isError: true,
    };
  }
});

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

runServer().catch(console.error);
