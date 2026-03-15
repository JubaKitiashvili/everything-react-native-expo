'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { computeTrend, computeAgentUtilization } = require('../dashboard/lib/insights/trends');

describe('insights trends', () => {
  describe('computeTrend', () => {
    it('computes positive delta from snapshots', () => {
      var snapshots = [
        { date: '2026-03-01', auditScore: 70 },
        { date: '2026-03-15', auditScore: 86 },
      ];
      var trend = computeTrend(snapshots, 'auditScore');
      assert.strictEqual(trend.current, 86);
      assert.strictEqual(trend.delta, 16);
      assert.strictEqual(trend.direction, 'up');
    });

    it('computes negative delta', () => {
      var snapshots = [
        { date: '2026-03-01', auditScore: 90 },
        { date: '2026-03-15', auditScore: 80 },
      ];
      var trend = computeTrend(snapshots, 'auditScore');
      assert.strictEqual(trend.delta, -10);
      assert.strictEqual(trend.direction, 'down');
    });

    it('handles single snapshot', () => {
      var trend = computeTrend([{ date: '2026-03-15', auditScore: 86 }], 'auditScore');
      assert.strictEqual(trend.delta, 0);
      assert.strictEqual(trend.direction, 'flat');
    });

    it('handles empty snapshots', () => {
      var trend = computeTrend([], 'auditScore');
      assert.strictEqual(trend.current, 0);
    });

    it('extracts sparkline data points', () => {
      var snapshots = [
        { date: '2026-03-01', auditScore: 70 },
        { date: '2026-03-02', auditScore: 75 },
        { date: '2026-03-03', auditScore: 80 },
      ];
      var trend = computeTrend(snapshots, 'auditScore');
      assert.deepStrictEqual(trend.sparkline, [70, 75, 80]);
    });
  });

  describe('computeAgentUtilization', () => {
    it('computes utilization from history entries', () => {
      var history = {
        architect: [
          { type: 'complete', durationMs: 60000 },
          { type: 'complete', durationMs: 30000 },
        ],
        'code-reviewer': [
          { type: 'complete', durationMs: 20000 },
        ],
      };
      var result = computeAgentUtilization(history);
      assert.ok(result.length >= 2);
      assert.strictEqual(result[0].name, 'architect');
      assert.ok(result[0].pct > result[1].pct);
    });

    it('handles empty history', () => {
      var result = computeAgentUtilization({});
      assert.deepStrictEqual(result, []);
    });
  });

  describe('snapshot aggregation', () => {
    const { readSnapshots, writeSnapshots } = require('../dashboard/lib/insights/collector');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    it('trims to 90 snapshots max', () => {
      var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-test-'));
      fs.mkdirSync(path.join(tmpDir, '.erne'), { recursive: true });
      var big = [];
      for (var i = 0; i < 100; i++) {
        big.push({ date: '2026-01-' + String(i + 1).padStart(2, '0'), auditScore: i });
      }
      writeSnapshots(tmpDir, big);
      var result = readSnapshots(tmpDir);
      assert.strictEqual(result.length, 90);
      assert.strictEqual(result[0].date, '2026-01-11'); // first 10 trimmed
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('returns empty array for missing file', () => {
      var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-test-'));
      var result = readSnapshots(tmpDir);
      assert.deepStrictEqual(result, []);
      fs.rmSync(tmpDir, { recursive: true });
    });
  });
});
