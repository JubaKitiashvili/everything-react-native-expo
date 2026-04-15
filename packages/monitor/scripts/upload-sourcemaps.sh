#!/usr/bin/env bash
# @erne/monitor — source map upload script
#
# Finds .map files in build output and uploads them to the configured
# endpoint. Designed to run as a post-build step in EAS Build or CI.
#
# Required environment variables:
#   ERNE_SOURCEMAP_ENDPOINT — URL to upload source maps to
#   ERNE_APP_VERSION        — App version (e.g., "1.2.3")
#   ERNE_BUILD_NUMBER       — Build number (e.g., "42")
#   ERNE_BUNDLE_ID          — Bundle identifier (e.g., "com.myapp")
#
# Optional:
#   EAS_BUILD_PLATFORM      — "ios" or "android" (set by EAS Build)
#   ERNE_SOURCEMAP_DIR      — Directory to search for .map files (default: ".")
#
# Non-zero exit does NOT fail the build (use with || true in CI).
set -euo pipefail

ENDPOINT="${ERNE_SOURCEMAP_ENDPOINT:-}"
APP_VERSION="${ERNE_APP_VERSION:-unknown}"
BUILD_NUMBER="${ERNE_BUILD_NUMBER:-0}"
BUNDLE_ID="${ERNE_BUNDLE_ID:-unknown}"
PLATFORM="${EAS_BUILD_PLATFORM:-unknown}"
SEARCH_DIR="${ERNE_SOURCEMAP_DIR:-.}"

if [ -z "${ENDPOINT}" ]; then
  echo "[erne-monitor] ERNE_SOURCEMAP_ENDPOINT not set — skipping source map upload."
  exit 0
fi

echo "[erne-monitor] Uploading source maps to ${ENDPOINT}..."
echo "[erne-monitor] Version: ${APP_VERSION}, Build: ${BUILD_NUMBER}, Platform: ${PLATFORM}"

# Find .map files in the search directory
MAPS=$(find "${SEARCH_DIR}" -name "*.map" -type f 2>/dev/null || true)

if [ -z "${MAPS}" ]; then
  echo "[erne-monitor] No source map files found in ${SEARCH_DIR} — skipping upload."
  exit 0
fi

UPLOADED=0
SKIPPED=0
FAILED=0

for MAP_FILE in ${MAPS}; do
  FILENAME=$(basename "${MAP_FILE}")
  FILESIZE=$(wc -c < "${MAP_FILE}" | tr -d ' ')

  echo "[erne-monitor] Processing ${FILENAME} (${FILESIZE} bytes)..."

  # Dedup check: HEAD request to see if this version already exists
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "X-App-Version: ${APP_VERSION}" \
    -H "X-Build-Number: ${BUILD_NUMBER}" \
    -H "X-Platform: ${PLATFORM}" \
    -H "X-Bundle-Id: ${BUNDLE_ID}" \
    -H "X-Filename: ${FILENAME}" \
    --head "${ENDPOINT}" 2>/dev/null || echo "000")

  if [ "${HTTP_STATUS}" = "200" ]; then
    echo "[erne-monitor] Source map ${FILENAME} already uploaded — skipping."
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Upload the source map
  UPLOAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${ENDPOINT}" \
    -H "X-App-Version: ${APP_VERSION}" \
    -H "X-Build-Number: ${BUILD_NUMBER}" \
    -H "X-Platform: ${PLATFORM}" \
    -H "X-Bundle-Id: ${BUNDLE_ID}" \
    -H "Content-Type: application/octet-stream" \
    -H "X-Filename: ${FILENAME}" \
    --data-binary "@${MAP_FILE}" 2>/dev/null || echo "000")

  if [ "${UPLOAD_STATUS}" -ge 200 ] && [ "${UPLOAD_STATUS}" -lt 300 ] 2>/dev/null; then
    echo "[erne-monitor] Uploaded ${FILENAME} (HTTP ${UPLOAD_STATUS})"
    UPLOADED=$((UPLOADED + 1))
  else
    echo "[erne-monitor] Failed to upload ${FILENAME} (HTTP ${UPLOAD_STATUS})"
    FAILED=$((FAILED + 1))
  fi
done

echo "[erne-monitor] Source map upload complete: ${UPLOADED} uploaded, ${SKIPPED} skipped, ${FAILED} failed."

# Always exit 0 — source map upload failures must never fail the build
exit 0
