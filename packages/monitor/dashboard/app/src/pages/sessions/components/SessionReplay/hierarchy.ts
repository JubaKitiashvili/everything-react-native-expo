/**
 * Captured UI hierarchy for a single replay frame.
 *
 * Unlike the ReplayMasker panel (which evaluates masking *rules* against a
 * sample tree at config time), this is the read-only view tree the SDK
 * *already captured* and attached to each `replay_frame` event. Masking has
 * already been decided on-device, so each node simply carries a `masked` flag
 * — there are no rules to apply here.
 *
 * The replay_frame payload does not yet ship this tree in the current schema
 * (it only carries `image`, `screen`, `masks`). We define a sensible shape and
 * consume `payload.hierarchy` when present; the lead seeds matching data. The
 * shape is intentionally a superset of ReplayMasker's `HierarchyNode` so both
 * panels speak the same vocabulary.
 */
export interface HierarchyNode {
  /** Stable per-frame node id (e.g. native view tag / RN nativeID). */
  id: string;
  /** Coarse element kind, mirroring ReplayMasker's vocabulary. */
  kind: HierarchyKind;
  /** Visible text content, if any. Already redacted on-device if masked. */
  text?: string;
  /** Accessibility role/label captured alongside the node, if any. */
  role?: string;
  /** True when the SDK redacted this node before upload (PII mask). */
  masked: boolean;
  /** Child nodes in render order. */
  children: HierarchyNode[];
}

export type HierarchyKind = 'text' | 'input' | 'image' | 'container' | 'unknown';

const KNOWN_KINDS: readonly HierarchyKind[] = [
  'text',
  'input',
  'image',
  'container',
  'unknown',
];

/** A node flattened for indented rendering: keeps its depth in the tree. */
export interface FlatHierarchyNode {
  node: HierarchyNode;
  depth: number;
}

/**
 * Normalize an unknown payload value into a clean `HierarchyNode` tree.
 *
 * Accepts a single node object, an array of root nodes, or anything else
 * (returns `null` for non-objects, empty arrays, etc.). Unknown fields are
 * dropped; missing ids are synthesized so rendering keys stay stable; `kind`
 * falls back to `'unknown'`; `masked` coerces to a strict boolean; children
 * recurse and silently drop malformed entries.
 *
 * Pure + total: never throws, regardless of input shape.
 */
export function normalizeHierarchy(input: unknown): HierarchyNode | null {
  if (Array.isArray(input)) {
    const roots = input.map((n, i) => normalizeNode(n, `root-${i}`)).filter(isNode);
    if (roots.length === 0) return null;
    if (roots.length === 1) return roots[0]!;
    // Multiple roots — wrap in a synthetic container so callers always get one
    // tree to render. The wrapper is unmasked and carries no text.
    return { id: 'root', kind: 'container', masked: false, children: roots };
  }
  return normalizeNode(input, 'root');
}

function normalizeNode(input: unknown, fallbackId: string): HierarchyNode | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : fallbackId;
  const kind = normalizeKind(raw.kind);
  const masked = raw.masked === true;

  const node: HierarchyNode = { id, kind, masked, children: [] };
  if (typeof raw.text === 'string') node.text = raw.text;
  if (typeof raw.role === 'string') node.role = raw.role;

  if (Array.isArray(raw.children)) {
    node.children = raw.children
      .map((child, i) => normalizeNode(child, `${id}-${i}`))
      .filter(isNode);
  }
  return node;
}

function normalizeKind(value: unknown): HierarchyKind {
  return typeof value === 'string' && (KNOWN_KINDS as readonly string[]).includes(value)
    ? (value as HierarchyKind)
    : 'unknown';
}

function isNode(value: HierarchyNode | null): value is HierarchyNode {
  return value !== null;
}

/** Total node count in the tree, including the root. */
export function countNodes(root: HierarchyNode | null): number {
  if (!root) return 0;
  let total = 1;
  for (const child of root.children) total += countNodes(child);
  return total;
}

/** Count of nodes whose `masked` flag is set, anywhere in the tree. */
export function countMaskedNodes(root: HierarchyNode | null): number {
  if (!root) return 0;
  let total = root.masked ? 1 : 0;
  for (const child of root.children) total += countMaskedNodes(child);
  return total;
}

/**
 * Flatten the tree into a depth-tagged pre-order list, ready for indented
 * rendering. Returns an empty array for `null` so callers can map directly.
 */
export function flattenHierarchy(root: HierarchyNode | null, depth = 0): FlatHierarchyNode[] {
  if (!root) return [];
  const out: FlatHierarchyNode[] = [{ node: root, depth }];
  for (const child of root.children) {
    out.push(...flattenHierarchy(child, depth + 1));
  }
  return out;
}
