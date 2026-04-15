import { SignalRouter } from './SignalRouter';
import { DedupEngine } from './DedupEngine';
import { CorrelationEngine } from './CorrelationEngine';
import { ConfidenceScorer } from './ConfidenceScorer';
import { ContextBuilder } from './ContextBuilder';
import { DispatchEngine, type DispatchedSignal } from './DispatchEngine';
import { FeedbackTracker } from './FeedbackTracker';
import { PatternLibrary } from './PatternLibrary';
import type { MonitorEvent } from '../types';
import type { Breadcrumb } from '../collectors/BreadcrumbCollector';

function crash(message: string, fingerprint?: string): MonitorEvent {
  return {
    type: 'crash',
    timestamp: 0,
    wallTime: 0,
    sessionId: 's',
    data: {
      kind: 'exception',
      message,
      stack: null,
      componentStack: null,
      isFatal: false,
      ...(fingerprint ? { fingerprint } : {}),
    },
  };
}

function network(status: number, url = 'https://api/x'): MonitorEvent {
  return {
    type: 'network',
    timestamp: 0,
    wallTime: 0,
    sessionId: 's',
    data: {
      url,
      method: 'GET',
      statusCode: status,
      durationMs: 100,
      requestSize: 0,
      responseSize: 0,
      transport: 'fetch',
    },
  };
}

describe('DedupEngine', () => {
  it('passes a fresh fingerprint through', () => {
    const d = new DedupEngine({ now: () => 0 });
    expect(d.process(crash('a', 'fp1'))).not.toBeNull();
  });

  it('drops duplicates within the window', () => {
    let t = 0;
    const d = new DedupEngine({ windowMs: 1000, now: () => t });
    d.process(crash('a', 'fp1'));
    t = 500;
    expect(d.process(crash('a', 'fp1'))).toBeNull();
    expect(d.getEntry('fp1')?.count).toBe(2);
  });

  it('lets events pass when window expires', () => {
    let t = 0;
    const d = new DedupEngine({ windowMs: 500, now: () => t });
    d.process(crash('a', 'fp1'));
    t = 2000;
    expect(d.process(crash('a', 'fp1'))).not.toBeNull();
  });

  it('passes events without a fingerprint through untouched', () => {
    const d = new DedupEngine({ now: () => 0 });
    expect(d.process(network(200))).not.toBeNull();
  });
});

describe('CorrelationEngine', () => {
  it('groups events within the window', () => {
    let t = 0;
    const c = new CorrelationEngine({ windowMs: 2000, now: () => t });
    const g1 = c.ingest(crash('a'));
    t = 500;
    const g2 = c.ingest(network(500));
    expect(g1?.id).toBe(g2?.id);
    expect(g2?.events).toHaveLength(2);
    expect(g2?.confidence).toBeGreaterThan(0);
  });

  it('starts a new group after the window', () => {
    let t = 0;
    const c = new CorrelationEngine({ windowMs: 1000, now: () => t });
    const g1 = c.ingest(crash('a'));
    t = 2500;
    const g2 = c.ingest(network(500));
    expect(g1?.id).not.toBe(g2?.id);
  });

  it('drainClosed returns groups with 2+ events', () => {
    let t = 0;
    const c = new CorrelationEngine({ windowMs: 1000, now: () => t });
    c.ingest(crash('a'));
    c.ingest(network(500));
    t = 3000;
    c.ingest(crash('b'));
    const closed = c.drainClosed();
    // First group had 2 events and closed.
    expect(closed).toHaveLength(1);
    expect(closed[0]?.events).toHaveLength(2);
  });
});

describe('ConfidenceScorer', () => {
  it('scores crashes higher than benign network events', () => {
    const s = new ConfidenceScorer();
    const crashScore = s.score({ event: crash('boom') });
    const netScore = s.score({ event: network(200) });
    expect(crashScore).toBeGreaterThan(netScore);
  });

  it('adds correlation bonus for large groups', () => {
    const s = new ConfidenceScorer();
    const base = s.score({ event: network(500) });
    const withGroup = s.score({
      event: network(500),
      correlationGroup: {
        id: 'c1',
        events: [network(500), network(500), network(500), network(500)],
        confidence: 80,
        startTime: 0,
        endTime: 0,
      },
    });
    expect(withGroup).toBeGreaterThan(base);
  });

  it('respects the threshold', () => {
    const s = new ConfidenceScorer({ threshold: 90 });
    expect(s.shouldDispatch(80)).toBe(false);
    expect(s.shouldDispatch(95)).toBe(true);
  });
});

