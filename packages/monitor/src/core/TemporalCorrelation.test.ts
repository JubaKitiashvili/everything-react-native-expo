import {
  buildTimeline,
  correlate,
  TEMPORAL_CORRELATION_DEFAULTS,
  type TemporalEvent,
} from './TemporalCorrelation';

const js = (ts: number, type = 'js'): TemporalEvent => ({ timestamp: ts, type });
const nat = (ts: number, type = 'native'): TemporalEvent => ({
  timestamp: ts,
  type,
});

describe('TemporalCorrelation', () => {
  describe('buildTimeline ordering', () => {
    it('merges JS and native events into ascending timestamp order', () => {
      const timeline = buildTimeline(
        [js(300, 'navigation'), js(100, 'network')],
        [nat(200, 'anr')],
      );
      expect(timeline.map((e) => e.timestamp)).toEqual([100, 200, 300]);
      expect(timeline.map((e) => e.origin)).toEqual(['js', 'native', 'js']);
      expect(timeline.map((e) => e.event.type)).toEqual([
        'network',
        'anr',
        'navigation',
      ]);
    });

    it('assigns stable ids by origin and original index', () => {
      const timeline = buildTimeline([js(10), js(20)], [nat(15)]);
      const byId = new Map(timeline.map((e) => [e.id, e]));
      expect(byId.get('js-0')?.timestamp).toBe(10);
      expect(byId.get('js-1')?.timestamp).toBe(20);
      expect(byId.get('native-0')?.timestamp).toBe(15);
    });

    it('preserves the original event object untouched', () => {
      const original = { timestamp: 5, type: 'crash', extra: 42 };
      const [entry] = buildTimeline([original], []);
      expect(entry?.event).toBe(original);
    });
  });

  describe('window grouping (inside / outside)', () => {
    it('groups a JS + native event that fall within the window', () => {
      const timeline = buildTimeline([js(1000)], [nat(1050)], 100);
      const jsEntry = timeline.find((e) => e.id === 'js-0');
      const nativeEntry = timeline.find((e) => e.id === 'native-0');
      expect(jsEntry?.correlatedWith).toEqual(['native-0']);
      expect(nativeEntry?.correlatedWith).toEqual(['js-0']);
    });

    it('does not group events outside the window', () => {
      const timeline = buildTimeline([js(1000)], [nat(1200)], 100);
      expect(timeline.every((e) => e.correlatedWith === undefined)).toBe(true);
    });

    it('treats the window edge as inclusive', () => {
      const inside = buildTimeline([js(1000)], [nat(1100)], 100);
      expect(inside.find((e) => e.id === 'js-0')?.correlatedWith).toEqual([
        'native-0',
      ]);
      const outside = buildTimeline([js(1000)], [nat(1101)], 100);
      expect(
        outside.find((e) => e.id === 'js-0')?.correlatedWith,
      ).toBeUndefined();
    });

    it('uses the default 100ms window when none is supplied', () => {
      expect(TEMPORAL_CORRELATION_DEFAULTS.windowMs).toBe(100);
      const grouped = buildTimeline([js(0)], [nat(80)]);
      expect(grouped.find((e) => e.origin === 'js')?.correlatedWith).toEqual([
        'native-0',
      ]);
      const ungrouped = buildTimeline([js(0)], [nat(150)]);
      expect(
        ungrouped.find((e) => e.origin === 'js')?.correlatedWith,
      ).toBeUndefined();
    });

    it('links a single event to multiple co-occurring events of the other origin', () => {
      const timeline = buildTimeline([js(1000)], [nat(990), nat(1010)], 50);
      const jsEntry = timeline.find((e) => e.id === 'js-0');
      expect(jsEntry?.correlatedWith).toEqual(['native-0', 'native-1']);
    });

    it('never correlates events of the same origin', () => {
      // Two JS events 10ms apart with a generous window — must NOT link.
      const timeline = buildTimeline([js(1000), js(1005)], [], 1000);
      expect(timeline.every((e) => e.correlatedWith === undefined)).toBe(true);
    });
  });

  describe('empty inputs', () => {
    it('returns an empty timeline for empty inputs', () => {
      expect(buildTimeline([], [])).toEqual([]);
      expect(correlate([], [])).toEqual([]);
    });

    it('handles one side empty', () => {
      const jsOnly = buildTimeline([js(1), js(2)], []);
      expect(jsOnly.map((e) => e.origin)).toEqual(['js', 'js']);
      expect(jsOnly.every((e) => e.correlatedWith === undefined)).toBe(true);

      const nativeOnly = buildTimeline([], [nat(1)]);
      expect(nativeOnly.map((e) => e.origin)).toEqual(['native']);
    });
  });

  describe('tie-breaking on equal timestamps', () => {
    it('orders JS before native at the same timestamp', () => {
      const timeline = buildTimeline([js(500)], [nat(500)], 0);
      expect(timeline.map((e) => e.origin)).toEqual(['js', 'native']);
      // Exact-timestamp match still co-occurs with a zero window.
      expect(timeline[0]?.correlatedWith).toEqual(['native-0']);
    });

    it('keeps insertion order for same-origin same-timestamp events', () => {
      const a = js(100, 'a');
      const b = js(100, 'b');
      const timeline = buildTimeline([a, b], []);
      expect(timeline.map((e) => e.event.type)).toEqual(['a', 'b']);
      expect(timeline.map((e) => e.id)).toEqual(['js-0', 'js-1']);
    });

    it('produces a fully deterministic ordering across origins and ties', () => {
      const timeline = buildTimeline(
        [js(100, 'j0'), js(100, 'j1'), js(200, 'j2')],
        [nat(100, 'n0'), nat(150, 'n1')],
      );
      expect(timeline.map((e) => e.id)).toEqual([
        'js-0',
        'js-1',
        'native-0',
        'native-1',
        'js-2',
      ]);
    });
  });

  describe('correlate', () => {
    it('returns links with absolute deltas', () => {
      const links = correlate([js(1000)], [nat(1040)], 100);
      expect(links).toEqual([{ jsId: 'js-0', nativeId: 'native-0', deltaMs: 40 }]);
    });

    it('coerces a negative or non-finite window to exact matching', () => {
      expect(correlate([js(10)], [nat(10)], -5)).toEqual([
        { jsId: 'js-0', nativeId: 'native-0', deltaMs: 0 },
      ]);
      expect(correlate([js(10)], [nat(11)], -5)).toEqual([]);
      expect(correlate([js(10)], [nat(10)], Number.NaN)).toEqual([
        { jsId: 'js-0', nativeId: 'native-0', deltaMs: 0 },
      ]);
    });

    it('enumerates the full cross product within the window', () => {
      const links = correlate([js(100), js(120)], [nat(110), nat(115)], 50);
      expect(links).toHaveLength(4);
    });
  });
});
