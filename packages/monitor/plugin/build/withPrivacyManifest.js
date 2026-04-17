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
exports.withPrivacyManifest = void 0;
/**
 * Privacy manifest config plugin for @erne/monitor.
 *
 * Apple requires SDKs listed in their "commonly used third-party SDKs"
 * list to ship a `PrivacyInfo.xcprivacy` describing every required-reason
 * API they call and every data type they collect. @erne/monitor ships
 * its manifest at `ios/PrivacyInfo.xcprivacy`, which CocoaPods picks up
 * via the pod's `resource_bundles` entry — this means consumer apps get
 * the manifest automatically with no manual steps.
 *
 * This plugin is a belt-and-suspenders layer:
 *   1. It verifies our bundled `PrivacyInfo.xcprivacy` file still exists
 *      at prebuild time. If a future refactor accidentally deletes it,
 *      the build fails fast with a clear error.
 *   2. It logs a one-line notice during prebuild so consumers know the
 *      SDK is contributing privacy declarations.
 *   3. It's composable — wrap another plugin around it without touching
 *      the Xcode project itself.
 *
 * If you need to declare additional data types or APIs at the app level
 * (e.g. your app also reads UserDefaults), add them to your app's own
 * top-level `PrivacyInfo.xcprivacy`. The app's manifest and every
 * SDK's manifest are unioned at build time — you never need to edit
 * @erne/monitor's file.
 *
 * References:
 *   https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
 *   https://developer.apple.com/support/third-party-SDK-requirements
 */
const config_plugins_1 = require("@expo/config-plugins");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const DEFAULT_MANIFEST = path.join(__dirname, '..', 'ios', 'PrivacyInfo.xcprivacy');
const withPrivacyManifest = (config, options) => {
    const opts = options ?? {};
    const manifestPath = opts.manifestPath ?? DEFAULT_MANIFEST;
    const strict = opts.strict ?? true;
    const logNotice = opts.logNotice ?? true;
    return (0, config_plugins_1.withDangerousMod)(config, [
        'ios',
        (cfg) => {
            if (!fs.existsSync(manifestPath)) {
                const message = `[@erne/monitor] Missing PrivacyInfo.xcprivacy at ${manifestPath}. The SDK ships this file via the CocoaPods pod_bundle; if it's gone the App Store will reject submissions.`;
                if (strict) {
                    throw new Error(message);
                }
                // eslint-disable-next-line no-console
                console.warn(message);
                return cfg;
            }
            if (logNotice) {
                // eslint-disable-next-line no-console
                console.log('[@erne/monitor] Privacy manifest contributed: crash data, performance data, other diagnostic data (all not-linked, not-tracking) + DiskSpace (85F4.1) + FileTimestamp (C617.1) required-reason APIs.');
            }
            return cfg;
        },
    ]);
};
exports.withPrivacyManifest = withPrivacyManifest;
// Default export so the plugin can be referenced as
// `@erne/monitor/plugin/withPrivacyManifest` in app.config.
// eslint-disable-next-line import/no-default-export
exports.default = exports.withPrivacyManifest;