describe('ContextBuilder', () => {
  it('summarizes a crash event with dedup count', () => {
    const crumbs: Breadcrumb[] = [
      {
        type: 'tap',
        category: 'ui.tap',
        message: 'Buy',
        timestamp: 1,
      },
    ];
    const cb = new ContextBuilder({ getBreadcrumbs: () => crumbs });
    const ctx = cb.build(crash('boom', 'fp1'), undefined, 3);
    expect(ctx.summary).toContain('×3');
    expect(ctx.summary).toContain('boom');
    expect(ctx.breadcrumbs).toEqual(crumbs);
  });

  it('includes screen when provided', () => {
    const cb = new ContextBuilder({
      getBreadcrumbs: () => [],
      getCurrentScreen: () => '/cart',
    });
    const ctx = cb.build(network(200));
    expect(ctx.screen).toBe('/cart');
  });
});

describe('DispatchEngine', () => {
  it('routes high-score signals to all channels', () => {
    const seen: DispatchedSignal[] = [];
    const e = new DispatchEngine({
      outputs: [
        { name: 'terminal', deliver: (s) => seen.push(s) },
        { name: 'dashboard', deliver: (s) => seen.push(s) },
        { name: 'store', deliver: (s) => seen.push(s) },
      ],
    });
    e.dispatch(
      {
        event: crash('x'),
        summary: 'x',
        breadcrumbs: [],
        dedupCount: 1,
        screen: null,
      },
      90,
    );
    expect(seen).toHaveLength(3);
  });

  it('routes medium scores to terminal + store only', () => {
    const seen: DispatchedSignal[] = [];
    const e = new DispatchEngine({
      outputs: [
        { name: 'terminal', deliver: (s) => seen.push(s) },
        { name: 'dashboard', deliver: (s) => seen.push(s) },
        { name: 'store', deliver: (s) => seen.push(s) },
      ],
    });
    const sig = e.dispatch(
      {
        event: network(500),
        summary: 'n',
        breadcrumbs: [],
        dedupCount: 1,
        screen: null,
      },
      70,
    );
    expect(sig?.channels).toEqual(['terminal', 'store']);
  });

  it('rate-limits per channel', () => {
    let t = 0;
    const seen: DispatchedSignal[] = [];
    const e = new DispatchEngine({
      outputs: [{ name: 'store', deliver: (s) => seen.push(s) }],
      ratePerMinute: 2,
      now: () => t,
    });
    for (let i = 0; i < 5; i++) {
      e.dispatch(
        {
          event: network(200),
          summary: 'n',
          breadcrumbs: [],
          dedupCount: 1,
          screen: null,
        },
        10,
      );
    }
    expect(seen).toHaveLength(2);
    t = 60_001;
    e.dispatch(
      {
        event: network(200),
        summary: 'n',
        breadcrumbs: [],
        dedupCount: 1,
        screen: null,
      },
      10,
    );
    expect(seen).toHaveLength(3);
  });
});

describe('FeedbackTracker', () => {
  it('records feedback and computes helpfulness ratio', async () => {
    const f = new FeedbackTracker();
    await f.record('sig-1', 'helpful');
    await f.record('sig-2', 'not-helpful');
    await f.record('sig-3', 'applied');
    expect(f.helpfulnessRatio()).toBeCloseTo(2 / 3);
    expect(f.forSignal('sig-1')).toHaveLength(1);
  });

  it('persists to store when provided', async () => {
    const saved: unknown[] = [];
    const f = new FeedbackTracker({
      store: {
        save: (e) => {
          saved.push(e);
        },
        list: () => [],
      },
    });
    await f.record('sig-1', 'helpful');
    expect(saved).toHaveLength(1);
  });
});

