import type { MonitorEvent, MonitorEventType } from '../types';

/**
 * Marker attached to every synthetic event's `data` payload. The
 * dashboard + metrics aggregators check for this so synthetic traffic
 * never contaminates real crash/perf statistics. `_synthetic: true` is
 * the stable contract — don't rename without migrating every consumer.
 */
export const SYNTHETIC_MARKER = '_synthetic';

export type SyntheticEventType =
  | 'crash'
  | 'network'
  | 'navigation'
  | 'render'
  | 'custom'
  | 'frame_drop'
  | 'long_task'
  | 'memory'
  | 'startup'
  | 'native_anr'
  | 'native_metrics'
  | 'native_thermal'
  | 'breadcrumb'
  | 'touch'
  | 'frustration'
  | 'state'
  | 'suspense'
  | 'activity'
  | 'image'
  | 'a11y'
  | 'storage'
  | 'dual_thread_fps'
  | 'fabric_commit';

export interface SyntheticEventOptions {
  /** Override timestamp (monotonic, for event.timestamp). */
  timestamp?: number;
  /** Override wallTime (Date.now()-style). */
  wallTime?: number;
  /** Override sessionId. */
  sessionId?: string;
  /**
   * Shallow-merge into the default per-type `data` payload. Anything you
   * don't set keeps the factory default so a minimal call still produces
   * a realistic event.
   */
  data?: Record<string, unknown>;
}

/**
 * Per-type default payloads — each shape matches what the real collector
 * would emit, so dashboards that filter by these fields render the
 * synthetic event exactly like a live one (modulo the `_synthetic`
 * marker).
 */
const DEFAULTS: Record<SyntheticEventType, Record<string, unknown>> = {
  crash: {
    kind: 'exception',
    message: '[synthetic] TypeError: Cannot read properties of undefined',
    stack:
      '[synthetic] Error\n    at SyntheticScreen.render (SyntheticScreen.tsx:42:10)',
    componentStack: null,
    isFatal: false,
    fingerprint: 'synthetic-crash-001',
    coalescedCount: 1,
  },
  network: {
    url: 'https://api.example.com/synthetic',
    method: 'GET',
    statusCode: 200,
    durationMs: 123,
    requestSize: null,
    responseSize: 512,
    transport: 'fetch',
  },
  navigation: {
    screen: 'SyntheticScreen',
    previousScreen: 'Home',
    source: 'manual',
    durationMs: 50,
  },
  render: {
    componentName: 'SyntheticComponent',
    renderCount: 5,
    totalDurationMs: 12,
    maxDurationMs: 4,
    isUnnecessary: true,
    reason: 'storm',
    windowMs: 1000,
  },
  custom: {
    name: 'synthetic_event',
    attributes: { source: 'generateSyntheticEvent' },
  },
  frame_drop: {
    droppedFrames: 10,
    expectedFrames: 30,
    durationMs: 500,
    averageFps: 40,
    minFps: 28,
    dropRatio: 0.33,
    screen: 'SyntheticScreen',
  },
  long_task: {
    durationMs: 120,
    detector: 'PerformanceObserver',
    source: 'synthetic',
  },
  memory: {
    usedBytes: 150 * 1024 * 1024,
    totalBytes: 6 * 1024 * 1024 * 1024,
  },
  startup: {
    kind: 'cold',
    durationMs: 850,
    tti: 1200,
    overBudget: false,
  },
  native_anr: {
    durationMs: 5500,
    mainThreadStack: [
      '[synthetic] main thread blocked',
      'JSON.parse (Synthetic.tsx:10:5)',
    ],
    screen: 'SyntheticScreen',
  },
  native_metrics: {
    cpuUsagePercent: 12,
    memoryUsedBytes: 256 * 1024 * 1024,
    memoryAvailableBytes: 2 * 1024 * 1024 * 1024,
    memoryTotalBytes: 6 * 1024 * 1024 * 1024,
    thermalState: 'nominal',
    batteryLevel: 0.75,
    batteryCharging: false,
    diskAvailableBytes: 20 * 1024 * 1024 * 1024,
    diskTotalBytes: 128 * 1024 * 1024 * 1024,
    sampledAt: 0,
  },
  native_thermal: {
    state: 'fair',
  },
  breadcrumb: {
    category: 'navigation',
    message: '[synthetic] breadcrumb',
    level: 'info',
  },
  touch: {
    target: 'SubmitButton',
    x: 100,
    y: 400,
  },
  frustration: {
    level: 'rage',
    target: 'SubmitButton',
    count: 3,
  },
  state: {
    storeName: 'syntheticStore',
    actionType: 'SYNTHETIC_ACTION',
    sizeBytes: 1024,
  },
  suspense: {
    boundaryId: 'SyntheticBoundary',
    durationMs: 1200,
    outcome: 'resolved',
  },
  activity: {
    componentName: 'SyntheticActivity',
    wastedRenderCount: 2,
  },
  image: {
    uri: 'https://cdn.example.com/synthetic.png',
    durationMs: 300,
    cacheMiss: true,
    oversized: false,
  },
  a11y: {
    rule: 'missing-label',
    componentName: 'SubmitButton',
    severity: 'warning',
  },
  storage: {
    operation: 'getItem',
    durationMs: 15,
    backend: 'AsyncStorage',
  },
  dual_thread_fps: {
    uiFPS: 58,
    jsFPS: 45,
  },
  fabric_commit: {
    commitCount: 3,
    avgCommitDuration: 8,
    maxCommitDuration: 14,
    yogaLayoutTime: 3,
    isLayoutThrashing: false,
  },
};

