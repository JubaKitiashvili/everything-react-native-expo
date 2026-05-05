// Task 117.91 — markdown formatter tests.

import { describe, expect, test } from 'vitest';
import { formatMarkdown } from './markdown.js';
import type { SuiteReport } from '../types.js';

const REPORT: SuiteReport = {
  startedAt: '2026-05-04T00:00:00Z',
  finishedAt: '2026-05-04T00:00:01Z',
  node: 'v22.0.0',
  seed: 1,
  iterations: 1000,
  results: [
    {
      benchmark: 'bundle_size',
      subjectId: 'erne',
      subjectLabel: '@erne/monitor',
      subjectVersion: '1.0.0',
      status: 'native',
      measurement: {
        totalGzipBytes: 67_000,
        largestFiles: [{ path: 'dist/index.js', gzipBytes: 50_000 }],
        fileCount: 76,
        entry: 'dist/index.js',
      },
      durationMs: 12,
      startedAt: '2026-05-04T00:00:00Z',
    },
    {
      benchmark: 'bundle_size',
      subjectId: 'sentry',
      subjectLabel: '@sentry/react-native',
      subjectVersion: '5.31.1',
      status: 'documented_placeholder',
      measurement: null,
      unavailableReason: 'placeholder: see runbook',
      durationMs: 0,
      startedAt: '2026-05-04T00:00:00Z',
    },
    {
      benchmark: 'crash_latency',
      subjectId: 'erne',
      subjectLabel: '@erne/monitor',
      subjectVersion: '1.0.0',
      status: 'native',
      measurement: {
        iterations: 1000,
        p50Ms: 0.05,
        p95Ms: 0.2,
        p99Ms: 0.5,
        maxMs: 1.2,
      },
      durationMs: 1200,
      startedAt: '2026-05-04T00:00:00Z',
    },
    {
      benchmark: 'install_time',
      subjectId: 'erne',
      subjectLabel: '@erne/monitor',
      subjectVersion: '1.0.0',
      status: 'native',
      measurement: { warmSeconds: 8.5, coldSeconds: 22.3, npmVersion: '10.0.0' },
      durationMs: 8500,
      startedAt: '2026-05-04T00:00:00Z',
    },
    {
      benchmark: 'symbolication_accuracy',
      subjectId: 'erne',
      subjectLabel: '@erne/monitor',
      subjectVersion: '1.0.0',
      status: 'native',
      measurement: {
        accuracy: 1,
        frameCount: 50,
        correctFrames: 50,
        byCategory: [
          { category: 'hermes', correct: 20, total: 20 },
          { category: 'proguard', correct: 15, total: 15 },
          { category: 'dsym', correct: 15, total: 15 },
        ],
      },
      durationMs: 2,
      startedAt: '2026-05-04T00:00:00Z',
    },
  ],
};

describe('formatMarkdown', () => {
  test('renders one section per benchmark', () => {
    const out = formatMarkdown(REPORT);
    expect(out).toContain('## bundle_size');
    expect(out).toContain('## crash_latency');
    expect(out).toContain('## install_time');
    expect(out).toContain('## symbolication_accuracy');
  });

  test('shows formatted gzip size with KB unit', () => {
    const out = formatMarkdown(REPORT);
    expect(out).toContain('65.43 KB');
  });

  test('uses µs for sub-millisecond latencies + ms for >=1ms', () => {
    const out = formatMarkdown(REPORT);
    expect(out).toContain('50.0 µs');
    expect(out).toContain('1.20 ms');
  });

  test('uses seconds for install time', () => {
    const out = formatMarkdown(REPORT);
    expect(out).toContain('8.50 s');
    expect(out).toContain('22.30 s');
  });

  test('shows accuracy as % + per-category breakdown', () => {
    const out = formatMarkdown(REPORT);
    expect(out).toContain('100.0%');
    expect(out).toContain('hermes: 20/20');
    expect(out).toContain('dsym: 15/15');
  });

  test('renders placeholder rows with em-dashes (no fabricated numbers)', () => {
    const out = formatMarkdown(REPORT);
    const sentryLine = out
      .split('\n')
      .find((line) => line.includes('@sentry/react-native'));
    expect(sentryLine).toBeDefined();
    expect(sentryLine).toContain('placeholder: see runbook');
    expect(sentryLine).toContain(' — ');
  });
});
