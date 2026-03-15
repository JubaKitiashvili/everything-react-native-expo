'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { truncate } = require('../../dashboard/lib/context/truncation');

describe('truncation', () => {
  describe('returns result object with metrics', () => {
    it('has required fields', () => {
      const r = truncate('hello', 'Bash');
      assert.ok('output' in r);
      assert.ok('tier' in r);
      assert.ok('originalBytes' in r);
      assert.ok('truncatedBytes' in r);
      assert.ok('savingsPct' in r);
    });

    it('reports 0% savings on passthrough', () => {
      const r = truncate('short text', 'Bash');
      assert.strictEqual(r.tier, 'passthrough');
      assert.strictEqual(r.savingsPct, 0);
      assert.strictEqual(r.output, 'short text');
    });

    it('returns empty tier for null/empty input', () => {
      const r = truncate('', 'Bash');
      assert.strictEqual(r.tier, 'empty');
    });
  });

  describe('T1: Structured (JSON)', () => {
    it('extracts key fields from large JSON', () => {
      const bigJson = JSON.stringify({
        name: 'test-app', version: '1.0.0',
        dependencies: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`dep-${i}`, `^${i}.0.0`])),
        devDependencies: { jest: '^29.0.0' }
      });
      const r = truncate(bigJson, 'Read');
      assert.strictEqual(r.tier, 'T1_structured');
      assert.ok(r.truncatedBytes < r.originalBytes);
      assert.ok(r.savingsPct > 0);
      assert.ok(r.output.includes('test-app'));
    });

    it('summarizes JSON arrays', () => {
      const arr = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ id: i, name: `item-${i}` })));
      const r = truncate(arr, 'Read');
      assert.strictEqual(r.tier, 'T1_structured');
      assert.ok(r.output.includes('500'));
    });

    it('uses aggressive mode for smaller output', () => {
      const arr = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ id: i, name: `item-${i}`, description: 'x'.repeat(80) })));
      const normal = truncate(arr, 'Read');
      const aggressive = truncate(arr, 'Read', { aggressive: true });
      assert.ok(aggressive.truncatedBytes <= normal.truncatedBytes);
    });
  });

  describe('T2: Pattern (known outputs)', () => {
    it('extracts test failures from jest output', () => {
      const testOutput = `PASS src/a.test.js\nPASS src/b.test.js\n` +
        `FAIL src/c.test.js\n  ● test name\n    Expected: 1\n    Received: 2\n` +
        `\nTest Suites: 1 failed, 2 passed, 3 total\nTests: 1 failed, 5 passed, 6 total`;
      const r = truncate(testOutput, 'Bash');
      assert.strictEqual(r.tier, 'T2_test');
      assert.ok(r.output.includes('FAIL'));
      assert.ok(r.output.includes('1 failed'));
    });

    it('extracts git diff stats', () => {
      const diffLines = Array.from({ length: 200 }, (_, i) => `+added line ${i}`).join('\n');
      const diff = `diff --git a/file.js b/file.js\n--- a/file.js\n+++ b/file.js\n${diffLines}\n 3 files changed, 200 insertions(+)`;
      const r = truncate(diff, 'Bash');
      assert.strictEqual(r.tier, 'T2_diff');
      assert.ok(r.output.includes('file.js'));
      assert.ok(r.savingsPct > 50);
    });

    it('uses aggressive mode with fewer lines', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `FAIL test-${i}`).join('\n');
      const testOutput = `${lines}\nTest Suites: 50 failed, 50 total\nTests: 50 failed, 50 total`;
      const normal = truncate(testOutput, 'Bash');
      const agg = truncate(testOutput, 'Bash', { aggressive: true });
      assert.ok(agg.truncatedBytes <= normal.truncatedBytes);
    });
  });

  describe('T3: Head/Tail', () => {
    it('truncates large output to head + tail', () => {
      const big = 'x'.repeat(5000);
      const r = truncate(big, 'Bash');
      assert.strictEqual(r.tier, 'T3_headtail');
      assert.ok(r.truncatedBytes <= 1500);
      assert.ok(r.output.includes('...'));
      assert.ok(r.savingsPct > 60);
    });

    it('uses smaller head/tail in aggressive mode', () => {
      const big = 'y'.repeat(5000);
      const normal = truncate(big, 'Bash');
      const agg = truncate(big, 'Bash', { aggressive: true });
      assert.ok(agg.truncatedBytes < normal.truncatedBytes);
    });
  });

  describe('T4: Hash', () => {
    it('hashes binary content', () => {
      const binary = Buffer.from(Array.from({ length: 1000 }, () => Math.floor(Math.random() * 256))).toString('binary');
      const r = truncate(binary, 'Read', { isBinary: true });
      assert.strictEqual(r.tier, 'T4_binary');
      assert.ok(r.output.includes('sha256'));
      assert.ok(r.truncatedBytes < 200);
      assert.ok(r.savingsPct > 80);
    });
  });

  describe('aggressive passthrough threshold', () => {
    it('passes through 1KB in normal mode', () => {
      const text = 'a'.repeat(1000);
      const r = truncate(text, 'Bash');
      assert.strictEqual(r.tier, 'passthrough');
    });

    it('truncates 1KB in aggressive mode', () => {
      const text = 'a'.repeat(1000);
      const r = truncate(text, 'Bash', { aggressive: true });
      assert.strictEqual(r.tier, 'T3_headtail');
    });
  });
});
