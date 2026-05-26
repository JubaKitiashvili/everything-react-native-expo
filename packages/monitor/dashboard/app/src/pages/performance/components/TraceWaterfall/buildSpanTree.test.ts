import { describe, expect, test } from 'vitest';
import type { EventRecord } from '@/shared/api/types';
import {
  buildLatestTraceTree,
  buildSpanTree,
  extractSpans,
  formatDurationMs,
  type RawSpan,
} from './buildSpanTree';

function span(id: string, startMs: number, durationMs: number, parentId?: string): RawSpan {
  return { id, name: id, startMs, durationMs, ...(parentId ? { parentId } : {}) };
}

describe('buildSpanTree', () => {
  test('returns an empty tree for no spans', () => {
    const tree = buildSpanTree([]);
    expect(tree.roots).toEqual([]);
    expect(tree.spanCount).toBe(0);
    expect(tree.durationMs).toBe(0);
  });

  test('a single span is the sole root spanning the whole window', () => {
    const tree = buildSpanTree([span('root', 1_000, 200)]);
    expect(tree.roots).toHaveLength(1);
    expect(tree.spanCount).toBe(1);
    expect(tree.traceStart).toBe(1_000);
    expect(tree.traceEnd).toBe(1_200);
    expect(tree.durationMs).toBe(200);
    const root = tree.roots[0]!;
    expect(root.depth).toBe(0);
    expect(root.offset).toBe(0);
    expect(root.width).toBe(1);
    expect(root.endMs).toBe(1_200);
  });

  test('nests children by parentId and assigns depth', () => {
    const tree = buildSpanTree([
      span('root', 0, 100),
      span('child-a', 10, 30, 'root'),
      span('child-b', 50, 40, 'root'),
      span('grandchild', 55, 10, 'child-b'),
    ]);

    expect(tree.spanCount).toBe(4);
    expect(tree.roots).toHaveLength(1);
    const root = tree.roots[0]!;
    expect(root.id).toBe('root');
    expect(root.depth).toBe(0);
    // Children sorted by start time: child-a (10) before child-b (50).
    expect(root.children.map((c) => c.id)).toEqual(['child-a', 'child-b']);
    expect(root.children[0]!.depth).toBe(1);

    const childB = root.children[1]!;
    expect(childB.children.map((c) => c.id)).toEqual(['grandchild']);
    expect(childB.children[0]!.depth).toBe(2);
  });

  test('computes offset and width as fractions of the trace window', () => {
    // Window: 0 → 200 (length 200).
    const tree = buildSpanTree([
      span('root', 0, 200),
      span('mid', 50, 100, 'root'), // offset 50/200 = 0.25, width 100/200 = 0.5
    ]);
    const root = tree.roots[0]!;
    expect(root.offset).toBe(0);
    expect(root.width).toBe(1);
    const mid = root.children[0]!;
    expect(mid.offset).toBeCloseTo(0.25, 5);
    expect(mid.width).toBeCloseTo(0.5, 5);
  });

  test('orphan spans (missing or unknown parent) become roots', () => {
    const tree = buildSpanTree([
      span('a', 0, 50),
      span('orphan', 60, 20, 'ghost-parent'), // parent does not exist
      span('b', 100, 30), // no parentId
    ]);
    expect(tree.roots.map((r) => r.id)).toEqual(['a', 'orphan', 'b']);
    expect(tree.spanCount).toBe(3);
    expect(tree.roots.every((r) => r.depth === 0)).toBe(true);
  });

  test('a span that names itself as parent is treated as a root (no self-loop)', () => {
    const tree = buildSpanTree([span('loop', 0, 10, 'loop')]);
    expect(tree.roots.map((r) => r.id)).toEqual(['loop']);
    expect(tree.spanCount).toBe(1);
  });

  test('zero-length window yields zero width/offset', () => {
    const tree = buildSpanTree([span('a', 1_000, 0), span('b', 1_000, 0)]);
    expect(tree.durationMs).toBe(0);
    for (const root of tree.roots) {
      expect(root.offset).toBe(0);
      expect(root.width).toBe(0);
    }
  });

  test('clamps negative duration to zero', () => {
    const tree = buildSpanTree([span('root', 0, 100), span('weird', 10, -5, 'root')]);
    const weird = tree.roots[0]!.children[0]!;
    expect(weird.durationMs).toBe(0);
    expect(weird.endMs).toBe(10);
  });

  test('computes checkpoint offsets relative to the trace window', () => {
    const tree = buildSpanTree([
      {
        id: 'root',
        name: 'root',
        startMs: 0,
        durationMs: 100,
        checkpoints: [
          { label: 'first-byte', atMs: 25 },
          { label: 'done', atMs: 100 },
        ],
      },
    ]);
    const root = tree.roots[0]!;
    expect(root.checkpoints).toHaveLength(2);
    expect(root.checkpointOffsets[0]).toEqual({ label: 'first-byte', offset: 0.25 });
    expect(root.checkpointOffsets[1]).toEqual({ label: 'done', offset: 1 });
  });

  test('is deterministic: ties on start time break by id', () => {
    const tree = buildSpanTree([span('z', 10, 5), span('a', 10, 5), span('m', 10, 5)]);
    expect(tree.roots.map((r) => r.id)).toEqual(['a', 'm', 'z']);
  });

  test('ignores spans with invalid id / start / duration', () => {
    const tree = buildSpanTree([
      { id: '', name: 'empty', startMs: 0, durationMs: 10 },
      { id: 'nan', name: 'nan', startMs: Number.NaN, durationMs: 10 },
      span('ok', 0, 10),
    ]);
    expect(tree.spanCount).toBe(1);
    expect(tree.roots[0]!.id).toBe('ok');
  });
});

