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
import { type ConfigPlugin } from '@expo/config-plugins';
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
/**
 * Generates the content of the upload shell script that will run
 * post-build to find and upload .map files.
 */
export declare function generateUploadScript(endpoint: string, appVersion: string, buildNumber: string, bundleId: string): string;
export declare const withSourceMapUpload: ConfigPlugin<SourceMapUploadPluginOptions>;
export default withSourceMapUpload;
