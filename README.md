# YouTube MCP Server

[![JavaScript](https://img.shields.io/badge/javascript-ES6+-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE) [![MCPAmpel](https://img.shields.io/endpoint?url=https://mcpampel.com/badge/anaisbetts/mcp-youtube.json)](https://mcpampel.com/repo/anaisbetts/mcp-youtube)

Uses `yt-dlp` to download subtitles from YouTube and connects it to claude.ai via [Model Context Protocol](https://modelcontextprotocol.io/introduction). Try it by asking Claude, "Summarize the YouTube video <<URL>>". Requires `yt-dlp` to be installed locally e.g. via Homebrew.

### How do I get this working?

1. Install `yt-dlp` (Homebrew and WinGet both work great here)
1. Now, install this via [mcp-installer](https://github.com/anaisbetts/mcp-installer), use the name `@anaisbetts/mcp-youtube`