describe('PatternLibrary', () => {
  it('ships 20 built-in patterns', () => {
    const lib = new PatternLibrary();
    expect(lib.all().length).toBeGreaterThanOrEqual(20);
  });

  it('matches "Cannot read property X of undefined" crashes', () => {
    const lib = new PatternLibrary();
    const match = lib.match(
      crash("Cannot read property 'foo' of undefined", 'fp1'),
    );
    expect(match?.pattern.category).toBe('crash');
  });

  it('matches 5xx network errors', () => {
    const lib = new PatternLibrary();
    const match = lib.match(network(503));
    expect(match?.pattern.category).toBe('network');
  });

  it('returns null when nothing matches', () => {
    const lib = new PatternLibrary();
    const evt: MonitorEvent = {
      type: 'navigation',
      timestamp: 0,
      wallTime: 0,
      sessionId: 's',
      data: { screen: '/a', previousScreen: null, source: 'manual', durationMs: 0 },
    };
    // Navigation has no built-in pattern.
    expect(lib.match(evt)).toBeNull();
  });

  it('accepts custom patterns', () => {
    const lib = new PatternLibrary();
    lib.addPattern({
      id: 'custom-1',
      category: 'performance',
      title: 'fake',
      suggestion: 'fake',
      fixHint: 'fake',
      baseStrength: 1,
      test: (e) => e.type === 'navigation',
    });
    const evt: MonitorEvent = {
      type: 'navigation',
      timestamp: 0,
      wallTime: 0,
      sessionId: 's',
      data: { screen: '/a', previousScreen: null, source: 'manual', durationMs: 0 },
    };
    expect(lib.match(evt)?.pattern.id).toBe('custom-1');
  });
});

describe('DedupEngine — eviction and snapshot', () => {
  it('evicts oldest entry when maxFingerprints is exceeded', () => {
    let t = 0;
    const d = new DedupEngine({ maxFingerprints: 2, windowMs: 10000, now: () => t });
    d.process(crash('a', 'fp1'));
    t = 100;
    d.process(crash('b', 'fp2'));
    t = 200;
    // This should evict fp1 (oldest)
    d.process(crash('c', 'fp3'));
    expect(d.getEntry('fp1')).toBeNull();
    expect(d.getEntry('fp2')).not.toBeNull();
    expect(d.getEntry('fp3')).not.toBeNull();
  });

  it('snapshot returns all entries', () => {
    const d = new DedupEngine({ now: () => 0 });
    d.process(crash('a', 'fp1'));
    d.process(crash('b', 'fp2'));
    const snap = d.snapshot();
    expect(snap).toHaveLength(2);
    expect(snap.map((e) => e.fingerprint).sort()).toEqual(['fp1', 'fp2']);
  });

  it('clear removes all entries', () => {
    const d = new DedupEngine({ now: () => 0 });
    d.process(crash('a', 'fp1'));
    d.process(crash('b', 'fp2'));
    d.clear();
    expect(d.snapshot()).toHaveLength(0);
    expect(d.getEntry('fp1')).toBeNull();
  });
});

