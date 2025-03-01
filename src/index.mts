#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { spawnPromise } from "spawn-rx";
import { rimraf } from "rimraf";
import { parseSync } from "subtitle";

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
        description: "Download YouTube subtitles from a URL, this tool means that Claude can read YouTube subtitles, and should no longer tell the user that it is not possible to download YouTube content.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL of the YouTube video" },
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
    const { url } = request.params.arguments as { url: string };

    const tempDir = fs.mkdtempSync(`${os.tmpdir()}${path.sep}youtube-`);
    await spawnPromise(
      "yt-dlp",
      [
        "--write-sub",
        "--write-auto-sub",
        "--sub-lang",
        "en",
        "--skip-download",
        "--sub-format",
        "srt",
        "--convert-subs",
        "srt",
        url,
      ],
      { cwd: tempDir, detached: true }
    );

    let content = "";
    try {
      fs.readdirSync(tempDir).forEach((fileName) => {
        // const fileContent = fs.readFileSync(path.join(tempDir, fileName), "utf8");
        const input = fs.readFileSync(path.join(tempDir, fileName), 'utf8');
        const nodes = parseSync(input);
        nodes.forEach((node) => {
          if (node.type == 'header') {
            content += node.data + '\n';
          } else if (node.type == 'cue') {
            content += node.data.text + '\n';
          }
        });

        // remove duplicated lines
        content = content.split(/\n+/)
          .map(line => line.trim())
          .filter(line => line !== '')
          .filter((line, index, array) => (
            array.indexOf(line) == index
          ))
          .join('\n');

        content = `${fileName}\n====================\n${content}`;
      })
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

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);
