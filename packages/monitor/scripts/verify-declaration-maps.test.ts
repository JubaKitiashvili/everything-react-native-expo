/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Runs the declaration-map validator inside Jest so type-info
 * regressions trip during `npm test`, not only during CI. Skipped
 * automatically when `dist/` isn't built so contributors who haven't
 * run `npm run build` aren't blocked.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const script = require('./verify-declaration-maps.js') as {
  check: (
    distDir: string,
    srcDir: string,
  ) =>
    | { kind: 'dist-missing' | 'src-missing'; message: string }
    | {
        kind: 'ok';
        filesChecked: number;
        problems: Array<{
          file: string;
          kind: string;
          message: string;
        }>;
      };
  walk: (dir: string, acc?: string[]) => string[];
};

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PACKAGE_ROOT, 'dist');
const SRC_DIR = path.join(PACKAGE_ROOT, 'src');

function distBuilt(): boolean {
  return fs.existsSync(path.join(DIST_DIR, 'index.js'));
}

describe('declaration maps', () => {
  const describeIfBuilt = distBuilt() ? describe : describe.skip;

  it('tsconfig.build.json enables declarationMap', () => {
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(PACKAGE_ROOT, 'tsconfig.build.json'),
        'utf8',
      ),
    ) as { compilerOptions: Record<string, unknown> };
    expect(cfg.compilerOptions.declaration).toBe(true);
    expect(cfg.compilerOptions.declarationMap).toBe(true);
  });

  describeIfBuilt('built output', () => {
    const result = script.check(DIST_DIR, SRC_DIR);

    it('check() succeeds (dist/src both present)', () => {
      expect(result.kind).toBe('ok');
    });

    it('every .js has .d.ts + .d.ts.map siblings', () => {
      if (result.kind !== 'ok') return;
      const critical = result.problems.filter(
        (p) => p.kind === 'missing-dts' || p.kind === 'missing-map',
      );
      expect(critical).toEqual([]);
    });

    it('every .d.ts.map references a real source file inside src/', () => {
      if (result.kind !== 'ok') return;
      const bad = result.problems.filter(
        (p) =>
          p.kind === 'missing-source' ||
          p.kind === 'invalid-map' ||
          p.kind === 'empty-sources' ||
          p.kind === 'source-outside-src',
      );
      expect(bad).toEqual([]);
    });

    it('covers a non-trivial number of files', () => {
      if (result.kind !== 'ok') return;
      // If this drops below 50 something went very wrong with the build.
      expect(result.filesChecked).toBeGreaterThanOrEqual(50);
    });

    it('includes every subpath export entry', () => {
      const expected = [
        'exports/performance.js',
        'exports/network.js',
        'exports/ai.js',
        'exports/replay.js',
        'exports/dev.js',
        'exports/testing.js',
      ];
      for (const rel of expected) {
        const js = path.join(DIST_DIR, rel);
        const map = js.replace(/\.js$/, '.d.ts.map');
        expect(fs.existsSync(js)).toBe(true);
        expect(fs.existsSync(map)).toBe(true);
      }
    });
  });
});
