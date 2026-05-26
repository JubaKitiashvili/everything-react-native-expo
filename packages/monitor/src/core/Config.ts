import type {
  CollectorMode,
  MonitorConfig,
  MonitorConfigOverrides,
  PerTypeSamplingRate,
} from '../types';

/**
 * Per-type sampling defaults — tuned so the SDK is quiet at idle even when
 * every collector is enabled. The goal is <10 events/minute on a static screen
 * in prod, while dev remains high-fidelity for crash/nav/custom.
 *
 * Chatty types (render, frame_drop) are aggressively down-sampled even in dev
 * because RenderCollector fires on every commit and FrameDropCollector on
 * every RAF tick. Rare-but-important types (navigation, crash, custom) stay
 * at 1.0 in both environments.
 */
export const DEFAULT_SAMPLING_BY_TYPE: Readonly<
  Record<string, PerTypeSamplingRate>
> = Object.freeze({
  render: Object.freeze({ dev: 0.05, prod: 0.01 }),
  frame_drop: Object.freeze({ dev: 1.0, prod: 0.2 }),
  long_task: Object.freeze({ dev: 1.0, prod: 0.5 }),
  navigation: Object.freeze({ dev: 1.0, prod: 1.0 }),
  network: Object.freeze({ dev: 1.0, prod: 0.5 }),
  memory: Object.freeze({ dev: 1.0, prod: 1.0 }),
  startup: Object.freeze({ dev: 1.0, prod: 1.0 }),
  custom: Object.freeze({ dev: 1.0, prod: 1.0 }),
  touch: Object.freeze({ dev: 1.0, prod: 0.1 }),
  breadcrumb: Object.freeze({ dev: 1.0, prod: 1.0 }),
  frustration: Object.freeze({ dev: 1.0, prod: 1.0 }),
  suspense: Object.freeze({ dev: 1.0, prod: 0.5 }),
  activity: Object.freeze({ dev: 0.1, prod: 0.01 }),
  image: Object.freeze({ dev: 0.2, prod: 0.05 }),
  a11y: Object.freeze({ dev: 1.0, prod: 0.5 }),
  storage: Object.freeze({ dev: 1.0, prod: 0.2 }),
  state: Object.freeze({ dev: 0.5, prod: 0.1 }),
  native_metrics: Object.freeze({ dev: 1.0, prod: 0.1 }),
  native_thermal: Object.freeze({ dev: 1.0, prod: 1.0 }),
  native_anr: Object.freeze({ dev: 1.0, prod: 1.0 }),
  interrupted_span: Object.freeze({ dev: 1.0, prod: 1.0 }),
  dual_thread_fps: Object.freeze({ dev: 0.5, prod: 0.1 }),
  fabric_commit: Object.freeze({ dev: 0.5, prod: 0.1 }),
});

/**
 * Default configuration for @erne/monitor.
 *
 * Values mirror the example in design-spec §8 "Developer Experience", minus
 * fields that belong to later phases (routing, otelEndpoint). Phase 1a keeps
 * the shape narrow so collectors and transport can evolve without churning
 * user-facing config.
 */
export const DEFAULT_MONITOR_CONFIG: MonitorConfig = Object.freeze({
  collectors: Object.freeze({
    crash: true,
    network: true,
    navigation: true,
    custom: true,
    render: 'dev',
    frameDrop: 'dev',
    state: 'dev',
    a11y: 'dev',
    memory: true,
    startup: true,
    replay: 'dev',
  }) as Readonly<Record<string, CollectorMode>>,
  sampling: Object.freeze({
    dev: 1.0,
    prod: 0.1,
    byType: DEFAULT_SAMPLING_BY_TYPE,
  }),
  consent: Object.freeze({
    crashes: true,
    analytics: false,
    replay: false,
  }),
  ai: Object.freeze({
    crashExplainer: true,
    autoFix: 'suggest',
    maxFilesPerFix: 5,
  }),
  transport: Object.freeze({
    endpoint: null,
    batchInterval: 60_000,
    maxBatchSize: 100,
  }),
});

const AUTO_FIX_MODES = new Set(['suggest', 'apply', 'off']);
const COLLECTOR_MODES = new Set(['dev', 'prod']);

function validateSampling(value: number, field: string): void {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(
      `[monitor] config.sampling.${field} must be a number, got ${String(value)}`,
    );
  }
  if (value < 0 || value > 1) {
    throw new Error(
      `[monitor] config.sampling.${field} must be between 0 and 1, got ${value}`,
    );
  }
}

function validatePositiveInt(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(
      `[monitor] config.${path} must be a positive integer, got ${String(value)}`,
    );
  }
}

function validateNonNegativeInt(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(
      `[monitor] config.${path} must be a non-negative integer, got ${String(value)}`,
    );
  }
}

function validateSamplingByType(
  byType: Record<string, PerTypeSamplingRate>,
): void {
  for (const [type, rate] of Object.entries(byType)) {
    if (rate.dev !== undefined) {
      validateSampling(rate.dev, `byType.${type}.dev`);
    }
    if (rate.prod !== undefined) {
      validateSampling(rate.prod, `byType.${type}.prod`);
    }
  }
}

