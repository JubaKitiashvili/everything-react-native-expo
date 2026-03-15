'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { truncate } = require('../../dashboard/lib/context/truncation');

describe('truncation', () => {
  describe('T1: Structured (JSON)', () => {
    it('extracts key fields from large JSON', () => {
      const bigJson = JSON.stringify({
        name: 'test-app', version: '1.0.0',
        dependencies: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`dep-${i}`, `^${i}.0.0`])),
        devDependencies: { jest: '^29.0.0' }
      });
      const result = truncate(bigJson, 'Read');
      assert.ok(result.length < bigJson.length);
      assert.ok(result.includes('test-app'));
      assert.ok(result.length < 2048);
    });

    it('summarizes JSON arrays', () => {
      const arr = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ id: i, name: `item-${i}` })));
      const result = truncate(arr, 'Read');
      assert.ok(result.length < arr.length);
      assert.ok(result.includes('500'));
    });
  });

  describe('T2: Pattern (known outputs)', () => {
    it('extracts test failures from jest output', () => {
      const testOutput = `PASS src/a.test.js\nPASS src/b.test.js\n` +
        `FAIL src/c.test.js\n  ● test name\n    Expected: 1\n    Received: 2\n` +
        `\nTest Suites: 1 failed, 2 passed, 3 total\nTests: 1 failed, 5 passed, 6 total`;
      const result = truncate(testOutput, 'Bash');
      assert.ok(result.includes('FAIL'));
      assert.ok(result.includes('1 failed'));
      assert.ok(result.length < testOutput.length);
    });

    it('extracts git diff stats', () => {
      const diffLines = Array.from({ length: 200 }, (_, i) => `+added line ${i}`).join('\n');
      const diff = `diff --git a/file.js b/file.js\n--- a/file.js\n+++ b/file.js\n${diffLines}\n 3 files changed, 200 insertions(+)`;
      const result = truncate(diff, 'Bash');
      assert.ok(result.includes('file.js'));
      assert.ok(result.length < diff.length);
    });
  });

  describe('T3: Head/Tail', () => {
    it('truncates large output to head + tail', () => {
      const big = 'x'.repeat(5000);
      const result = truncate(big, 'Bash');
      assert.ok(result.length <= 1500);
      assert.ok(result.includes('...'));
      assert.ok(result.includes('lines'));
    });
  });

  describe('T4: Hash', () => {
    it('hashes binary content', () => {
      const binary = Buffer.from(Array.from({ length: 1000 }, () => Math.floor(Math.random() * 256))).toString('binary');
      const result = truncate(binary, 'Read', { isBinary: true });
      assert.ok(result.includes('sha256'));
      assert.ok(result.length < 200);
    });
  });

  describe('passthrough', () => {
    it('returns small output unchanged', () => {
      const small = 'hello world';
      const result = truncate(small, 'Bash');
      assert.strictEqual(result, small);
    });
  });
});
