/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as path from 'path';

// Mock fs and path before importing
jest.mock('fs');
jest.mock('@expo/config-plugins', () => {
  const helpers = {
    withDangerousMod: (config: any, [_platform, action]: [string, (cfg: any) => any]) => {
      const wrapped = {
        ...config,
        modRequest: { projectRoot: '/tmp/test-project' },
      };
      return action(wrapped);
    },
    createRunOncePlugin: (plugin: any) => plugin,
  };
  return helpers;
});

import {
  withSourceMapUpload,
  generateUploadScript,
} from './withSourceMapUpload';

const mockedFs = fs as jest.Mocked<typeof fs>;

function makeBaseConfig(): any {
  return {
    name: 'TestApp',
    slug: 'test-app',
    version: '1.2.3',
    ios: {
      bundleIdentifier: 'com.test.app',
      buildNumber: '42',
    },
    android: {
      package: 'com.test.app',
      versionCode: 7,
    },
  };
}

describe('withSourceMapUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.mkdirSync.mockReturnValue(undefined as any);
    mockedFs.writeFileSync.mockReturnValue(undefined);
  });

  test('is a no-op when endpoint is not configured', () => {
    const cfg = makeBaseConfig();
    const result = withSourceMapUpload(cfg, {});
    // Should not write any files
    expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
  });

  test('writes upload script when endpoint is provided', () => {
    const cfg = makeBaseConfig();
    withSourceMapUpload(cfg, {
      endpoint: 'https://maps.example.com/upload',
    });

    // Two calls: one for iOS, one for Android
    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(2);
    const [scriptPath, content] = mockedFs.writeFileSync.mock.calls[0] as [string, string, any];
    expect(scriptPath).toContain('upload-sourcemaps.sh');
    expect(content).toContain('https://maps.example.com/upload');
  });

  test('uses app version from config', () => {
    const cfg = makeBaseConfig();
    withSourceMapUpload(cfg, {
      endpoint: 'https://maps.example.com/upload',
    });

    const content = mockedFs.writeFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('APP_VERSION="1.2.3"');
  });

  test('allows overriding appVersion and buildNumber', () => {
    const cfg = makeBaseConfig();
    withSourceMapUpload(cfg, {
      endpoint: 'https://maps.example.com/upload',
      appVersion: '9.9.9',
      buildNumber: '999',
    });

    const content = mockedFs.writeFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('APP_VERSION="9.9.9"');
    expect(content).toContain('BUILD_NUMBER="999"');
  });

  test('creates .erne-monitor directory if it does not exist', () => {
    const cfg = makeBaseConfig();
    mockedFs.existsSync.mockReturnValue(false);
    withSourceMapUpload(cfg, {
      endpoint: 'https://maps.example.com/upload',
    });

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.erne-monitor'),
      { recursive: true },
    );
  });

  test('does not recreate directory if it exists', () => {
    const cfg = makeBaseConfig();
    mockedFs.existsSync.mockReturnValue(true);
    withSourceMapUpload(cfg, {
      endpoint: 'https://maps.example.com/upload',
    });

    expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
  });

  test('script is executable (mode 0o755)', () => {
    const cfg = makeBaseConfig();
    withSourceMapUpload(cfg, {
      endpoint: 'https://maps.example.com/upload',
    });

    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { mode: 0o755 },
    );
  });
});

describe('generateUploadScript', () => {
  test('includes endpoint, version, build, and bundle id', () => {
    const script = generateUploadScript(
      'https://maps.example.com/upload',
      '2.0.0',
      '50',
      'com.test.app',
    );
    expect(script).toContain('ENDPOINT="https://maps.example.com/upload"');
    expect(script).toContain('APP_VERSION="2.0.0"');
    expect(script).toContain('BUILD_NUMBER="50"');
    expect(script).toContain('BUNDLE_ID="com.test.app"');
  });

  test('includes dedup HEAD check', () => {
    const script = generateUploadScript('https://x.com', '1', '1', 'x');
    expect(script).toContain('--head');
    expect(script).toContain('already uploaded');
  });

  test('uses || true to avoid build failure', () => {
    const script = generateUploadScript('https://x.com', '1', '1', 'x');
    expect(script).toContain('|| true');
  });

  test('starts with shebang', () => {
    const script = generateUploadScript('https://x.com', '1', '1', 'x');
    expect(script.startsWith('#!/usr/bin/env bash')).toBe(true);
  });
});