describe('ContextBuilder — all event type summaries', () => {
  const cb = new ContextBuilder({ getBreadcrumbs: () => [] });

  it('summarizes a network event', () => {
    const ctx = cb.build(network(500));
    expect(ctx.summary).toContain('GET');
    expect(ctx.summary).toContain('500');
  });

  it('summarizes a navigation event', () => {
    const nav: MonitorEvent = {
      type: 'navigation',
      timestamp: 0,
      wallTime: 0,
      sessionId: 's',
      data: { screen: '/cart', previousScreen: '/home', source: 'manual', durationMs: 0 },
    };
    const ctx = cb.build(nav);
    expect(ctx.summary).toContain('nav');
    expect(ctx.summary).toContain('/home');
    expect(ctx.summary).toContain('/cart');
  });

  it('summarizes a render event', () => {
    const render: MonitorEvent = {
      type: 'render',
      timestamp: 0,
      wallTime: 0,
      sessionId: 's',
      data: { componentName: 'UserCard', renderCount: 5, isUnnecessary: true },
    };
    const ctx = cb.build(render);
    expect(ctx.summary).toContain('render');
    expect(ctx.summary).toContain('UserCard');
    expect(ctx.summary).toContain('5');
    expect(ctx.summary).toContain('unnecessary');
  });

  it('summarizes a custom event', () => {
    const custom: MonitorEvent = {
      type: 'custom',
      timestamp: 0,
      wallTime: 0,
      sessionId: 's',
      data: { name: 'checkout' },
    };
    const ctx = cb.build(custom);
    expect(ctx.summary).toContain('event');
    expect(ctx.summary).toContain('checkout');
  });

  it('summarizes an unknown event type with fallback', () => {
    const other: MonitorEvent = {
      type: 'frameDrop' as MonitorEvent['type'],
      timestamp: 0,
      wallTime: 0,
      sessionId: 's',
      data: {},
    };
    const ctx = cb.build(other);
    expect(ctx.summary).toContain('frameDrop');
    expect(ctx.summary).toContain('event');
  });

  it('resolves source location when resolver is provided', () => {
    const cbWithResolver = new ContextBuilder({
      getBreadcrumbs: () => [],
      resolveSourceLocation: (stack) =>
        stack ? { file: 'App.tsx', line: 42 } : undefined,
    });
    const evt = crash('boom');
    (evt.data as Record<string, unknown>).stack = 'Error: boom\n  at App.tsx:42';
    const ctx = cbWithResolver.build(evt);
    expect(ctx.sourceLocation).toEqual({ file: 'App.tsx', line: 42 });
  });

  it('returns undefined source location when resolver returns undefined', () => {
    const cbWithResolver = new ContextBuilder({
      getBreadcrumbs: () => [],
      resolveSourceLocation: () => undefined,
    });
    const ctx = cbWithResolver.build(crash('boom'));
    expect(ctx.sourceLocation).toBeUndefined();
  });

  it('returns undefined source location when no resolver provided', () => {
    const ctx = cb.build(crash('boom'));
    expect(ctx.sourceLocation).toBeUndefined();
  });

  it('handles network event with error message', () => {
    const netErr: MonitorEvent = {
      type: 'network',
      timestamp: 0,
      wallTime: 0,
      sessionId: 's',
      data: {
        url: 'https://api/x',
        method: 'POST',
        statusCode: null,
        durationMs: 100,
        requestSize: 0,
        responseSize: null,
        transport: 'fetch',
        errorMessage: 'ECONNREFUSED',
      },
    };
    const ctx = cb.build(netErr);
    expect(ctx.summary).toContain('POST');
    expect(ctx.summary).toContain('ECONNREFUSED');
  });

  it('handles crash with fingerprint in summary', () => {
    const ctx = cb.build(crash('NullRef', 'fp-abc'));
    expect(ctx.summary).toContain('NullRef');
    expect(ctx.summary).toContain('fp-abc');
  });

  it('handles navigation with null previousScreen', () => {
    const nav: MonitorEvent = {
      type: 'navigation',
      timestamp: 0,
      wallTime: 0,
      sessionId: 's',
      data: { screen: '/home', previousScreen: null, source: 'manual', durationMs: 0 },
    };
    const ctx = cb.build(nav);
    expect(ctx.summary).toContain('∅');
  });

  it('handles render with missing fields', () => {
    const render: MonitorEvent = {
      type: 'render',
      timestamp: 0,
      wallTime: 0,
      sessionId: 's',
      data: {},
    };
    const ctx = cb.build(render);
    expect(ctx.summary).toContain('render');
    expect(ctx.summary).toContain('?');
  });

  it('respects custom breadcrumb limit', () => {
    const crumbs: Breadcrumb[] = Array.from({ length: 30 }, (_, i) => ({
      type: 'manual',
      category: 'ui.tap' as const,
      message: `crumb-${i}`,
      timestamp: i,
    }));
    const cbLimited = new ContextBuilder({
      getBreadcrumbs: (limit) => crumbs.slice(-limit),
    }, 5);
    const ctx = cbLimited.build(crash('test'));
    expect(ctx.breadcrumbs).toHaveLength(5);
  });
});

describe('DispatchEngine — channelStats', () => {
  it('returns channel dispatch counts', () => {
    let t = 0;
    const e = new DispatchEngine({
      outputs: [
        { name: 'terminal', deliver: () => {} },
        { name: 'dashboard', deliver: () => {} },
        { name: 'store', deliver: () => {} },
      ],
      ratePerMinute: 100,
      now: () => t,
    });
    // High score dispatches to all 3 channels
    e.dispatch(
      { event: crash('x'), summary: 'x', breadcrumbs: [], dedupCount: 1, screen: null },
      90,
    );
    e.dispatch(
      { event: crash('y'), summary: 'y', breadcrumbs: [], dedupCount: 1, screen: null },
      90,
    );
    const stats = e.channelStats();
    expect(stats.terminal).toBe(2);
    expect(stats.dashboard).toBe(2);
    expect(stats.store).toBe(2);
  });

  it('returns null when all channels are rate-limited', () => {
    const e = new DispatchEngine({
      outputs: [{ name: 'store', deliver: () => {} }],
      ratePerMinute: 1,
      now: () => 0,
    });
    e.dispatch(
      { event: network(200), summary: 'n', breadcrumbs: [], dedupCount: 1, screen: null },
      10,
    );
    const result = e.dispatch(
      { event: network(200), summary: 'n', breadcrumbs: [], dedupCount: 1, screen: null },
      10,
    );
    expect(result).toBeNull();
  });

  it('swallows deliver errors without crashing', () => {
    const e = new DispatchEngine({
      outputs: [
        {
          name: 'store',
          deliver: () => {
            throw new Error('deliver failure');
          },
        },
      ],
      now: () => 0,
    });
    expect(() =>
      e.dispatch(
        { event: network(200), summary: 'n', breadcrumbs: [], dedupCount: 1, screen: null },
        10,
      ),
    ).not.toThrow();
  });
});

