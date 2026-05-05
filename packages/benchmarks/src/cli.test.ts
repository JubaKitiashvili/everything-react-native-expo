// Task 117.91 — CLI argument parser tests.

import { describe, expect, test } from 'vitest';
import { parseArgs } from './cli.js';

describe('parseArgs', () => {
  test('defaults: no command, empty filters', () => {
    expect(parseArgs([])).toEqual({
      command: null,
      benchmarks: [],
      subjects: [],
      out: null,
      json: false,
      dryRun: false,
      iterations: undefined,
      seed: undefined,
    });
  });

  test('captures `run` command + flags', () => {
    const args = parseArgs([
      'run',
      '--benchmark=bundle_size',
      '--benchmark=crash_latency',
      '--subject=erne',
      '--out=results.md',
      '--json',
      '--dry-run',
      '--iterations=500',
      '--seed=42',
    ]);
    expect(args.command).toBe('run');
    expect(args.benchmarks).toEqual(['bundle_size', 'crash_latency']);
    expect(args.subjects).toEqual(['erne']);
    expect(args.out).toBe('results.md');
    expect(args.json).toBe(true);
    expect(args.dryRun).toBe(true);
    expect(args.iterations).toBe(500);
    expect(args.seed).toBe(42);
  });

  test('ignores invalid numeric values', () => {
    const args = parseArgs(['run', '--iterations=not-a-number', '--seed=NaN']);
    expect(args.iterations).toBeUndefined();
    expect(args.seed).toBeUndefined();
  });

  test('rejects negative or zero iteration counts', () => {
    expect(parseArgs(['run', '--iterations=0']).iterations).toBeUndefined();
    expect(parseArgs(['run', '--iterations=-5']).iterations).toBeUndefined();
  });

  test('help command short-circuits', () => {
    expect(parseArgs(['help']).command).toBe('help');
  });
});
