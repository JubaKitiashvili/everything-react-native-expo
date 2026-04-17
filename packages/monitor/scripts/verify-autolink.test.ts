/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * expo-modules-autolinking sanity check. Runs inside Jest so that any
 * change to the native-module plumbing that breaks autolinking trips
 * the SDK's own test suite before hitting a consumer.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const script = require('./verify-autolink.js') as {
  run: () => {
    problems: Array<{ area: string; message: string }>;
    config: {
      platforms?: string[];
      ios?: { modules?: string[] };
      android?: { modules?: string[] };
    } | null;
  };
};

const PACKAGE_ROOT = path.resolve(__dirname, '..');

describe('expo-module autolinking', () => {
  it('expo-module.config.json parses as valid JSON with both platforms', () => {
    const configPath = path.join(PACKAGE_ROOT, 'expo-module.config.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.platforms).toContain('ios');
    expect(config.platforms).toContain('android');
    expect(config.ios.modules.length).toBeGreaterThan(0);
    expect(config.android.modules.length).toBeGreaterThan(0);
  });

  it('ships expo-module.config.json to consumers via package.json files', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
    ) as { files?: string[] };
    expect(pkg.files).toContain('expo-module.config.json');
    expect(pkg.files).toContain('ios');
    expect(pkg.files).toContain('android');
  });

  it('Podspec + Android build + module classes are all wired correctly', () => {
    const { problems } = script.run();
    // Snapshot the problems array so any future regression surfaces the
    // exact missing piece rather than a generic failure.
    expect(problems).toEqual([]);
  });

  it('iOS module class name in config matches the Swift file that declares it', () => {
    const { config } = script.run();
    const iosClass = config?.ios?.modules?.[0];
    expect(iosClass).toBeTruthy();
    const swift = fs.readFileSync(
      path.join(PACKAGE_ROOT, 'ios', `${iosClass}.swift`),
      'utf8',
    );
    expect(swift).toMatch(new RegExp(`class\\s+${iosClass}\\s*:\\s*Module`));
  });

  it('Android module class path in config resolves to a Kotlin file', () => {
    const { config } = script.run();
    const androidClass = config?.android?.modules?.[0];
    expect(androidClass).toBeTruthy();
    const parts = (androidClass ?? '').split('.');
    const kt = path.join(
      PACKAGE_ROOT,
      'android',
      'src',
      'main',
      'java',
      ...parts.slice(0, -1),
      `${parts[parts.length - 1]}.kt`,
    );
    expect(fs.existsSync(kt)).toBe(true);
  });

  it('iOS Podspec bundles the PrivacyInfo manifest', () => {
    const podspec = fs.readFileSync(
      path.join(PACKAGE_ROOT, 'ios', 'ErneMonitor.podspec'),
      'utf8',
    );
    expect(podspec).toMatch(/PrivacyInfo\.xcprivacy/);
    expect(podspec).toMatch(/resource_bundles/);
  });

  it('Android build.gradle.kts applies the ExpoModulesCorePlugin', () => {
    const gradle = fs.readFileSync(
      path.join(PACKAGE_ROOT, 'android', 'build.gradle.kts'),
      'utf8',
    );
    expect(gradle).toMatch(/ExpoModulesCorePlugin\.gradle/);
    expect(gradle).toMatch(/compileSdk\s*=\s*3[5-9]/);
  });
});
