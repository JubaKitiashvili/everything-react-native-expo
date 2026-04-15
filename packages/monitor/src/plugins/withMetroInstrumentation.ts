/**
 * Task 70 — Metro Auto-Instrumentation
 *
 * Metro config plugin: adds Babel transform, auto-wraps entry with
 * MonitorProvider, auto-instruments component exports with render tracking,
 * auto-adds breadcrumb to onPress handlers. Configurable via erne.monitor
 * field. Source map preserving. No-op when disabled.
 */

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface MetroInstrumentationConfig {
  /** Enable auto-instrumentation. Default true. */
  readonly enabled?: boolean;
  /** Auto-wrap entry with MonitorProvider. Default true. */
  readonly wrapEntry?: boolean;
  /** Auto-instrument component exports with render tracking. Default true. */
  readonly trackRenders?: boolean;
  /** Auto-add breadcrumb to onPress handlers. Default true. */
  readonly trackPresses?: boolean;
  /** Patterns for files to exclude from instrumentation. */
  readonly exclude?: readonly string[];
}

export interface MetroConfig {
  transformer?: {
    babelTransformerPath?: string;
    getTransformOptions?: () => Promise<{
      transform: { experimentalImportSupport?: boolean; inlineRequires?: boolean };
    }>;
  };
  resolver?: {
    sourceExts?: string[];
  };
  [key: string]: unknown;
}

export interface BabelTransformSpec {
  readonly wrapEntry: boolean;
  readonly trackRenders: boolean;
  readonly trackPresses: boolean;
  readonly exclude: readonly string[];
}

// ────────────────────────────────────────────────────────────
// Default config
// ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<MetroInstrumentationConfig> = {
  enabled: true,
  wrapEntry: true,
  trackRenders: true,
  trackPresses: true,
  exclude: ['node_modules', '__tests__', '.test.', '.spec.'],
};

// ────────────────────────────────────────────────────────────
// Metro config modifier
// ────────────────────────────────────────────────────────────

export function withMetroInstrumentation(
  metroConfig: MetroConfig,
  instrumentationConfig?: MetroInstrumentationConfig,
): MetroConfig {
  const config = { ...DEFAULT_CONFIG, ...instrumentationConfig };

  if (!config.enabled) {
    return metroConfig;
  }

  return {
    ...metroConfig,
    transformer: {
      ...metroConfig.transformer,
      // Preserve existing transformer path if any
      babelTransformerPath:
        metroConfig.transformer?.babelTransformerPath ??
        '@erne/monitor/babel-transform',
    },
    // Add erne.monitor config to be picked up by the babel plugin
    erne: {
      ...(metroConfig as Record<string, unknown>)['erne'] as Record<string, unknown> ?? {},
      monitor: {
        wrapEntry: config.wrapEntry,
        trackRenders: config.trackRenders,
        trackPresses: config.trackPresses,
        exclude: config.exclude,
      },
    },
  };
}

// ────────────────────────────────────────────────────────────
// File matching utilities
// ────────────────────────────────────────────────────────────

export function shouldInstrument(
  filePath: string,
  exclude: readonly string[],
): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  for (const pattern of exclude) {
    if (normalized.includes(pattern)) return false;
  }
  return /\.(tsx?|jsx?)$/.test(normalized);
}

// ────────────────────────────────────────────────────────────
// Transform spec builder (used by Babel plugin)
// ────────────────────────────────────────────────────────────

export function buildTransformSpec(
  config: MetroInstrumentationConfig,
): BabelTransformSpec {
  const resolved = { ...DEFAULT_CONFIG, ...config };
  return {
    wrapEntry: resolved.wrapEntry,
    trackRenders: resolved.trackRenders,
    trackPresses: resolved.trackPresses,
    exclude: [...resolved.exclude],
  };
}

// ────────────────────────────────────────────────────────────
// Source map note
// ────────────────────────────────────────────────────────────

/**
 * Source map preservation:
 * The babel transforms use AST manipulation (not string manipulation),
 * which means Babel automatically generates correct source maps.
 * The key transforms are:
 * 1. Entry wrapping: wraps the root component export in <MonitorProvider>
 * 2. Render tracking: wraps exported components in React.memo-like wrapper
 *    that calls RenderCollector.recordSample
 * 3. Press tracking: wraps onPress props with a breadcrumb recorder
 *
 * All transforms preserve the original AST node locations, so source maps
 * remain accurate.
 */
