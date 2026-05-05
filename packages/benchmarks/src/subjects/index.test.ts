// Task 117.91 — subject registry tests.

import { describe, expect, test } from 'vitest';
import { SUBJECTS, SUBJECTS_BY_ID } from './index.js';

describe('SUBJECTS', () => {
  test('every subject has a unique id', () => {
    const ids = SUBJECTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every subject implements every measure-* method', () => {
    for (const s of SUBJECTS) {
      expect(typeof s.measureBundleSize).toBe('function');
      expect(typeof s.measureCrashLatency).toBe('function');
      expect(typeof s.measureInstallTime).toBe('function');
      expect(typeof s.measureSymbolicationAccuracy).toBe('function');
    }
  });

  test('placeholder subjects ship a runbook in `notes`', () => {
    for (const s of SUBJECTS) {
      if (s.status === 'documented_placeholder') {
        expect(s.notes ?? '').toMatch(/runbook/i);
      }
    }
  });

  test('SUBJECTS_BY_ID matches SUBJECTS exactly', () => {
    for (const s of SUBJECTS) {
      expect(SUBJECTS_BY_ID[s.id]).toBe(s);
    }
  });
});
