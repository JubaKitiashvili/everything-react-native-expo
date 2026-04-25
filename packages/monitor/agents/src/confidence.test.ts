// Task 117.6 — confidence store tests.

import { describe, expect, test } from 'vitest';
import {
  ConfidenceStore,
  InMemoryConfidenceStorage,
} from './confidence.js';

describe('ConfidenceStore — Bayesian trust', () => {
  test('returns 0.5 when the bucket is empty (uniform prior)', async () => {
    const store = new ConfidenceStore({ storage: new InMemoryConfidenceStorage() });
    await store.hydrate();
    expect(store.trustScore('null-check')).toBeCloseTo(0.5, 5);
  });

  test('rises with merged outcomes, falls with rejected', async () => {
    const store = new ConfidenceStore({ storage: new InMemoryConfidenceStorage() });
    await store.hydrate();
    await store.recordOutcome('null-check', 'merged');
    await store.recordOutcome('null-check', 'merged');
    await store.recordOutcome('null-check', 'merged');
    const t = store.trustScore('null-check');
    expect(t).toBeGreaterThan(0.5);
    expect(t).toBeLessThanOrEqual(1);

    await store.recordOutcome('null-check', 'rejected');
    await store.recordOutcome('null-check', 'rejected');
    expect(store.trustScore('null-check')).toBeLessThan(t);
  });

  test('ignored counts toward the rejected mass', async () => {
    const store = new ConfidenceStore({ storage: new InMemoryConfidenceStorage() });
    await store.hydrate();
    await store.recordOutcome('null-check', 'ignored');
    await store.recordOutcome('null-check', 'ignored');
    expect(store.trustScore('null-check')).toBeLessThan(0.5);
  });
});

describe('ConfidenceStore — effectiveConfidence', () => {
  test('multiplies self-reported by class trust', async () => {
    const store = new ConfidenceStore({ storage: new InMemoryConfidenceStorage() });
    await store.hydrate();
    // Empty bucket → trust 0.5; effective = 80 × 0.5 = 40
    expect(store.effectiveConfidence('null-check', 80)).toBe(40);
  });

  test('clamps the input self-reported value', async () => {
    const store = new ConfidenceStore({ storage: new InMemoryConfidenceStorage() });
    await store.hydrate();
    expect(store.effectiveConfidence('x', -10)).toBe(0);
    expect(store.effectiveConfidence('x', 250)).toBe(50); // 100 × 0.5
  });
});

describe('ConfidenceStore — proposal counter', () => {
  test('recordProposal initialises a bucket and bumps proposed', async () => {
    let saved: unknown = null;
    const storage = {
      load: async () => ({}),
      save: async (record: unknown) => {
        saved = record;
      },
    };
    const store = new ConfidenceStore({ storage, now: () => 42 });
    await store.recordProposal('foo');
    expect((saved as Record<string, { proposed: number }>).foo?.proposed).toBe(1);
  });

  test('proposal counter survives across hydrate/load round-trips', async () => {
    const storage = new InMemoryConfidenceStorage();
    const a = new ConfidenceStore({ storage });
    await a.recordProposal('foo');
    await a.recordOutcome('foo', 'merged');
    const b = new ConfidenceStore({ storage });
    await b.hydrate();
    expect(b.bucket('foo').proposed).toBe(1);
    expect(b.bucket('foo').merged).toBe(1);
  });
});

describe('ConfidenceStore — snapshot', () => {
  test('snapshot returns a deep copy', async () => {
    const store = new ConfidenceStore({ storage: new InMemoryConfidenceStorage() });
    await store.recordProposal('foo');
    const snap = store.snapshot();
    expect(snap.foo?.proposed).toBe(1);
    // Mutating the snapshot must not affect the live store.
    snap.foo!.proposed = 99;
    expect(store.bucket('foo').proposed).toBe(1);
  });
});
