# YouTube MCP Server

A Model Context Protocol (MCP) server that enables Claude AI to download and analyze YouTube video subtitles. This tool allows Claude to read, summarize, and analyze YouTube video content by extracting subtitle text.

## Features

- 🎬 **YouTube Video Support**: Works with regular videos, shorts, and various YouTube URL formats
- 🌍 **Multi-language Support**: Download subtitles in any available language
- 📝 **Multiple Formats**: Support for VTT, SRT, and ASS subtitle formats
- 🔍 **Smart Processing**: Automatically cleans and processes subtitle content
- ⚡ **Fast & Reliable**: Built with TypeScript and optimized for performance
- 🛡️ **Error Handling**: Comprehensive validation and error reporting

## Prerequisites

- **yt-dlp**: Required for downloading YouTube content
- **Node.js**: Version 18 or higher
- **Bun**: For development and building

## Installation

### Option 1: Using MCP Installer (Recommended)

1. Install `yt-dlp`:
   ```bash
   # macOS
   brew install yt-dlp
   
   # Windows
   winget install yt-dlp
   
   # Linux
   pip install yt-dlp
   ```

2. Install the MCP server:
   ```bash
   npx @anaisbetts/mcp-installer install @anaisbetts/mcp-youtube
   ```

### Option 2: Manual Installation

1. Clone this repository
2. Install dependencies: `bun install`
3. Build the project: `bun run prepublish`
4. Configure in your MCP client

## Usage

Once installed, you can ask Claude to analyze YouTube videos:

- "Summarize this YouTube video: https://www.youtube.com/watch?v=VIDEO_ID"
- "What are the main points in this video: https://youtu.be/VIDEO_ID"
- "Analyze the content of this YouTube short: https://youtube.com/shorts/VIDEO_ID"

## Configuration

The MCP server supports optional parameters:

- **language**: Subtitle language (e.g., 'en', 'es', 'fr') - defaults to 'en'
- **format**: Subtitle format ('vtt', 'srt', 'ass') - defaults to 'vtt'

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build project
bun run prepublish
```

## Contributing

Contributions are welcome! Please read our [Code of Conduct](CODE_OF_CONDUCT.md) and feel free to submit issues and pull requests.