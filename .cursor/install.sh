#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for @anaisbetts/mcp-youtube.
# Installs the toolchain the repo needs on top of Cursor's default image
# (which already provides node, python3, ffmpeg, git, and curl), then
# refreshes JS dependencies. Safe to run repeatedly.
set -euo pipefail

BIN_DIR="/usr/local/bin"

# Pick a way to write into a system bin dir without an interactive prompt.
if [ -w "$BIN_DIR" ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  SUDO="sudo"
else
  BIN_DIR="$HOME/.local/bin"
  SUDO=""
  mkdir -p "$BIN_DIR"
  echo "install.sh: no system bin access; installing tools into $BIN_DIR" >&2
fi

# bun: package manager, bundler, and test runner used by this repo.
if ! command -v bun >/dev/null 2>&1; then
  echo "install.sh: installing bun"
  export BUN_INSTALL="${BIN_DIR%/bin}"
  if [ -n "$SUDO" ]; then
    curl -fsSL https://bun.sh/install | $SUDO -E bash
  else
    curl -fsSL https://bun.sh/install | bash
  fi
fi

# deno: JS runtime yt-dlp uses for modern YouTube extraction.
if ! command -v deno >/dev/null 2>&1; then
  echo "install.sh: installing deno"
  export DENO_INSTALL="${BIN_DIR%/bin}"
  if [ -n "$SUDO" ]; then
    curl -fsSL https://deno.land/install.sh | $SUDO -E sh -s -- -y
  else
    curl -fsSL https://deno.land/install.sh | sh -s -- -y
  fi
fi

# yt-dlp: performs the actual subtitle download. Keep it current.
echo "install.sh: installing/updating yt-dlp"
$SUDO curl -fsSL \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o "$BIN_DIR/yt-dlp"
$SUDO chmod a+rx "$BIN_DIR/yt-dlp"

# Project dependencies (bun.lockb is committed, so keep it frozen).
echo "install.sh: installing JS dependencies"
bun install --frozen-lockfile

echo "install.sh: versions ->"
bun --version
deno --version | head -1
yt-dlp --version
node --version
echo "install.sh: done"
