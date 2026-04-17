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
import { type ConfigPlugin } from '@expo/config-plugins';
export interface WithPrivacyManifestOptions {
    /**
     * Absolute path to the SDK's bundled PrivacyInfo.xcprivacy. Defaults
     * to the one shipped at `@erne/monitor/ios/PrivacyInfo.xcprivacy`.
     * Tests override this to avoid coupling the plugin to the real file
     * layout.
     */
    manifestPath?: string;
    /**
     * When true (default), throws if the manifest file is missing. Turn
     * off only in diagnostic scenarios where the file is intentionally
     * absent.
     */
    strict?: boolean;
    /**
     * When true (default), writes a one-line notice to `console.log` so
     * consumers see the contribution during `npx expo prebuild`. Disabled
     * in test runs to keep output clean.
     */
    logNotice?: boolean;
}
export declare const withPrivacyManifest: ConfigPlugin<WithPrivacyManifestOptions | void>;
export default withPrivacyManifest;
