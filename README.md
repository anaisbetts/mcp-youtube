# YouTube MCP Server

[![smithery badge](https://smithery.ai/badge/@anaisbetts/mcp-youtube)](https://smithery.ai/protocol/@anaisbetts/mcp-youtube)

Uses `yt-dlp` to download subtitles from YouTube and connects it to claude.ai via [Model Context Protocol](https://modelcontextprotocol.io/introduction). Try it by asking Claude, "Summarize the YouTube video <<URL>>". Requires `yt-dlp` to be installed locally e.g. via Homebrew.

### How do I get this working?

#### Installing via Smithery

To install YouTube MCP for Claude Desktop automatically via [Smithery](https://smithery.ai/protocol/@anaisbetts/mcp-youtube):

```bash
npx @smithery/cli install @anaisbetts/mcp-youtube --client claude
```

1. Install `yt-dlp` (Homebrew and WinGet both work great here)
