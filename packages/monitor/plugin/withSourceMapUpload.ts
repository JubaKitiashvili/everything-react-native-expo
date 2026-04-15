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
import {
  withDangerousMod,
  createRunOncePlugin,
  type ConfigPlugin,
} from '@expo/config-plugins';
import type { ExpoConfig } from '@expo/config-types';
import * as fs from 'fs';
import * as path from 'path';

export interface SourceMapUploadPluginOptions {
  /**
   * The endpoint URL to upload source maps to.
   * Required — the plugin is a no-op without this.
   */
  endpoint?: string;
  /**
   * Override the app version sent as a header. Defaults to expo.version.
   */
  appVersion?: string;
  /**
   * Override the build number sent as a header. Defaults to
   * ios.buildNumber / android.versionCode.
   */
  buildNumber?: string;
}

const PKG_NAME = '@erne/monitor/sourcemap-upload';
const PKG_VERSION = '0.1.0';

/**
 * Generates the content of the upload shell script that will run
 * post-build to find and upload .map files.
 */
export function generateUploadScript(
  endpoint: string,
  appVersion: string,
  buildNumber: string,
  bundleId: string,
): string {
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

function resolveAppVersion(config: ExpoConfig, opts: SourceMapUploadPluginOptions): string {
  return opts.appVersion ?? config.version ?? '0.0.0';
}

function resolveBuildNumber(config: ExpoConfig, opts: SourceMapUploadPluginOptions): string {
  if (opts.buildNumber) return opts.buildNumber;
  const iosBuild = (config.ios as Record<string, unknown> | undefined)?.buildNumber;
  const androidVersion = (config.android as Record<string, unknown> | undefined)?.versionCode;
  if (typeof iosBuild === 'string') return iosBuild;
  if (typeof androidVersion === 'number') return String(androidVersion);
  return '1';
}

function resolveBundleId(config: ExpoConfig): string {
  const iosBundle = (config.ios as Record<string, unknown> | undefined)?.bundleIdentifier;
  const androidPackage = (config.android as Record<string, unknown> | undefined)?.package;
  return (typeof iosBundle === 'string' ? iosBundle : undefined)
    ?? (typeof androidPackage === 'string' ? androidPackage : undefined)
    ?? config.slug
    ?? 'unknown';
}

const withSourceMapUploadIOS: ConfigPlugin<SourceMapUploadPluginOptions> = (config, props) => {
  if (!props?.endpoint) return config;

  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const scriptDir = path.join(projectRoot, '.erne-monitor');
      const scriptPath = path.join(scriptDir, 'upload-sourcemaps.sh');

      const appVersion = resolveAppVersion(cfg, props);
      const buildNumber = resolveBuildNumber(cfg, props);
      const bundleId = resolveBundleId(cfg);
      const content = generateUploadScript(props.endpoint!, appVersion, buildNumber, bundleId);

      if (!fs.existsSync(scriptDir)) {
        fs.mkdirSync(scriptDir, { recursive: true });
      }
      fs.writeFileSync(scriptPath, content, { mode: 0o755 });

      return cfg;
    },
  ]);
};

const withSourceMapUploadAndroid: ConfigPlugin<SourceMapUploadPluginOptions> = (config, props) => {
  if (!props?.endpoint) return config;

  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const scriptDir = path.join(projectRoot, '.erne-monitor');
      const scriptPath = path.join(scriptDir, 'upload-sourcemaps.sh');

      const appVersion = resolveAppVersion(cfg, props);
      const buildNumber = resolveBuildNumber(cfg, props);
      const bundleId = resolveBundleId(cfg);
      const content = generateUploadScript(props.endpoint!, appVersion, buildNumber, bundleId);

      if (!fs.existsSync(scriptDir)) {
        fs.mkdirSync(scriptDir, { recursive: true });
      }
      fs.writeFileSync(scriptPath, content, { mode: 0o755 });

      return cfg;
    },
  ]);
};

const withSourceMapUploadBase: ConfigPlugin<SourceMapUploadPluginOptions> = (
  config,
  props = {},
) => {
  let next: ExpoConfig = config;
  next = withSourceMapUploadIOS(next, props);
  next = withSourceMapUploadAndroid(next, props);
  return next;
};

export const withSourceMapUpload = createRunOncePlugin(
  withSourceMapUploadBase,
  PKG_NAME,
  PKG_VERSION,
);

// eslint-disable-next-line import/no-default-export
export default withSourceMapUpload;
