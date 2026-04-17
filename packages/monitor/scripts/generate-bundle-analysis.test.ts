/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Keeps `docs/BUNDLE-ANALYSIS.md` in lockstep with the live `dist/`
 * output. CI runs the `--check` mode of the generator script; this
 * Jest test is the same assertion packaged for local development so
 * a contributor running `npm test` catches a stale report before
 * pushing.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const generator = require('./generate-bundle-analysis.js') as {
  renderReport: () => string;
};

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(PACKAGE_ROOT, 'docs', 'BUNDLE-ANALYSIS.md');

function distBuilt(): boolean {
  return fs.existsSync(path.join(PACKAGE_ROOT, 'dist', 'index.js'));
}

describe('BUNDLE-ANALYSIS.md', () => {
  it('exists in docs/', () => {
    expect(fs.existsSync(REPORT_PATH)).toBe(true);
  });

  it('declares the auto-generation + CI contract up front', () => {
    const src = fs.readFileSync(REPORT_PATH, 'utf8');
    expect(src).toMatch(/Auto-generated/);
    expect(src).toMatch(/npm run analyze/);
    expect(src).toMatch(/CI fails on any mismatch/);
  });

  it('summary table covers every declared subpath', () => {
    const src = fs.readFileSync(REPORT_PATH, 'utf8');
    for (const entry of [
      'main',
      '/performance',
      '/network',
      '/ai',
      '/replay',
      '/dev',
      '/testing',
    ]) {
      // The table shows names in backticks.
      expect(src).toContain('`' + entry + '`');
    }
  });

  (distBuilt() ? it : it.skip)(
    'matches what the generator would produce right now (no drift)',
    () => {
      const expected = generator.renderReport();
      const committed = fs.readFileSync(REPORT_PATH, 'utf8');
      if (committed !== expected) {
        // Surface the first line of difference so the fix is obvious.
        const expectedLines = expected.split('\n');
        const committedLines = committed.split('\n');
        const firstDiff = expectedLines.findIndex(
          (line, i) => line !== committedLines[i],
        );
        throw new Error(
          `BUNDLE-ANALYSIS.md is stale — run 'npm run analyze' and commit.\n` +
            `First diff at line ${firstDiff + 1}:\n` +
            `  expected: ${expectedLines[firstDiff]}\n` +
            `  committed: ${committedLines[firstDiff]}`,
        );
      }
      expect(committed).toEqual(expected);
    },
  );

  it('README points readers at this report', () => {
    const readme = fs.readFileSync(
      path.join(PACKAGE_ROOT, 'README.md'),
      'utf8',
    );
    // We link to the subpath size table in README already; the full
    // analysis is a deeper dive. Not a hard requirement, so assert
    // soft: either README references BUNDLE-ANALYSIS or mentions the
    // subpath size table inline. The README task already enforces the
    // table, so this line documents the relationship without breaking
    // if a later rewrite restructures the doc.
    expect(
      /BUNDLE-ANALYSIS\.md/.test(readme) ||
        /Tree-shakeable imports/.test(readme),
    ).toBe(true);
  });
});
