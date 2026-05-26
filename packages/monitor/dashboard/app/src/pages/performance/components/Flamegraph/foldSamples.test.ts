import { describe, expect, test } from 'vitest';
import { flattenFlame, foldSamples, type FlameNode } from './foldSamples';

function child(node: FlameNode, name: string): FlameNode {
  const found = node.children.find((c) => c.name === name);
  if (!found) throw new Error(`no child "${name}" under "${node.name}"`);
  return found;
}

describe('foldSamples', () => {
  test('returns null for empty / missing input', () => {
    expect(foldSamples(null)).toBeNull();
    expect(foldSamples(undefined)).toBeNull();
    expect(foldSamples({ samples: [] })).toBeNull();
  });

  test('folds a single stack into a linear tree spanning full width', () => {
    const root = foldSamples({ samples: [{ frames: ['a', 'b', 'c'], weight: 10 }] });
    expect(root).not.toBeNull();
    expect(root!.value).toBe(10);
    expect(root!.x0).toBe(0);
    expect(root!.x1).toBe(1);

    const a = child(root!, 'a');
    expect(a.depth).toBe(1);
    expect(a.value).toBe(10);
    expect(a.self).toBe(0);
    expect(a.x0).toBe(0);
    expect(a.x1).toBe(1);

    const c = child(child(a, 'b'), 'c');
    expect(c.depth).toBe(3);
    expect(c.self).toBe(10); // leaf accrues the self time
    expect(c.value).toBe(10);
    expect(c.x1 - c.x0).toBeCloseTo(1);
  });

  test('merges shared prefixes and splits divergent leaves by weight', () => {
    const root = foldSamples({
      samples: [
        { frames: ['main', 'render'], weight: 30 },
        { frames: ['main', 'layout'], weight: 10 },
      ],
    });
    const main = child(root!, 'main');
    expect(main.value).toBe(40); // 30 + 10 folded
    expect(main.self).toBe(0);
    expect(main.x0).toBe(0);
    expect(main.x1).toBeCloseTo(1);

    const render = child(main, 'render');
    const layout = child(main, 'layout');
    expect(render.value).toBe(30);
    expect(layout.value).toBe(10);
    // render is heavier → laid out first (left), spanning 75% of the width.
    expect(render.x0).toBeCloseTo(0);
    expect(render.x1).toBeCloseTo(0.75);
    expect(layout.x0).toBeCloseTo(0.75);
    expect(layout.x1).toBeCloseTo(1);
  });

  test('self vs total: an interior frame that is also a leaf in another sample', () => {
    const root = foldSamples({
      samples: [
        { frames: ['a', 'b'], weight: 5 }, // b interior here
        { frames: ['a'], weight: 3 }, // a is a leaf here → self time on a
      ],
    });
    const a = child(root!, 'a');
    expect(a.value).toBe(8); // total under a
    expect(a.self).toBe(3); // the stack that ended at a
    const b = child(a, 'b');
    expect(b.value).toBe(5);
    expect(b.self).toBe(5);
  });

  test('children of a node have contiguous extents that fill the parent span', () => {
    const root = foldSamples({
      samples: [
        { frames: ['r', 'x'], weight: 1 },
        { frames: ['r', 'y'], weight: 2 },
        { frames: ['r', 'z'], weight: 3 },
      ],
    });
    const r = child(root!, 'r');
    const sorted = [...r.children].sort((p, q) => p.x0 - q.x0);
    // No gaps, no overlaps, full coverage of [r.x0, r.x1].
    expect(sorted[0]!.x0).toBeCloseTo(r.x0);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.x0).toBeCloseTo(sorted[i - 1]!.x1);
    }
    expect(sorted[sorted.length - 1]!.x1).toBeCloseTo(r.x1);
  });

  test('ignores non-positive weights, non-string frames, and empty frame lists', () => {
    const root = foldSamples({
      samples: [
        { frames: ['keep'], weight: 4 },
        { frames: ['drop'], weight: 0 }, // zero weight
        { frames: ['drop'], weight: -2 }, // negative weight
        { frames: [], weight: 9 }, // no frames
      ],
    });
    expect(root!.value).toBe(4);
    expect(root!.children.map((c) => c.name)).toEqual(['keep']);
  });

  test('deterministic ordering: equal weights sort by name', () => {
    const root = foldSamples({
      samples: [
        { frames: ['root', 'beta'], weight: 5 },
        { frames: ['root', 'alpha'], weight: 5 },
      ],
    });
    const top = child(root!, 'root');
    expect(top.children.map((c) => c.name)).toEqual(['alpha', 'beta']);
  });
});

describe('flattenFlame', () => {
  test('emits nodes depth-first, siblings left-to-right', () => {
    const root = foldSamples({
      samples: [
        { frames: ['a', 'big'], weight: 9 },
        { frames: ['a', 'small'], weight: 1 },
      ],
    })!;
    const names = flattenFlame(root).map((n) => n.name);
    expect(names).toEqual(['root', 'a', 'big', 'small']);
  });
});
