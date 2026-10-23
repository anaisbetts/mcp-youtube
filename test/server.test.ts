import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type SubtitleDownloader } from "../src";

const TEST_YOUTUBE_URL = "https://www.youtube.com/watch?v=test";
const FIRST_VTT = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000
First subtitle

00:00:02.000 --> 00:00:04.000
First subtitle

00:00:04.000 --> 00:00:06.000
Second subtitle`;
const SECOND_VTT = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000
<c>Another</c> <00:00:01.000>caption</c>`;

type TestConnection = {
  client: Client;
  close: () => Promise<void>;
};

describe("MCP server", () => {
  let connection: TestConnection | undefined;

  it("supports protocol revision 2025-11-25", async () => {
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain("2025-11-25");
    connection = await connectTestServer();
    expect(connection.client.getServerCapabilities()).toEqual({ tools: {} });
  });

  afterEach(async () => {
    await connection?.close();
    connection = undefined;
  });

  it("advertises tool capability during initialization", async () => {
    connection = await connectTestServer();

    expect(connection.client.getServerCapabilities()).toEqual({
      tools: {},
    });
  });

  it("lists the YouTube subtitle downloader tool", async () => {
    connection = await connectTestServer();

    const result = await connection.client.listTools();

    expect(result.tools).toEqual([
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
    ]);
  });

  it("returns cleaned subtitle text from a tool call", async () => {
    connection = await connectTestServer(async (_url, tempDir) => {
      fs.writeFileSync(path.join(tempDir, "video.en.vtt"), FIRST_VTT);
    });

    const result = await connection.client.callTool({
      name: "download_youtube_url",
      arguments: { url: TEST_YOUTUBE_URL },
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      {
        type: "text",
        text: "video.en.vtt\n====================\nFirst subtitle\nSecond subtitle",
      },
    ]);
  });

  it("includes multiple VTT files in sorted order", async () => {
    connection = await connectTestServer(async (_url, tempDir) => {
      fs.writeFileSync(path.join(tempDir, "z-video.en.vtt"), SECOND_VTT);
      fs.writeFileSync(path.join(tempDir, "a-video.en.vtt"), FIRST_VTT);
    });

    const result = await connection.client.callTool({
      name: "download_youtube_url",
      arguments: { url: TEST_YOUTUBE_URL },
    });
    const text = getToolText(result.content);

    expect(text).toContain(
      "a-video.en.vtt\n====================\nFirst subtitle\nSecond subtitle"
    );
    expect(text).toContain(
      "z-video.en.vtt\n====================\nAnother caption"
    );
    expect(text.indexOf("a-video.en.vtt")).toBeLessThan(
      text.indexOf("z-video.en.vtt")
    );
  });

  it("returns a tool error for invalid URLs", async () => {
    connection = await connectTestServer();

    const result = await connection.client.callTool({
      name: "download_youtube_url",
      arguments: { url: "file:///etc/passwd" },
    });
    const text = getToolText(result.content);

    expect(result.isError).toBe(true);
    expect(text).toContain("URL must be a valid http(s) URL");
  });

  it("returns a tool error when subtitle download fails", async () => {
    connection = await connectTestServer(async () => {
      throw new Error("yt-dlp failed");
    });

    const result = await connection.client.callTool({
      name: "download_youtube_url",
      arguments: { url: TEST_YOUTUBE_URL },
    });
    const text = getToolText(result.content);

    expect(result.isError).toBe(true);
    expect(text).toContain("yt-dlp failed");
  });

  it("rejects unknown tool calls", async () => {
    connection = await connectTestServer();

    await expect(
      connection.client.callTool({
        name: "not_a_tool",
        arguments: { url: TEST_YOUTUBE_URL },
      })
    ).rejects.toThrow("Unknown tool: not_a_tool");
  });
});

async function connectTestServer(
  downloadSubtitles: SubtitleDownloader = async () => {}
): Promise<TestConnection> {
  const client = new Client(
    {
      name: "test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );
  const server = createServer({ downloadSubtitles });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  return {
    client,
    close: async () => {
      await Promise.allSettled([client.close(), server.close()]);
    },
  };
}

function getToolText(
  content: Awaited<ReturnType<Client["callTool"]>>["content"]
): string {
  expect(content).toHaveLength(1);
  expect(content[0].type).toBe("text");

  if (content[0].type !== "text") {
    throw new Error("Expected text tool content");
  }

  return content[0].text;
}