function trace(id: string, timestamp: number, payload: Record<string, unknown>): EventRecord {
  return {
    id,
    type: 'trace',
    severity: 'info',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 5,
    payload,
  };
}

describe('extractSpans', () => {
  test('reads payload.spans defensively, dropping malformed entries', () => {
    const spans = extractSpans({
      spans: [
        { id: 'a', name: 'a', startMs: 0, durationMs: 10, parentId: 'x', attributes: { k: 1 } },
        { id: 'b', name: 'b', startMs: 5, durationMs: 5 },
        { id: 'c' }, // missing fields
        null,
        'nope',
      ],
    });
    expect(spans.map((s) => s.id)).toEqual(['a', 'b']);
    expect(spans[0]!.parentId).toBe('x');
    expect(spans[0]!.attributes).toEqual({ k: 1 });
  });

  test('keeps only well-formed checkpoints', () => {
    const spans = extractSpans({
      spans: [
        {
          id: 'a',
          name: 'a',
          startMs: 0,
          durationMs: 10,
          checkpoints: [{ label: 'ok', atMs: 3 }, { label: 'bad' }, { atMs: 5 }],
        },
      ],
    });
    expect(spans[0]!.checkpoints).toEqual([{ label: 'ok', atMs: 3 }]);
  });

  test('returns empty when spans is absent or not an array', () => {
    expect(extractSpans({})).toEqual([]);
    expect(extractSpans({ spans: 'nope' })).toEqual([]);
  });
});

describe('buildLatestTraceTree', () => {
  test('picks the newest trace event that carries spans', () => {
    const events: EventRecord[] = [
      trace('old', 100, { spans: [span('old-root', 0, 10)] }),
      trace('new', 300, { spans: [span('new-root', 0, 20), span('new-child', 5, 5, 'new-root')] }),
      trace('empty', 400, { spans: [] }),
      { ...trace('not-trace', 500, { spans: [span('x', 0, 1)] }), type: 'network' },
    ];
    const tree = buildLatestTraceTree(events);
    expect(tree.roots.map((r) => r.id)).toEqual(['new-root']);
    expect(tree.spanCount).toBe(2);
  });

  test('returns an empty tree when there are no usable trace events', () => {
    const tree = buildLatestTraceTree([trace('e', 1, { spans: [] })]);
    expect(tree.spanCount).toBe(0);
  });
});

describe('formatDurationMs', () => {
  test('ms / seconds tiers', () => {
    expect(formatDurationMs(450)).toBe('450 ms');
    expect(formatDurationMs(2_350)).toBe('2.35 s');
    expect(formatDurationMs(42_000)).toBe('42.0 s');
  });
});