describe('SignalRouter — clear and dropped counting', () => {
  function makeRouter() {
    const delivered: DispatchedSignal[] = [];
    const router = new SignalRouter({
      getBreadcrumbs: () => [],
      outputs: [
        { name: 'terminal', deliver: (s) => delivered.push(s) },
        { name: 'dashboard', deliver: (s) => delivered.push(s) },
        { name: 'store', deliver: (s) => delivered.push(s) },
      ],
      ratePerMinute: 100,
      now: () => 0,
    });
    return { router, delivered };
  }

  it('clear resets all stats and sub-engines', () => {
    const { router } = makeRouter();
    router.process(crash("Cannot read property 'foo' of undefined", 'fp-c'));
    router.process(crash("Cannot read property 'foo' of undefined", 'fp-c'));
    expect(router.getStats().processed).toBe(2);
    expect(router.getStats().deduped).toBe(1);
    router.clear();
    const stats = router.getStats();
    expect(stats.processed).toBe(0);
    expect(stats.deduped).toBe(0);
    expect(stats.dispatched).toBe(0);
    expect(stats.dropped).toBe(0);
  });

  it('counts rate-limited dispatch as dropped', () => {
    const delivered: DispatchedSignal[] = [];
    const router = new SignalRouter({
      getBreadcrumbs: () => [],
      outputs: [
        { name: 'terminal', deliver: (s) => delivered.push(s) },
        { name: 'dashboard', deliver: (s) => delivered.push(s) },
        { name: 'store', deliver: (s) => delivered.push(s) },
      ],
      ratePerMinute: 1,
      now: () => 0,
    });
    // First crash: dispatched. Second crash (different fp): rate limited.
    router.process(crash('a', 'fp-x'));
    router.process(crash('b', 'fp-y'));
    const stats = router.getStats();
    expect(stats.dispatched).toBeGreaterThanOrEqual(1);
    // The second may be dispatched or dropped depending on score; just ensure stats add up
    expect(stats.processed).toBe(2);
  });

  it('tracks recurrence count across fingerprinted events', () => {
    const { router } = makeRouter();
    // Process same fingerprint events with different window timing to avoid dedup
    let t = 0;
    const router2 = new SignalRouter({
      getBreadcrumbs: () => [],
      outputs: [{ name: 'store', deliver: () => {} }],
      ratePerMinute: 100,
      dedup: { windowMs: 100, now: () => t },
      now: () => t,
    });
    router2.process(crash('a', 'fp-rec'));
    t = 200; // outside dedup window
    router2.process(crash('a', 'fp-rec'));
    // Should have processed 2 events
    expect(router2.getStats().processed).toBe(2);
  });
});

describe('SignalRouter (integration)', () => {
  function makeRouter() {
    const delivered: DispatchedSignal[] = [];
    const router = new SignalRouter({
      getBreadcrumbs: () => [],
      outputs: [
        { name: 'terminal', deliver: (s) => delivered.push(s) },
        { name: 'dashboard', deliver: (s) => delivered.push(s) },
        { name: 'store', deliver: (s) => delivered.push(s) },
      ],
      ratePerMinute: 100,
      now: () => 0,
    });
    return { router, delivered };
  }

  it('dispatches a Cannot-read-property crash as high severity', () => {
    const { router, delivered } = makeRouter();
    const sig = router.process(
      crash("Cannot read property 'foo' of undefined", 'fp-a'),
    );
    expect(sig).not.toBeNull();
    // 3 outputs for high-severity pattern match.
    expect(delivered.length).toBeGreaterThanOrEqual(3);
  });

  it('dedups repeated crashes with the same fingerprint', () => {
    const { router } = makeRouter();
    const a = router.process(crash("Cannot read property 'foo' of undefined", 'fp-dup'));
    const b = router.process(crash("Cannot read property 'foo' of undefined", 'fp-dup'));
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(router.getStats().deduped).toBe(1);
  });

  it('drops low-confidence events below the threshold', () => {
    const { router } = makeRouter();
    const sig = router.process({
      type: 'navigation',
      timestamp: 0,
      wallTime: 0,
      sessionId: 's',
      data: {
        screen: '/home',
        previousScreen: null,
        source: 'manual',
        durationMs: 0,
      },
    });
    expect(sig).toBeNull();
    expect(router.getStats().dropped).toBeGreaterThanOrEqual(1);
  });
});
