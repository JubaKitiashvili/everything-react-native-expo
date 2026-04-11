import type { MonitorEvent } from '../types';

export interface PatternMatch {
  pattern: Pattern;
  strength: number; // 0..1
}

export interface Pattern {
  id: string;
  category:
    | 'performance'
    | 'accessibility'
    | 'crash'
    | 'memory'
    | 'network'
    | 'render'
    | 'storage';
  title: string;
  /** Human-readable suggestion message. */
  suggestion: string;
  /** Hint the agent can act on. */
  fixHint: string;
  /** Default confidence bump 0..1 if the match fires. */
  baseStrength: number;
  /** Predicate evaluating the incoming event. */
  test(event: MonitorEvent): boolean;
}

const BUILTIN_PATTERNS: Pattern[] = [
  {
    id: 'RN-001',
    category: 'performance',
    title: 'Unnecessary re-render',
    suggestion:
      'Component is re-rendering 3+ times per second with identical props. Wrap it in React.memo or stabilize parent callbacks with useCallback.',
    fixHint: 'wrap-memo',
    baseStrength: 0.8,
    test: (e) => {
      if (e.type !== 'render') return false;
      const d = e.data as { isUnnecessary?: boolean; renderCount?: number };
      return !!d.isUnnecessary && (d.renderCount ?? 0) >= 3;
    },
  },
  {
    id: 'RN-002',
    category: 'network',
    title: '5xx server error',
    suggestion:
      'Endpoint returned a 5xx response. Consider exponential backoff and a user-visible retry affordance.',
    fixHint: 'retry-with-backoff',
    baseStrength: 0.7,
    test: (e) => {
      if (e.type !== 'network') return false;
      const d = e.data as { statusCode?: number };
      return (d.statusCode ?? 0) >= 500;
    },
  },
  {
    id: 'RN-003',
    category: 'network',
    title: 'Network failure',
    suggestion:
      'Request failed without a status code. Check connectivity, add offline fallbacks, and surface the failure to the user.',
    fixHint: 'offline-fallback',
    baseStrength: 0.75,
    test: (e) => {
      if (e.type !== 'network') return false;
      const d = e.data as { statusCode?: number | null; errorMessage?: string };
      return !!d.errorMessage && d.statusCode === null;
    },
  },
  {
    id: 'RN-004',
    category: 'crash',
    title: 'Cannot read property of undefined',
    suggestion:
      'Null / undefined access crash. Add a guard, use optional chaining, or fix the upstream data contract.',
    fixHint: 'add-null-guard',
    baseStrength: 0.85,
    test: (e) => {
      if (e.type !== 'crash') return false;
      const msg = (e.data as { message?: string }).message ?? '';
      return /Cannot read propert(y|ies) .* of (undefined|null)/i.test(msg);
    },
  },
  {
    id: 'RN-005',
    category: 'crash',
    title: 'Unhandled promise rejection',
    suggestion:
      'Promise rejected without a handler. Wrap awaited calls in try/catch or chain .catch() to surface the failure.',
    fixHint: 'add-catch',
    baseStrength: 0.7,
    test: (e) => {
      if (e.type !== 'crash') return false;
      const d = e.data as { kind?: string };
      return d.kind === 'unhandled-rejection';
    },
  },
  {
    id: 'RN-006',
    category: 'performance',
    title: 'Long JS task',
    suggestion:
      '>50ms JS thread block detected. Move the work off the main thread (InteractionManager, worker, or Reanimated worklet).',
    fixHint: 'offload-long-task',
    baseStrength: 0.65,
    test: (e) => {
      if (e.type !== 'custom') return false;
      const d = e.data as { name?: string; attributes?: { durationMs?: number } };
      if (d.name !== 'longTask') return false;
      return (d.attributes?.durationMs ?? 0) >= 50;
    },
  },
  {
    id: 'RN-007',
    category: 'performance',
    title: 'Oversized image',
    suggestion:
      'Image is at least 2× larger than its display size. Resize server-side, use responsive sources, or crop before display.',
    fixHint: 'resize-image',
    baseStrength: 0.8,
    test: (e) => {
      if (e.type !== 'custom') return false;
      const d = e.data as { name?: string; attributes?: { oversized?: boolean } };
      return d.name === 'image' && !!d.attributes?.oversized;
    },
  },
  {
    id: 'RN-008',
    category: 'accessibility',
    title: 'Missing accessibility label',
    suggestion:
      'Interactive element has no accessibilityLabel. Screen readers will read "unlabeled" to users — add a descriptive label.',
    fixHint: 'add-accessibility-label',
    baseStrength: 0.9,
    test: (e) => {
      if (e.type !== 'custom') return false;
      const d = e.data as { name?: string; attributes?: { violation?: string } };
      return d.name === 'a11y' && d.attributes?.violation === 'missing-label';
    },
  },
  {
    id: 'RN-009',
    category: 'accessibility',
    title: 'Touch target too small',
    suggestion:
      'Touch target is smaller than 44×44 points. Expand the target or use hitSlop to keep the visual size while enlarging the hit area.',
    fixHint: 'expand-touch-target',
    baseStrength: 0.8,
    test: (e) => {
      if (e.type !== 'custom') return false;
      const d = e.data as { name?: string; attributes?: { violation?: string } };
      return (
        d.name === 'a11y' && d.attributes?.violation === 'small-touch-target'
      );
    },
  },
  {
    id: 'RN-010',
    category: 'memory',
    title: 'Memory pressure',
    suggestion:
      'App is using >80% of available memory. Release large caches, decode smaller images, or lazy-load heavy modules.',
    fixHint: 'reduce-memory',
    baseStrength: 0.7,
    test: (e) => {
      if (e.type !== 'custom') return false;
      const d = e.data as { name?: string; attributes?: { overThreshold?: boolean } };
      return d.name === 'memory' && !!d.attributes?.overThreshold;
    },
  },
  {
    id: 'RN-011',
    category: 'storage',
    title: 'AsyncStorage pressure',
    suggestion:
      'More than 100 AsyncStorage operations per second. Batch writes or switch to expo-sqlite for hot keys.',
    fixHint: 'batch-storage',
    baseStrength: 0.7,
    test: (e) => {
      if (e.type !== 'custom') return false;
      const d = e.data as {
        name?: string;
        attributes?: { warning?: string; backend?: string };
      };
      if (d.name !== 'storage') return false;
      return !!d.attributes?.warning?.includes('ops-per-second');
    },
  },
  {
    id: 'RN-012',
    category: 'storage',
    title: 'Oversized AsyncStorage value',
    suggestion:
      'Single AsyncStorage value exceeds 500KB. Move this to expo-file-system or expo-sqlite.',
    fixHint: 'move-large-value',
    baseStrength: 0.75,
    test: (e) => {
      if (e.type !== 'custom') return false;
      const d = e.data as {
        name?: string;
        attributes?: { warning?: string };
      };
      if (d.name !== 'storage') return false;
      return !!d.attributes?.warning?.includes('value size');
    },
  },
  {
    id: 'RN-013',
    category: 'performance',
    title: 'Sustained frame drop',
    suggestion:
      'FPS dropped below 55 for >500ms. Check for layout-heavy renders, synchronous measurements, or JSON.parse on the main thread.',
    fixHint: 'investigate-frame-drop',
    baseStrength: 0.7,
    test: (e) => {
      if (e.type !== 'render') return false;
      const d = e.data as { frameDrop?: { droppedFrames?: number } };
      return !!d.frameDrop && (d.frameDrop.droppedFrames ?? 0) > 0;
    },
  },
  {
    id: 'RN-014',
    category: 'performance',
    title: 'Wasted render in hidden Activity',
    suggestion:
      '<Activity mode="hidden"> is re-rendering children. Use state that is fenced off by the Activity so hidden subtrees skip work.',
    fixHint: 'fence-activity-state',
    baseStrength: 0.75,
    test: (e) => {
      if (e.type !== 'custom') return false;
      const d = e.data as {
        name?: string;
        attributes?: { wastedRenderCount?: number };
      };
      return (
        d.name === 'activity' && (d.attributes?.wastedRenderCount ?? 0) >= 3
      );
    },
  },
  {
    id: 'RN-015',
    category: 'performance',
    title: 'Slow Suspense fallback',
    suggestion:
      'Suspense boundary is showing its fallback for >3 seconds. Prefetch the data, split the boundary, or switch to <Activity>.',
    fixHint: 'prefetch-suspense',
    baseStrength: 0.7,
    test: (e) => {
      if (e.type !== 'custom') return false;
      const d = e.data as {
        name?: string;
        attributes?: { fallbackDurationMs?: number };
      };
      return (
        d.name === 'suspense' && (d.attributes?.fallbackDurationMs ?? 0) > 3000
      );
    },
  },
  {
    id: 'RN-016',
    category: 'performance',
    title: 'Rage tap',
    suggestion:
      'User tapped the same target 3+ times in 2s — the UI likely feels unresponsive. Investigate handler latency or add visual feedback.',
    fixHint: 'investigate-handler-latency',
    baseStrength: 0.85,
    test: (e) => {
      if (e.type !== 'custom') return false;
      const d = e.data as {
        name?: string;
        attributes?: { signals?: string[] };
      };
      return (
        d.name === 'frustration' &&
        Array.isArray(d.attributes?.signals) &&
        d.attributes.signals.includes('rage-tap')
      );
    },
  },
  {
    id: 'RN-017',
    category: 'performance',
    title: 'Error tap',
    suggestion:
      'A crash happened within 1 second of a tap. The handler is throwing — add boundary error handling and log the input.',
    fixHint: 'guard-handler',
    baseStrength: 0.95,
    test: (e) => {
      if (e.type !== 'custom') return false;
      const d = e.data as {
        name?: string;
        attributes?: { signals?: string[] };
      };
      return (
        d.name === 'frustration' &&
        Array.isArray(d.attributes?.signals) &&
        d.attributes.signals.includes('error-tap')
      );
    },
  },
  {
    id: 'RN-018',
    category: 'render',
    title: 'Re-render storm',
    suggestion:
      'A component rendered >10 times in a second. Check for inline object/function props being recreated each parent render.',
    fixHint: 'stabilize-props',
    baseStrength: 0.85,
    test: (e) => {
      if (e.type !== 'render') return false;
      const d = e.data as { renderCount?: number; windowMs?: number };
      return (d.renderCount ?? 0) >= 10 && (d.windowMs ?? 1000) <= 1000;
    },
  },
  {
    id: 'RN-019',
    category: 'crash',
    title: 'Native view crash',
    suggestion:
      'Exception originated in a native view (bridge). Update the affected module, check recent dependency bumps, or fall back to a pure-JS component.',
    fixHint: 'investigate-native',
    baseStrength: 0.7,
    test: (e) => {
      if (e.type !== 'crash') return false;
      const d = e.data as { stack?: string | null };
      const stack = d.stack ?? '';
      return /native|NSException|java\.lang|_NSCFException/.test(stack);
    },
  },
  {
    id: 'RN-020',
    category: 'network',
    title: 'Slow request',
    suggestion:
      'Request took >2s. Add a timeout, consider caching, or check backend latency.',
    fixHint: 'investigate-latency',
    baseStrength: 0.6,
    test: (e) => {
      if (e.type !== 'network') return false;
      const d = e.data as { durationMs?: number; statusCode?: number | null };
      return (d.durationMs ?? 0) > 2000 && (d.statusCode ?? 0) >= 200;
    },
  },
];

/**
 * Library of known React Native issue patterns. ConfidenceScorer uses
 * the best match's `baseStrength` to boost its score. Developers can
 * register additional patterns via `addPattern`.
 */
export class PatternLibrary {
  private readonly patterns: Pattern[];

  constructor(initial: readonly Pattern[] = BUILTIN_PATTERNS) {
    this.patterns = [...initial];
  }

  addPattern(pattern: Pattern): void {
    this.patterns.push(pattern);
  }

  /** Returns the best matching pattern for an event (highest strength), or null. */
  match(event: import('../types').MonitorEvent): PatternMatch | null {
    let best: PatternMatch | null = null;
    for (const p of this.patterns) {
      try {
        if (!p.test(event)) continue;
      } catch {
        continue;
      }
      const candidate: PatternMatch = { pattern: p, strength: p.baseStrength };
      if (!best || candidate.strength > best.strength) best = candidate;
    }
    return best;
  }

  all(): readonly Pattern[] {
    return this.patterns;
  }

  static builtinCount(): number {
    return BUILTIN_PATTERNS.length;
  }
}
