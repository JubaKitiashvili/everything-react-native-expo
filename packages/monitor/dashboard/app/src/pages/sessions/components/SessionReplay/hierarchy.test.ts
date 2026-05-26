import { describe, expect, test } from 'vitest';
import {
  countMaskedNodes,
  countNodes,
  flattenHierarchy,
  normalizeHierarchy,
  type HierarchyNode,
} from './hierarchy';

describe('normalizeHierarchy', () => {
  test('normalizes a single node tree, coercing kind/masked and recursing children', () => {
    const tree = normalizeHierarchy({
      id: 'root',
      kind: 'container',
      children: [
        { id: 'label', kind: 'text', text: 'Welcome', role: 'header' },
        { id: 'pw', kind: 'input', text: '••••', masked: true },
      ],
    });
    expect(tree).not.toBeNull();
    expect(tree?.id).toBe('root');
    expect(tree?.kind).toBe('container');
    expect(tree?.masked).toBe(false);
    expect(tree?.children).toHaveLength(2);
    expect(tree?.children[0]?.role).toBe('header');
    expect(tree?.children[1]?.masked).toBe(true);
  });

  test('flags masked only for strict boolean true', () => {
    const tree = normalizeHierarchy({
      id: 'n',
      kind: 'input',
      // a truthy-but-not-true value must NOT mask
      masked: 'yes' as unknown,
    });
    expect(tree?.masked).toBe(false);
  });

  test('falls back to "unknown" kind and synthesizes missing ids', () => {
    const tree = normalizeHierarchy({
      kind: 'widget', // not a known kind
      children: [{ text: 'leaf-without-id' }],
    });
    expect(tree?.kind).toBe('unknown');
    expect(tree?.id).toBe('root');
    expect(tree?.children[0]?.id).toBe('root-0');
    expect(tree?.children[0]?.kind).toBe('unknown');
  });

  test('wraps multiple roots in a synthetic unmasked container', () => {
    const tree = normalizeHierarchy([
      { id: 'a', kind: 'text' },
      { id: 'b', kind: 'text' },
    ]);
    expect(tree?.id).toBe('root');
    expect(tree?.kind).toBe('container');
    expect(tree?.masked).toBe(false);
    expect(tree?.children.map((c) => c.id)).toEqual(['a', 'b']);
  });

  test('returns the single root directly when an array has one entry', () => {
    const tree = normalizeHierarchy([{ id: 'only', kind: 'image' }]);
    expect(tree?.id).toBe('only');
    expect(tree?.kind).toBe('image');
  });

  test('drops malformed children but keeps valid siblings', () => {
    const tree = normalizeHierarchy({
      id: 'root',
      kind: 'container',
      children: [null, 42, { id: 'ok', kind: 'text' }, 'nope'],
    });
    expect(tree?.children.map((c) => c.id)).toEqual(['ok']);
  });

  test('returns null for non-object, empty, and empty-array input', () => {
    expect(normalizeHierarchy(null)).toBeNull();
    expect(normalizeHierarchy(undefined)).toBeNull();
    expect(normalizeHierarchy('string')).toBeNull();
    expect(normalizeHierarchy(123)).toBeNull();
    expect(normalizeHierarchy([])).toBeNull();
    expect(normalizeHierarchy([null, 'x'])).toBeNull();
  });
});

describe('countNodes / countMaskedNodes', () => {
  const tree: HierarchyNode = {
    id: 'root',
    kind: 'container',
    masked: false,
    children: [
      { id: 'a', kind: 'text', masked: false, children: [] },
      {
        id: 'b',
        kind: 'container',
        masked: true,
        children: [{ id: 'c', kind: 'input', masked: true, children: [] }],
      },
    ],
  };

  test('counts every node including the root', () => {
    expect(countNodes(tree)).toBe(4);
  });

  test('counts only masked nodes', () => {
    expect(countMaskedNodes(tree)).toBe(2);
  });

  test('returns zero for a null tree', () => {
    expect(countNodes(null)).toBe(0);
    expect(countMaskedNodes(null)).toBe(0);
  });
});

describe('flattenHierarchy', () => {
  test('produces a depth-tagged pre-order list', () => {
    const tree: HierarchyNode = {
      id: 'root',
      kind: 'container',
      masked: false,
      children: [
        {
          id: 'a',
          kind: 'container',
          masked: false,
          children: [{ id: 'a1', kind: 'text', masked: false, children: [] }],
        },
        { id: 'b', kind: 'text', masked: false, children: [] },
      ],
    };
    const flat = flattenHierarchy(tree);
    expect(flat.map((f) => [f.node.id, f.depth])).toEqual([
      ['root', 0],
      ['a', 1],
      ['a1', 2],
      ['b', 1],
    ]);
  });

  test('returns an empty array for a null tree', () => {
    expect(flattenHierarchy(null)).toEqual([]);
  });
});
