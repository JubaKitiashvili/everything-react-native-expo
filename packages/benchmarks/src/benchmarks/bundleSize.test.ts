// Task 117.91 — bundle_size benchmark unit tests.

import { describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractRelativeImports, walkAndGzip } from './bundleSize.js';

describe('extractRelativeImports', () => {
  test('captures ESM static imports', () => {
    expect(extractRelativeImports("import x from './a';")).toEqual(['./a']);
    expect(extractRelativeImports("import { y } from '../b/c';")).toEqual(['../b/c']);
  });

  test('captures ESM dynamic imports', () => {
    expect(extractRelativeImports("await import('./dynamic')")).toEqual(['./dynamic']);
  });

  test('captures CJS requires', () => {
    expect(extractRelativeImports('const x = require("./a")')).toEqual(['./a']);
  });

  test('skips bare-package imports', () => {
    expect(extractRelativeImports("import x from 'react'")).toEqual([]);
  });

  test('captures export-from re-exports', () => {
    expect(extractRelativeImports("export { y } from './b'")).toEqual(['./b']);
  });
});

describe('walkAndGzip', () => {
  test('walks an entry, sums gzipped bytes, dedupes cycles', () => {
    const root = mkdtempSync(join(tmpdir(), 'erne-bench-bundle-'));
    try {
      mkdirSync(join(root, 'src'));
      // a.js → b.js → a.js (cycle); c.js orphan to confirm it's not counted.
      writeFileSync(
        join(root, 'src', 'a.js'),
        "import './b.js';\nexport const a = 'aaaaaaaaaaaaaa';",
      );
      writeFileSync(
        join(root, 'src', 'b.js'),
        "import './a.js';\nexport const b = 'bbbbbbbbbbbbbb';",
      );
      writeFileSync(join(root, 'src', 'c.js'), "export const c = 'unrelated';");
      const result = walkAndGzip(join(root, 'src', 'a.js'), root);
      expect(result.fileCount).toBe(2);
      expect(result.entry).toBe('src/a.js');
      expect(result.totalGzipBytes).toBeGreaterThan(0);
      const paths = result.largestFiles.map((f) => f.path).sort();
      expect(paths).toEqual(['src/a.js', 'src/b.js']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects imports that escape repoRoot', () => {
    const root = mkdtempSync(join(tmpdir(), 'erne-bench-bundle-'));
    try {
      mkdirSync(join(root, 'inner'));
      writeFileSync(
        join(root, 'inner', 'a.js'),
        "import '../../../etc/passwd';\nexport const a = 1;",
      );
      // `../../../etc/passwd` doesn't actually resolve, so the walker
      // simply skips it (resolveImport returns null on a missing file).
      // To exercise the escape check we point at the leaf directly.
      expect(() => walkAndGzip('/etc/passwd', root)).toThrow(/escaped repoRoot/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
