# YouTube MCP Server

Uses `yt-dlp` to download subtitles from YouTube and connects it to claude.ai via [Model Context Protocol](https://modelcontextprotocol.io/introduction). Try it by asking Claude, "Summarize the YouTube video <<URL>>". Requires `yt-dlp` to be installed locally e.g. via Homebrew.

### Prerequisites

1. Install `yt-dlp` (Homebrew and WinGet both work great here)

### Installation

You can install this package using either mcp-get or mcp-installer:

#### Using mcp-get (Recommended)

```bash
npx @michaellatman/mcp-get@latest install @anaisbetts/mcp-youtube
```

#### Using mcp-installer

Install via [mcp-installer](https://github.com/anaisbetts/mcp-installer), use the name `@anaisbetts/mcp-youtube`
