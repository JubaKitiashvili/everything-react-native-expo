#!/bin/bash
# install.sh — ERNE installer for Claude Code / Cursor / Windsurf
# Usage: curl -fsSL https://erne.dev/install.sh | bash
# Or: git clone <repo> && cd everything-react-native-expo && ./install.sh

set -euo pipefail

ERNE_VERSION="0.10.5"
REPO_URL="https://github.com/JubaKitiashvili/everything-react-native-expo"

echo ""
echo "  erne v${ERNE_VERSION} — AI agent harness for React Native & Expo"
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || {
  echo "  ✗ Node.js is required. Install from https://nodejs.org/"
  exit 1
}

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "  ✗ Node.js 18+ required. Current: $(node -v)"
  exit 1
fi

echo "  ✓ Node.js $(node -v) detected"

# Check for npm
command -v npm >/dev/null 2>&1 || {
  echo "  ✗ npm is required."
  exit 1
}

# Determine install method
if [ -f "package.json" ]; then
  echo "  ✓ package.json found — installing locally"
  echo ""

  # Use npx to run init
  npx erne-universal init
else
  echo "  ⚠ No package.json found in current directory."
  echo "  Navigate to your React Native project first."
  echo ""
  echo "  Usage:"
  echo "    cd your-rn-project"
  echo "    npx erne-universal init"
  exit 1
fi