/**
 * Returns a well-formed `MonitorEvent` with the `_synthetic` marker set
 * on its `data` payload. Use in tests, dashboard fixtures, and alert
 * rule validation so none of this traffic shows up in real metrics.
 *
 * The returned event passes the same pipeline stages as a real one —
 * Sanitizer, AdaptiveSampler, SignalRouter all see it normally. Only
 * aggregation code that reads `data._synthetic` is expected to filter.
 */
export function generateSyntheticEvent(
  type: SyntheticEventType,
  options: SyntheticEventOptions = {},
): MonitorEvent {
  const defaults = DEFAULTS[type];
  if (!defaults) {
    throw new Error(
      `[monitor] generateSyntheticEvent: unknown type '${String(type)}'`,
    );
  }
  const now = Date.now();
  const timestamp = options.timestamp ?? now;
  const data: Record<string, unknown> = {
    ...defaults,
    ...(options.data ?? {}),
    [SYNTHETIC_MARKER]: true,
  };
  // `native_metrics` default uses sampledAt=0; patch to now if not
  // explicitly overridden so timestamps look plausible.
  if (type === 'native_metrics' && options.data?.sampledAt === undefined) {
    (data as { sampledAt: number }).sampledAt = now;
  }
  return {
    type: type as MonitorEventType,
    timestamp,
    wallTime: options.wallTime ?? now,
    sessionId: options.sessionId ?? 'synthetic-session',
    data,
  };
}

export interface BatchOptions {
  /** Number of events to produce. */
  count: number;
  /** Starting timestamp; each subsequent event advances by `stepMs`. */
  startTimestamp?: number;
  /** Milliseconds to advance per event. Default 100. */
  stepMs?: number;
  /** Session id for every event. Default 'synthetic-session'. */
  sessionId?: string;
  /**
   * Type distribution as a list of (type, weight) tuples. If omitted,
   * a realistic default mix is used (lots of navigation + renders,
   * a sprinkle of crashes + network).
   */
  mix?: ReadonlyArray<[SyntheticEventType, number]>;
}

const DEFAULT_MIX: ReadonlyArray<[SyntheticEventType, number]> = [
  ['navigation', 20],
  ['render', 35],
  ['network', 15],
  ['custom', 10],
  ['frame_drop', 5],
  ['long_task', 3],
  ['memory', 2],
  ['crash', 1],
  ['native_anr', 1],
  ['touch', 8],
];

/**
 * Produces a deterministic batch of synthetic events useful for
 * dashboard load tests, time-series rendering, and SignalRouter
 * throughput verification. Distribution defaults to a realistic app
 * mix; override via `options.mix` for targeted scenarios.
 */
export function generateSyntheticEventBatch(
  options: BatchOptions,
): MonitorEvent[] {
  if (!Number.isFinite(options.count) || options.count <= 0) return [];
  const stepMs = options.stepMs ?? 100;
  const startTimestamp = options.startTimestamp ?? Date.now();
  const mix = options.mix ?? DEFAULT_MIX;
  const totalWeight = mix.reduce((sum, [, w]) => sum + w, 0);
  if (totalWeight <= 0) return [];

  const out: MonitorEvent[] = [];
  for (let i = 0; i < options.count; i++) {
    const pick = ((i * 2654435761) % totalWeight + totalWeight) % totalWeight;
    let running = 0;
    let type: SyntheticEventType = mix[0]![0];
    for (const [t, w] of mix) {
      running += w;
      if (pick < running) {
        type = t;
        break;
      }
    }
    out.push(
      generateSyntheticEvent(type, {
        timestamp: startTimestamp + i * stepMs,
        wallTime: startTimestamp + i * stepMs,
        sessionId: options.sessionId,
      }),
    );
  }
  return out;
}

/** Returns true if the given event was produced by this helper. */
export function isSyntheticEvent(event: MonitorEvent): boolean {
  const data = event.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== 'object') return false;
  return data[SYNTHETIC_MARKER] === true;
}
