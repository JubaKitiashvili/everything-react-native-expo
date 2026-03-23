#!/bin/sh
# Portable hook runner — resolves path relative to this script's location
# Usage: erne-hook.sh <hook-script.js>
# This avoids hardcoded absolute paths in settings.local.json

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/run-with-flags.js" "$@"
