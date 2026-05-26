// Task 117.65 — operator audit log helper unit tests.

import { afterEach, describe, expect, test, vi } from 'vitest';
import { DashboardStore } from '../storage/sqliteStore.js';
import { listAuditLogs, parseListFilter, recordAuditEvent } from './auditLog.js';
import type { AuditLogRecord } from '../storage/types.js';

const NOW = 1_770_000_000_000;
const now = (): number => NOW;

function openStore(): DashboardStore {
  return new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
}

describe('recordAuditEvent', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('writes a fully-populated row + returns the record', () => {
    store = openStore();
    const rec = recordAuditEvent(
      store,
      {
        action: 'export',
        actor: 'alice',
        targetType: 'user',
        targetId: 'user-1',
        ip: '203.0.113.9',
        metadata: { sessions: 2, events: 50 },
      },
      undefined,
      now,
    );
    expect(rec).not.toBeNull();
    expect(rec?.timestamp).toBe(NOW);
    const rows = store.listAuditLogs();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe('export');
    expect(rows[0]?.actor).toBe('alice');
    expect(rows[0]?.ip).toBe('203.0.113.9');
    expect(rows[0]?.metadata).toEqual({ sessions: 2, events: 50 });
  });

  test('defaults actor to "anonymous" when none provided', () => {
    store = openStore();
    recordAuditEvent(store, { action: 'login' }, undefined, now);
    expect(store.listAuditLogs()[0]?.actor).toBe('anonymous');
  });

  test('scrubs ANSI / tag carriers from free-form fields', () => {
    store = openStore();
    recordAuditEvent(
      store,
      { action: 'delete', actor: '\x1b[31mbob<system>hi</system>', targetId: 'u\x00x' },
      undefined,
      now,
    );
    const row = store.listAuditLogs()[0];
    expect(row?.actor).toBe('bobhi');
    expect(row?.targetId).toBe('ux');
  });

  test('drops cyclic metadata rather than throwing', () => {
    store = openStore();
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    const rec = recordAuditEvent(store, { action: 'config-change', metadata: cyclic }, undefined, now);
    expect(rec).not.toBeNull();
    expect(store.listAuditLogs()[0]?.metadata).toBeUndefined();
  });

  test('drops oversized metadata (>16 KB)', () => {
    store = openStore();
    const huge = { blob: 'x'.repeat(20 * 1024) };
    recordAuditEvent(store, { action: 'config-change', metadata: huge }, undefined, now);
    expect(store.listAuditLogs()[0]?.metadata).toBeUndefined();
  });

  test('never throws + logs when the store write fails (best-effort)', () => {
    const warn = vi.fn();
    const throwingStore = {
      recordAuditLog(record: AuditLogRecord): { inserted: boolean } {
        void record;
        throw new Error('db down');
      },
    };
    const result = recordAuditEvent(
      throwingStore,
      { action: 'delete' },
      { warn },
      now,
    );
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith('audit.write_failed', expect.objectContaining({ action: 'delete' }));
  });
});

describe('listAuditLogs', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('returns { rows, total } honouring the filter', () => {
    store = openStore();
    recordAuditEvent(store, { action: 'export', actor: 'alice' }, undefined, now);
    recordAuditEvent(store, { action: 'delete', actor: 'bob' }, undefined, now);
    const all = listAuditLogs(store);
    expect(all.total).toBe(2);
    const filtered = listAuditLogs(store, { actor: 'alice' });
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0]?.action).toBe('export');
  });
});

describe('parseListFilter', () => {
  test('parses every supported param', () => {
    const params = new URLSearchParams();
    params.set('since', '100');
    params.set('until', '200');
    params.set('actor', 'alice');
    params.set('targetType', 'user');
    params.set('targetId', 'user-1');
    params.append('action', 'export');
    params.append('action', 'delete');
    params.set('limit', '5');
    params.set('offset', '10');
    const filter = parseListFilter(params);
    expect(filter).toEqual({
      since: 100,
      until: 200,
      actor: 'alice',
      targetType: 'user',
      targetId: 'user-1',
      action: ['export', 'delete'],
      limit: 5,
      offset: 10,
    });
  });

  test('single action collapses to a scalar; invalid numerics fall back', () => {
    const params = new URLSearchParams();
    params.append('action', 'login');
    params.set('limit', 'not-a-number');
    const filter = parseListFilter(params);
    expect(filter.action).toBe('login');
    expect(filter.limit).toBeUndefined();
  });

  test('clamps limit to [1, 1000]', () => {
    expect(parseListFilter(new URLSearchParams('limit=9999')).limit).toBe(1000);
    expect(parseListFilter(new URLSearchParams('limit=0')).limit).toBe(1);
  });
});
