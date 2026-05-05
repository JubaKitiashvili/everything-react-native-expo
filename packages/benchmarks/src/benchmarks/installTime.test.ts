// Task 117.91 — install_time benchmark unit tests.
//
// Stubs `npm` with a fake shell script so we don't actually hit the
// public registry from CI. The real-network path is exercised nightly
// by .github/workflows/benchmarks.yml.

import { describe, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureNpmInstall } from './installTime.js';

function makeStubNpm(version = '10.0.0'): { binPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'erne-bench-stub-npm-'));
  const binPath = join(dir, 'npm');
  // POSIX shell stub. Returns success on `--version`, `install`, `cache clean`.
  writeFileSync(
    binPath,
    `#!/bin/sh
case "$1" in
  --version) echo "${version}" ;;
  install) mkdir -p node_modules ; echo '{}' > node_modules/.installed ;;
  cache) exit 0 ;;
  *) echo "unknown $@" >&2 ; exit 2 ;;
esac
exit 0
`,
  );
  chmodSync(binPath, 0o755);
  return { binPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('measureNpmInstall', () => {
  test('runs warm-only when measureCold=false', () => {
    const { binPath, cleanup } = makeStubNpm();
    try {
      let now = 0;
      const result = measureNpmInstall({
        packageName: 'fake-pkg',
        version: '1.0.0',
        measureCold: false,
        npmBin: binPath,
        now: () => {
          now += 250;
          return now;
        },
      });
      expect(result.warmSeconds).toBeGreaterThan(0);
      expect(result.coldSeconds).toBeNull();
      expect(result.npmVersion).toBe('10.0.0');
    } finally {
      cleanup();
    }
  });

  test('runs both warm + cold when measureCold=true', () => {
    const { binPath, cleanup } = makeStubNpm('10.5.0');
    try {
      let now = 0;
      const result = measureNpmInstall({
        packageName: 'fake-pkg',
        version: '2.0.0',
        measureCold: true,
        npmBin: binPath,
        now: () => {
          now += 100;
          return now;
        },
      });
      expect(result.warmSeconds).toBeGreaterThan(0);
      expect(result.coldSeconds).not.toBeNull();
      expect(result.coldSeconds!).toBeGreaterThan(0);
      expect(result.npmVersion).toBe('10.5.0');
    } finally {
      cleanup();
    }
  });

  test('throws when the install subprocess fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'erne-bench-failnpm-'));
    const binPath = join(dir, 'npm');
    writeFileSync(binPath, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 9; exit 0; fi\nexit 1\n');
    chmodSync(binPath, 0o755);
    try {
      expect(() =>
        measureNpmInstall({
          packageName: 'broken-pkg',
          version: '0.0.0',
          measureCold: false,
          npmBin: binPath,
          now: () => 0,
        }),
      ).toThrow(/install broken-pkg/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

});
