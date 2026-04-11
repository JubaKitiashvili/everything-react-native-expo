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
