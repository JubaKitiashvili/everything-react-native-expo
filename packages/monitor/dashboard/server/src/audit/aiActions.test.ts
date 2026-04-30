// Task 117.81 — audit module unit tests.

import { afterEach, describe, expect, test } from 'vitest';
import { DashboardStore } from '../storage/sqliteStore.js';
import {
  listAiActions,
  parseListFilter,
  recordAiAction,
} from './aiActions.js';

const NOW = 1_770_000_000_000;
const now = (): number => NOW;

function openStore(): DashboardStore {
  return new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
}

describe('recordAiAction — happy path', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('inserts a fully-populated record', () => {
    store = openStore();
    const result = recordAiAction(
      store,
      {
        id: 'act-1',
        timestamp: NOW,
        agent: 'ai-fix-pr',
        action: 'propose-fix',
        outcome: 'proposed',
        fingerprint: 'fp-1',
        confidence: 80,
        effectiveConfidence: 60,
        classification: 'null-check',
        prUrl: 'https://github.com/o/r/pull/1',
        toolsCalled: ['list_crash_groups', 'list_events'],
        filesConsidered: ['src/Home.tsx'],
        redactionLabels: ['jailbreak'],
        metadata: { skip: null, durationMs: 12 },
      },
      { now },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inserted).toBe(true);
      expect(result.record.id).toBe('act-1');
    }
    const stored = store.listAiActions();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.toolsCalled).toEqual(['list_crash_groups', 'list_events']);
    expect(stored[0]?.metadata).toEqual({ skip: null, durationMs: 12 });
    expect(stored[0]?.confidence).toBe(80);
  });

  test('falls back to defaults.now when timestamp is omitted', () => {
    store = openStore();
    const result = recordAiAction(
      store,
      { id: 'act-2', agent: 'a', action: 'b', outcome: 'c' },
      { now },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.timestamp).toBe(NOW);
  });

  test('returns inserted=false on idempotent retry', () => {
    store = openStore();
    const a = recordAiAction(
      store,
      { id: 'dup', timestamp: NOW, agent: 'a', action: 'b', outcome: 'c' },
    );
    const b = recordAiAction(
      store,
      { id: 'dup', timestamp: NOW, agent: 'a', action: 'b', outcome: 'c' },
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.inserted).toBe(true);
      expect(b.inserted).toBe(false);
    }
  });
});

describe('recordAiAction — validation', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('rejects missing id', () => {
    store = openStore();
    const result = recordAiAction(store, { agent: 'a', action: 'b', outcome: 'c' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('missing-id');
  });

  test('rejects missing agent / action / outcome', () => {
    store = openStore();
    expect(
      (recordAiAction(store, { id: 'x', action: 'b', outcome: 'c' }) as { error: string }).error,
    ).toBe('missing-agent');
    expect(
      (recordAiAction(store, { id: 'x', agent: 'a', outcome: 'c' }) as { error: string }).error,
    ).toBe('missing-action');
    expect(
      (recordAiAction(store, { id: 'x', agent: 'a', action: 'b' }) as { error: string }).error,
    ).toBe('missing-outcome');
  });

  test('rejects out-of-range confidence', () => {
    store = openStore();
    const result = recordAiAction(store, {
      id: 'x',
      agent: 'a',
      action: 'b',
      outcome: 'c',
      confidence: 250,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid-confidence');
  });

  test('drops invalid array entries silently in toolsCalled / filesConsidered', () => {
    store = openStore();
    const result = recordAiAction(store, {
      id: 'x',
      agent: 'a',
      action: 'b',
      outcome: 'c',
      toolsCalled: ['ok', 123, '', 'good'],
      filesConsidered: 'not-an-array',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.toolsCalled).toEqual(['ok', 'good']);
      expect(result.record.filesConsidered).toBeUndefined();
    }
  });
});

describe('listAiActions + parseListFilter', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  function seed(): void {
    for (let i = 0; i < 6; i++) {
      store.insertAiAction({
        id: `act-${i}`,
        timestamp: NOW - i * 1_000,
        agent: i < 3 ? 'ai-fix-pr' : 'mcp-tool',
        action: 'invoked',
        fingerprint: i % 2 === 0 ? 'fp-a' : 'fp-b',
        outcome: i % 2 === 0 ? 'proposed' : 'errored',
      });
    }
  }

  test('filters by agent + outcome via parseListFilter', () => {
    store = openStore();
    seed();
    const params = new URLSearchParams('agent=ai-fix-pr&outcome=proposed');
    const filter = parseListFilter(params);
    const { rows, total } = listAiActions(store, filter);
    expect(rows.every((r) => r.agent === 'ai-fix-pr' && r.outcome === 'proposed')).toBe(true);
    expect(total).toBe(rows.length);
  });

  test('parseListFilter accepts multiple outcome values', () => {
    store = openStore();
    seed();
    const params = new URLSearchParams();
    params.append('outcome', 'proposed');
    params.append('outcome', 'errored');
    const filter = parseListFilter(params);
    expect(Array.isArray(filter.outcome)).toBe(true);
    const { total } = listAiActions(store, filter);
    expect(total).toBe(6);
  });

  test('parseListFilter clamps limit + offset', () => {
    const params = new URLSearchParams('limit=99999&offset=-5');
    const filter = parseListFilter(params);
    expect(filter.limit).toBe(1000);
    expect(filter.offset).toBe(0);
  });

  test('list returns empty + total=0 when nothing matches', () => {
    store = openStore();
    const { rows, total } = listAiActions(store, { agent: 'nope' });
    expect(rows).toEqual([]);
    expect(total).toBe(0);
  });
});
