/* eslint-disable @typescript-eslint/no-explicit-any */
// Tests for `withPrivacyManifest`. The plugin's job is to fail loudly
// if our bundled `ios/PrivacyInfo.xcprivacy` file is missing at prebuild
// time. We stub the Expo config-plugins runtime because the real one
// is not available under ts-jest.

jest.mock('@expo/config-plugins', () => ({
  withDangerousMod: (config: any, [, action]: any) => {
    const wrapped = { ...config, modResults: config };
    action(wrapped);
    return config;
  },
}));

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { withPrivacyManifest } from './withPrivacyManifest';

function makeBaseConfig(): any {
  return {
    name: 'TestApp',
    slug: 'test-app',
    ios: { bundleIdentifier: 'com.test.app' },
  };
}

function tmpFile(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-monitor-privacy-'));
  const file = path.join(dir, 'PrivacyInfo.xcprivacy');
  fs.writeFileSync(file, contents);
  return file;
}

describe('withPrivacyManifest', () => {
  test('passes through the config untouched when manifest exists', () => {
    const manifestPath = tmpFile('<plist/>');
    const out = withPrivacyManifest(makeBaseConfig(), {
      manifestPath,
      logNotice: false,
    });
    expect(out).toBeDefined();
    expect(out.name).toBe('TestApp');
  });

  test('throws in strict mode (default) when the manifest is missing', () => {
    const bogusPath = path.join(os.tmpdir(), 'never-exists.xcprivacy');
    expect(() =>
      withPrivacyManifest(makeBaseConfig(), {
        manifestPath: bogusPath,
        logNotice: false,
      }),
    ).toThrow(/PrivacyInfo\.xcprivacy/);
  });

  test('warns (not throws) when strict=false and manifest missing', () => {
    const bogusPath = path.join(os.tmpdir(), 'never-exists.xcprivacy');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() =>
        withPrivacyManifest(makeBaseConfig(), {
          manifestPath: bogusPath,
          strict: false,
          logNotice: false,
        }),
      ).not.toThrow();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('PrivacyInfo.xcprivacy'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  test('logs a notice when logNotice=true and the manifest is present', () => {
    const manifestPath = tmpFile('<plist/>');
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      withPrivacyManifest(makeBaseConfig(), {
        manifestPath,
        logNotice: true,
      });
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Privacy manifest contributed'),
      );
    } finally {
      log.mockRestore();
    }
  });

  test('SDK-shipped PrivacyInfo.xcprivacy declares all required keys', () => {
    const shipped = path.join(__dirname, '..', 'ios', 'PrivacyInfo.xcprivacy');
    expect(fs.existsSync(shipped)).toBe(true);
    const xml = fs.readFileSync(shipped, 'utf8');
    expect(xml).toContain('NSPrivacyTracking');
    expect(xml).toContain('NSPrivacyCollectedDataTypeCrashData');
    expect(xml).toContain('NSPrivacyCollectedDataTypePerformanceData');
    expect(xml).toContain('NSPrivacyCollectedDataTypeOtherDiagnosticData');
    expect(xml).toContain('NSPrivacyAccessedAPICategoryDiskSpace');
    expect(xml).toContain('NSPrivacyAccessedAPICategoryFileTimestamp');
    expect(xml).toContain('85F4.1'); // disk space reason
    expect(xml).toContain('C617.1'); // file timestamp reason
  });
});
