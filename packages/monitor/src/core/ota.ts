/**
 * Task 117.77 — EAS Update / OTA version tagging.
 *
 * Reads `expo-updates` (an optional peer dependency) to build an OTA context
 * object that events can carry. The import is guarded so the SDK no-ops when
 * `expo-updates` is absent (bare RN apps, web, tests) instead of throwing.
 *
 * Verify against current docs (`expo-updates`): the module exposes the
 * static properties `runtimeVersion`, `channel`, `updateId`, and
 * `isEmbeddedLaunch`. Values may be null until the update subsystem
 * initializes, so every field is optional here.
 */

export interface OtaContext {
  /** The runtime version this build is compatible with. */
  runtimeVersion: string | null;
  /** The EAS Update channel (e.g. "production", "preview"). */
  channel: string | null;
  /** The currently-running update id, or null for an embedded launch. */
  updateId: string | null;
  /** True when running the JS bundle embedded in the native binary. */
  isEmbeddedLaunch: boolean | null;
  /** True when `expo-updates` was resolvable; false when it's absent. */
  available: boolean;
}

/**
 * The slice of `expo-updates` we read. Modeled as an interface so tests can
 * inject a present module and an absent one without the Expo runtime.
 */
export interface ExpoUpdatesLike {
  runtimeVersion?: string | null;
  channel?: string | null;
  updateId?: string | null;
  isEmbeddedLaunch?: boolean | null;
}

const EMPTY_OTA_CONTEXT: OtaContext = Object.freeze({
  runtimeVersion: null,
  channel: null,
  updateId: null,
  isEmbeddedLaunch: null,
  available: false,
});

/**
 * Resolves `expo-updates` if present. The require lives inside a try/catch so
 * bundlers/ts-jest don't fail when the optional peer isn't installed, mirroring
 * `native/defaultLoader.ts`'s optional-native-module pattern.
 */
function defaultResolveExpoUpdates(): ExpoUpdatesLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-updates') as ExpoUpdatesLike;
  } catch {
    return null;
  }
}

/**
 * Normalizes a resolved module to its `default` export when present (ESM
 * interop), otherwise returns the module as-is.
 */
function unwrapDefault(mod: ExpoUpdatesLike | null): ExpoUpdatesLike | null {
  if (mod && typeof mod === 'object' && 'default' in mod) {
    const withDefault = mod as { default?: ExpoUpdatesLike };
    if (withDefault.default) return withDefault.default;
  }
  return mod;
}

function coerceString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function coerceBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/**
 * Builds the OTA context. Pass `resolve` in tests to inject a fake
 * `expo-updates` (or `() => null` to simulate its absence). In production,
 * the default resolver attempts the guarded require.
 */
export function getOtaContext(
  resolve: () => ExpoUpdatesLike | null = defaultResolveExpoUpdates,
): OtaContext {
  let updates: ExpoUpdatesLike | null = null;
  try {
    updates = unwrapDefault(resolve());
  } catch {
    updates = null;
  }
  if (!updates) return EMPTY_OTA_CONTEXT;
  return {
    runtimeVersion: coerceString(updates.runtimeVersion),
    channel: coerceString(updates.channel),
    updateId: coerceString(updates.updateId),
    isEmbeddedLaunch: coerceBool(updates.isEmbeddedLaunch),
    available: true,
  };
}

/**
 * Merges the OTA context into an event/session metadata object under the
 * `ota` key. Returns a new object — never mutates the input. When OTA is
 * unavailable, attaches the empty (available=false) context so consumers can
 * distinguish "no expo-updates" from "not yet checked".
 */
export function withOtaContext<T extends Record<string, unknown>>(
  metadata: T,
  context: OtaContext = getOtaContext(),
): T & { ota: OtaContext } {
  return { ...metadata, ota: context };
}