function validateCollectors(
  collectors: Record<string, CollectorMode>,
): void {
  for (const [name, mode] of Object.entries(collectors)) {
    if (
      typeof mode !== 'boolean' &&
      !(typeof mode === 'string' && COLLECTOR_MODES.has(mode))
    ) {
      throw new Error(
        `[monitor] config.collectors.${name} must be boolean | 'dev' | 'prod', got ${String(mode)}`,
      );
    }
  }
}

function validateTransportEndpoint(endpoint: string | null): void {
  if (endpoint === null) return;
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new Error(
      `[monitor] config.transport.endpoint must be a non-empty string or null, got ${String(endpoint)}`,
    );
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Merges the provided overrides with the default config and returns a deeply
 * frozen MonitorConfig. Throws descriptively on any invalid field.
 */
export function defineMonitorConfig(
  overrides: MonitorConfigOverrides = {},
): MonitorConfig {
  const mergedByType: Record<string, PerTypeSamplingRate> = {
    ...DEFAULT_SAMPLING_BY_TYPE,
  };
  if (overrides.sampling?.byType) {
    for (const [type, rate] of Object.entries(overrides.sampling.byType)) {
      mergedByType[type] = {
        ...(DEFAULT_SAMPLING_BY_TYPE[type] ?? {}),
        ...rate,
      };
    }
  }

  const merged: MonitorConfig = {
    collectors: {
      ...DEFAULT_MONITOR_CONFIG.collectors,
      ...(overrides.collectors ?? {}),
    },
    sampling: {
      dev: overrides.sampling?.dev ?? DEFAULT_MONITOR_CONFIG.sampling.dev,
      prod: overrides.sampling?.prod ?? DEFAULT_MONITOR_CONFIG.sampling.prod,
      byType: mergedByType,
    },
    consent: {
      ...DEFAULT_MONITOR_CONFIG.consent,
      ...(overrides.consent ?? {}),
    },
    ai: {
      ...DEFAULT_MONITOR_CONFIG.ai,
      ...(overrides.ai ?? {}),
    },
    transport: {
      ...DEFAULT_MONITOR_CONFIG.transport,
      ...(overrides.transport ?? {}),
    },
  };

  validateCollectors(merged.collectors);
  validateSampling(merged.sampling.dev, 'dev');
  validateSampling(merged.sampling.prod, 'prod');
  validateSamplingByType(merged.sampling.byType);

  if (typeof merged.consent.crashes !== 'boolean') {
    throw new Error('[monitor] config.consent.crashes must be a boolean');
  }
  if (typeof merged.consent.analytics !== 'boolean') {
    throw new Error('[monitor] config.consent.analytics must be a boolean');
  }
  if (typeof merged.consent.replay !== 'boolean') {
    throw new Error('[monitor] config.consent.replay must be a boolean');
  }
  if (
    merged.consent.doNotSell !== undefined &&
    typeof merged.consent.doNotSell !== 'boolean'
  ) {
    throw new Error('[monitor] config.consent.doNotSell must be a boolean');
  }

  if (typeof merged.ai.crashExplainer !== 'boolean') {
    throw new Error('[monitor] config.ai.crashExplainer must be a boolean');
  }
  if (!AUTO_FIX_MODES.has(merged.ai.autoFix)) {
    throw new Error(
      `[monitor] config.ai.autoFix must be 'suggest' | 'apply' | 'off', got ${String(merged.ai.autoFix)}`,
    );
  }
  validateNonNegativeInt(merged.ai.maxFilesPerFix, 'ai.maxFilesPerFix');

  validateTransportEndpoint(merged.transport.endpoint);
  validatePositiveInt(merged.transport.batchInterval, 'transport.batchInterval');
  validatePositiveInt(merged.transport.maxBatchSize, 'transport.maxBatchSize');

  return deepFreeze(merged);
}

/**
 * Resolves whether a collector should be active given the current mode.
 *
 *   true   → always on
 *   false  → always off
 *   'dev'  → on when __DEV__ is true
 *   'prod' → on when __DEV__ is false
 *
 * Unknown collector names default to `false`. Pass `isDev` explicitly in tests
 * to avoid depending on the global.
 */
export function resolveCollectorMode(
  config: MonitorConfig,
  name: string,
  isDev: boolean = detectDev(),
): boolean {
  const mode = config.collectors[name];
  if (mode === undefined) return false;
  if (typeof mode === 'boolean') return mode;
  if (mode === 'dev') return isDev;
  if (mode === 'prod') return !isDev;
  return false;
}

function detectDev(): boolean {
  // React Native exposes __DEV__ as a global; outside RN we fall back to
  // NODE_ENV so tests and Node-side tooling both behave sensibly.
  const g = globalThis as { __DEV__?: unknown };
  if (typeof g.__DEV__ === 'boolean') return g.__DEV__;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
}
