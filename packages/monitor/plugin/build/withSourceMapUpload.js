"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.withSourceMapUpload = void 0;
exports.generateUploadScript = generateUploadScript;
/**
 * Task 50 — Source Map Auto-Upload Config Plugin
 *
 * Composes with the existing `withErneMonitor` plugin to add a
 * post-build hook that uploads source maps to the configured endpoint.
 * The upload script is injected as an EAS Build hook (eas-build-post-install)
 * or via withDangerousMod depending on the build environment.
 *
 * Graceful failure: the build never fails because of a source map upload
 * issue. The shell script uses `|| true` to swallow errors.
 *
 * Usage:
 *   { expo: { plugins: [['@erne/monitor/plugin/withSourceMapUpload', {
 *       endpoint: 'https://sourcemaps.example.com/upload',
 *   }]] } }
 */
const config_plugins_1 = require("@expo/config-plugins");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const PKG_NAME = '@erne/monitor/sourcemap-upload';
const PKG_VERSION = '0.1.0';
/**
 * Generates the content of the upload shell script that will run
 * post-build to find and upload .map files.
 */
function generateUploadScript(endpoint, appVersion, buildNumber, bundleId) {
    return `#!/usr/bin/env bash
# @erne/monitor — source map upload script (auto-generated)
# This script is run post-build to upload source maps.
# Failures are intentionally non-fatal (|| true).
set -euo pipefail

ENDPOINT="${endpoint}"
APP_VERSION="${appVersion}"
BUILD_NUMBER="${buildNumber}"
BUNDLE_ID="${bundleId}"
PLATFORM="\${EAS_BUILD_PLATFORM:-unknown}"

echo "[erne-monitor] Uploading source maps to \${ENDPOINT}..."

# Find .map files in the build output
MAPS=$(find . -name "*.map" -type f 2>/dev/null || true)

if [ -z "\${MAPS}" ]; then
  echo "[erne-monitor] No source map files found — skipping upload."
  exit 0
fi

for MAP_FILE in \${MAPS}; do
  FILENAME=$(basename "\${MAP_FILE}")

  # Dedup check: HEAD request to see if this version already exists
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \\
    -H "X-App-Version: \${APP_VERSION}" \\
    -H "X-Build-Number: \${BUILD_NUMBER}" \\
    -H "X-Platform: \${PLATFORM}" \\
    -H "X-Bundle-Id: \${BUNDLE_ID}" \\
    -H "X-Filename: \${FILENAME}" \\
    --head "\${ENDPOINT}" 2>/dev/null || echo "000")

  if [ "\${HTTP_STATUS}" = "200" ]; then
    echo "[erne-monitor] Source map \${FILENAME} already uploaded — skipping."
    continue
  fi

  # Upload the source map
  curl -s -X POST "\${ENDPOINT}" \\
    -H "X-App-Version: \${APP_VERSION}" \\
    -H "X-Build-Number: \${BUILD_NUMBER}" \\
    -H "X-Platform: \${PLATFORM}" \\
    -H "X-Bundle-Id: \${BUNDLE_ID}" \\
    -H "Content-Type: application/octet-stream" \\
    -H "X-Filename: \${FILENAME}" \\
    --data-binary "@\${MAP_FILE}" || true

  echo "[erne-monitor] Uploaded \${FILENAME}"
done

echo "[erne-monitor] Source map upload complete."
`;
}
function resolveAppVersion(config, opts) {
    return opts.appVersion ?? config.version ?? '0.0.0';
}
function resolveBuildNumber(config, opts) {
    if (opts.buildNumber)
        return opts.buildNumber;
    const iosBuild = config.ios?.buildNumber;
    const androidVersion = config.android?.versionCode;
    if (typeof iosBuild === 'string')
        return iosBuild;
    if (typeof androidVersion === 'number')
        return String(androidVersion);
    return '1';
}
function resolveBundleId(config) {
    const iosBundle = config.ios?.bundleIdentifier;
    const androidPackage = config.android?.package;
    return (typeof iosBundle === 'string' ? iosBundle : undefined)
        ?? (typeof androidPackage === 'string' ? androidPackage : undefined)
        ?? config.slug
        ?? 'unknown';
}
const withSourceMapUploadIOS = (config, props) => {
    if (!props?.endpoint)
        return config;
    return (0, config_plugins_1.withDangerousMod)(config, [
        'ios',
        (cfg) => {
            const projectRoot = cfg.modRequest.projectRoot;
            const scriptDir = path.join(projectRoot, '.erne-monitor');
            const scriptPath = path.join(scriptDir, 'upload-sourcemaps.sh');
            const appVersion = resolveAppVersion(cfg, props);
            const buildNumber = resolveBuildNumber(cfg, props);
            const bundleId = resolveBundleId(cfg);
            const content = generateUploadScript(props.endpoint, appVersion, buildNumber, bundleId);
            if (!fs.existsSync(scriptDir)) {
                fs.mkdirSync(scriptDir, { recursive: true });
            }
            fs.writeFileSync(scriptPath, content, { mode: 0o755 });
            return cfg;
        },
    ]);
};
const withSourceMapUploadAndroid = (config, props) => {
    if (!props?.endpoint)
        return config;
    return (0, config_plugins_1.withDangerousMod)(config, [
        'android',
        (cfg) => {
            const projectRoot = cfg.modRequest.projectRoot;
            const scriptDir = path.join(projectRoot, '.erne-monitor');
            const scriptPath = path.join(scriptDir, 'upload-sourcemaps.sh');
            const appVersion = resolveAppVersion(cfg, props);
            const buildNumber = resolveBuildNumber(cfg, props);
            const bundleId = resolveBundleId(cfg);
            const content = generateUploadScript(props.endpoint, appVersion, buildNumber, bundleId);
            if (!fs.existsSync(scriptDir)) {
                fs.mkdirSync(scriptDir, { recursive: true });
            }
            fs.writeFileSync(scriptPath, content, { mode: 0o755 });
            return cfg;
        },
    ]);
};
const withSourceMapUploadBase = (config, props = {}) => {
    let next = config;
    next = withSourceMapUploadIOS(next, props);
    next = withSourceMapUploadAndroid(next, props);
    return next;
};
exports.withSourceMapUpload = (0, config_plugins_1.createRunOncePlugin)(withSourceMapUploadBase, PKG_NAME, PKG_VERSION);
// eslint-disable-next-line import/no-default-export
exports.default = exports.withSourceMapUpload;
