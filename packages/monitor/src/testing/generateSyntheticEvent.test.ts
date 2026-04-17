import {
  generateSyntheticEvent,
  generateSyntheticEventBatch,
  isSyntheticEvent,
  SYNTHETIC_MARKER,
  type SyntheticEventType,
} from './generateSyntheticEvent';

describe('generateSyntheticEvent', () => {
  it('returns a well-formed MonitorEvent with the synthetic marker', () => {
    const e = generateSyntheticEvent('crash');
    expect(e.type).toBe('crash');
    expect(typeof e.timestamp).toBe('number');
    expect(typeof e.wallTime).toBe('number');
    expect(typeof e.sessionId).toBe('string');
    expect((e.data as Record<string, unknown>)[SYNTHETIC_MARKER]).toBe(true);
  });

  it('uses per-type defaults that match real collector shapes', () => {
    const crash = generateSyntheticEvent('crash').data as Record<
      string,
      unknown
    >;
    expect(crash.kind).toBe('exception');
    expect(crash.isFatal).toBe(false);
    expect(typeof crash.fingerprint).toBe('string');

    const network = generateSyntheticEvent('network').data as Record<
      string,
      unknown
    >;
    expect(network.method).toBe('GET');
    expect(network.statusCode).toBe(200);

    const frameDrop = generateSyntheticEvent('frame_drop').data as Record<
      string,
      unknown
    >;
    expect(typeof frameDrop.droppedFrames).toBe('number');
    expect(typeof frameDrop.dropRatio).toBe('number');
  });

  it('shallow-merges data overrides over defaults', () => {
    const e = generateSyntheticEvent('network', {
      data: { statusCode: 500, url: 'https://api.custom/x' },
    });
    const d = e.data as Record<string, unknown>;
    expect(d.statusCode).toBe(500);
    expect(d.url).toBe('https://api.custom/x');
    expect(d.method).toBe('GET'); // default preserved
  });

  it('respects timestamp / wallTime / sessionId overrides', () => {
    const e = generateSyntheticEvent('custom', {
      timestamp: 123,
      wallTime: 456,
      sessionId: 'custom-session',
    });
    expect(e.timestamp).toBe(123);
    expect(e.wallTime).toBe(456);
    expect(e.sessionId).toBe('custom-session');
  });

  it('native_metrics fills sampledAt with now when not overridden', () => {
    const e = generateSyntheticEvent('native_metrics');
    const data = e.data as { sampledAt: number };
    expect(data.sampledAt).toBeGreaterThan(0);
  });

  it('throws for an unknown type', () => {
    expect(() =>
      generateSyntheticEvent('not_a_type' as unknown as SyntheticEventType),
    ).toThrow(/unknown type/);
  });

  it('produces a distinct object per call (no shared defaults)', () => {
    const a = generateSyntheticEvent('crash');
    const b = generateSyntheticEvent('crash');
    (a.data as { fingerprint: string }).fingerprint = 'mutated';
    expect((b.data as { fingerprint: string }).fingerprint).toBe(
      'synthetic-crash-001',
    );
  });

  it('covers every advertised SyntheticEventType', () => {
    const types: SyntheticEventType[] = [
      'crash',
      'network',
      'navigation',
      'render',
      'custom',
      'frame_drop',
      'long_task',
      'memory',
      'startup',
      'native_anr',
      'native_metrics',
      'native_thermal',
      'breadcrumb',
      'touch',
      'frustration',
      'state',
      'suspense',
      'activity',
      'image',
      'a11y',
      'storage',
      'dual_thread_fps',
      'fabric_commit',
    ];
    for (const t of types) {
      const e = generateSyntheticEvent(t);
      expect(e.type).toBe(t);
      expect(isSyntheticEvent(e)).toBe(true);
    }
  });
});

describe('generateSyntheticEventBatch', () => {
  it('returns exactly `count` events', () => {
    const batch = generateSyntheticEventBatch({ count: 50 });
    expect(batch).toHaveLength(50);
  });

  it('advances timestamps by stepMs between events', () => {
    const batch = generateSyntheticEventBatch({
      count: 3,
      startTimestamp: 1000,
      stepMs: 50,
    });
    expect(batch[0]?.timestamp).toBe(1000);
    expect(batch[1]?.timestamp).toBe(1050);
    expect(batch[2]?.timestamp).toBe(1100);
  });

  it('every event has the synthetic marker', () => {
    const batch = generateSyntheticEventBatch({ count: 20 });
    for (const e of batch) {
      expect(isSyntheticEvent(e)).toBe(true);
    }
  });

  it('honors the sessionId option', () => {
    const batch = generateSyntheticEventBatch({
      count: 5,
      sessionId: 'batch-session',
    });
    for (const e of batch) {
      expect(e.sessionId).toBe('batch-session');
    }
  });

  it('respects a custom mix', () => {
    const batch = generateSyntheticEventBatch({
      count: 10,
      mix: [['crash', 1]], // 100% crashes
    });
    for (const e of batch) expect(e.type).toBe('crash');
  });

  it('produces a realistic distribution by default', () => {
    const batch = generateSyntheticEventBatch({ count: 200 });
    const counts = new Map<string, number>();
    for (const e of batch) {
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    }
    // Default mix weighs render highest — should dominate.
    expect((counts.get('render') ?? 0)).toBeGreaterThan(
      (counts.get('crash') ?? 0),
    );
    expect(counts.size).toBeGreaterThanOrEqual(5);
  });

  it('returns empty for non-positive count', () => {
    expect(generateSyntheticEventBatch({ count: 0 })).toEqual([]);
    expect(generateSyntheticEventBatch({ count: -5 })).toEqual([]);
  });

  it('returns empty when the mix has zero total weight', () => {
    expect(
      generateSyntheticEventBatch({
        count: 10,
        mix: [['crash', 0]],
      }),
    ).toEqual([]);
  });
});

describe('isSyntheticEvent', () => {
  it('recognizes synthetic events', () => {
    expect(isSyntheticEvent(generateSyntheticEvent('crash'))).toBe(true);
  });

  it('returns false for a real-looking event without the marker', () => {
    expect(
      isSyntheticEvent({
        type: 'crash',
        timestamp: 0,
        wallTime: 0,
        sessionId: 's',
        data: { kind: 'exception', message: 'real boom' },
      }),
    ).toBe(false);
  });

  it('returns false for events with non-object data', () => {
    expect(
      isSyntheticEvent({
        type: 'custom',
        timestamp: 0,
        wallTime: 0,
        sessionId: 's',
        data: null,
      }),
    ).toBe(false);
  });
});
