/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Jest harness for the bundle-size budget script. We can't just run the
 * script as a shell command from Jest, so we load its exported helpers
 * (BUDGETS + collectEntrySize) and assert directly against the built
 * `dist/` output. CI runs `node scripts/check-bundle-size.js` separately
 * for the exit-code gate; this test catches regressions inside the
 * normal Jest invocation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const script = require('./check-bundle-size.js') as {
  BUDGETS: ReadonlyArray<{
    name: string;
    entry: string;
    budgetKb: number;
  }>;
  collectEntrySize: (entryPath: string) => {
    files: number;
    rawBytes: number;
    gzipBytes: number;
  };
};

const PACKAGE_ROOT = path.resolve(__dirname, '..');

function distExists(): boolean {
  return fs.existsSync(path.join(PACKAGE_ROOT, 'dist', 'index.js'));
}

describe('bundle size budget', () => {
  // Only run these assertions when a build exists — contributors who run
  // `npm test` without `npm run build` shouldn't be blocked.
  const describeIfBuilt = distExists() ? describe : describe.skip;

  it('declares a budget for every published subpath', () => {
    // Keep the list of budget entries in sync with package.json exports
    // so nothing slips in under the radar. package.json exports look
    // like `./performance`; budget names drop the leading dot.
    const pkg = JSON.parse(
      fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
    ) as { exports: Record<string, unknown> };
    const publishedSubpaths = Object.keys(pkg.exports)
      .filter(
        (k) =>
          k !== '.' &&
          !k.startsWith('./plugin') &&
          !k.startsWith('./app.plugin'),
      )
      .map((k) => k.replace(/^\./, ''));
    const budgetedSubpaths = new Set(
      script.BUDGETS.filter((b) => b.name !== 'main').map((b) => b.name),
    );
    for (const sub of publishedSubpaths) {
      expect(budgetedSubpaths.has(sub)).toBe(true);
    }
  });

  describeIfBuilt('built output', () => {
    for (const row of script.BUDGETS) {
      it(`${row.name} stays within ${row.budgetKb} KB gzipped`, () => {
        const entry = path.join(PACKAGE_ROOT, row.entry);
        expect(fs.existsSync(entry)).toBe(true);
        const { gzipBytes, files } = script.collectEntrySize(entry);
        expect(files).toBeGreaterThan(0);
        const gzipKb = gzipBytes / 1024;
        // Leave a 5% comfort margin so every build isn't a coin flip;
        // a real regression of >1 KB will still trip.
        expect(gzipKb).toBeLessThanOrEqual(row.budgetKb * 1.05);
      });
    }
  });
});
