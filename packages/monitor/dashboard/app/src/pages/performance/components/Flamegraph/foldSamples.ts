/**
 * Pure transform: fold raw Hermes profile samples into a flame tree.
 *
 * The SDK emits `type: 'profile'` events whose payload carries a list of
 * stack samples (root → leaf function names) with a weight (self time in
 * ms, microseconds, or sample count — the unit is opaque here, we only
 * sum). We fold those into a tree where every node knows its total value,
 * its own self time, its depth, and pre-computed horizontal extents in the
 * 0..1 range so the renderer can position rectangles without any layout
 * math of its own.
 */

/** One folded stack: `frames` are ordered root→leaf, `weight` is its cost. */
export interface ProfileSample {
  frames: string[];
  weight: number;
}

/** Shape consumed from a `type: 'profile'` event's `payload`. */
export interface ProfilePayload {
  samples: ProfileSample[];
}

export interface FlameNode {
  name: string;
  /** Total weight of this frame and everything beneath it. */
  value: number;
  /** Weight attributed directly to this frame (samples that ended here). */
  self: number;
  /** 0 = synthetic root. */
  depth: number;
  /** Left edge as a fraction of the root total, 0..1. */
  x0: number;
  /** Right edge as a fraction of the root total, 0..1. `x1 - x0` is the width. */
  x1: number;
  children: FlameNode[];
}

const ROOT_NAME = 'root';

/**
 * Fold samples into a single root `FlameNode`. Children are ordered
 * deterministically (descending value, then name) so renders and tests are
 * stable. Returns `null` when there is nothing to show.
 */
export function foldSamples(payload: ProfilePayload | null | undefined): FlameNode | null {
  const samples = payload?.samples;
  if (!Array.isArray(samples) || samples.length === 0) return null;

  const root: MutableNode = makeNode(ROOT_NAME, 0);

  let total = 0;
  for (const sample of samples) {
    const weight = toFiniteWeight(sample?.weight);
    if (weight <= 0) continue;
    const frames = Array.isArray(sample?.frames)
      ? sample.frames.filter((f): f is string => typeof f === 'string')
      : [];
    if (frames.length === 0) continue;

    total += weight;
    root.value += weight;

    let cursor = root;
    for (let depth = 0; depth < frames.length; depth++) {
      const name = frames[depth]!;
      let child = cursor.childMap.get(name);
      if (!child) {
        child = makeNode(name, depth + 1);
        cursor.childMap.set(name, child);
        cursor.children.push(child);
      }
      child.value += weight;
      cursor = child;
    }
    // The leaf accrues the self time for this stack.
    cursor.self += weight;
  }

  if (total === 0) return null;

  return finalize(root, 0, 1);
}

interface MutableNode {
  name: string;
  value: number;
  self: number;
  depth: number;
  children: MutableNode[];
  childMap: Map<string, MutableNode>;
}

function makeNode(name: string, depth: number): MutableNode {
  return { name, value: 0, self: 0, depth, children: [], childMap: new Map() };
}

/**
 * Walk the mutable tree depth-first, assigning each node a slice of its
 * parent's [x0, x1] proportional to its value. Children are laid out
 * left-to-right in deterministic order.
 */
function finalize(node: MutableNode, x0: number, x1: number): FlameNode {
  const span = x1 - x0;
  const sorted = [...node.children].sort(compareNodes);
  const children: FlameNode[] = [];

  let cursorX = x0;
  for (const child of sorted) {
    const childSpan = node.value > 0 ? (child.value / node.value) * span : 0;
    const childX1 = cursorX + childSpan;
    children.push(finalize(child, cursorX, childX1));
    cursorX = childX1;
  }

  return {
    name: node.name,
    value: node.value,
    self: node.self,
    depth: node.depth,
    x0,
    x1,
    children,
  };
}

function compareNodes(a: MutableNode, b: MutableNode): number {
  if (b.value !== a.value) return b.value - a.value;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function toFiniteWeight(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Flatten the tree into a depth-ordered list — handy for rendering rows. */
export function flattenFlame(root: FlameNode): FlameNode[] {
  const out: FlameNode[] = [];
  const stack: FlameNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    out.push(node);
    // Push in reverse so siblings come out left-to-right.
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]!);
    }
  }
  return out;
}
