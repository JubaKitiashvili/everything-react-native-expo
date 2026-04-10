import type {
  AppInfo,
  ConnectionType,
  DeviceInfo,
  MemoryInfo,
  PlatformBridge,
  PlatformName,
} from '../types';

/**
 * The subset of React Native APIs JSPlatformBridge consumes. We inject this
 * explicitly instead of importing 'react-native' directly so that:
 *
 *   1. Plain ts-jest tests can run without the RN preset.
 *   2. Phase 2 can swap in a native-backed bridge cleanly.
 *   3. Consumers on Node (scripts, schema codegen) can still create a bridge.
 */
export interface JSPlatformBridgeDeps {
  platform?: {
    OS?: string;
    Version?: string | number;
    constants?: Record<string, unknown>;
  };
  dimensions?: {
    get(name: 'window' | 'screen'): { width: number; height: number };
  };
  nativeModules?: Record<string, unknown>;
  /**
   * Optional getter for connectivity. Phase 1a does not depend on
   * @react-native-community/netinfo; if the host app provides it we'll use
   * it, otherwise we return 'unknown'.
   */
  getConnectionType?: () => ConnectionType;
  /**
   * Optional bundle/version getters from expo-application or similar. If
   * omitted, we fall back to 'unknown'.
   */
  getAppInfo?: () => Partial<AppInfo>;
  /**
   * Optional locale resolver (Intl is available in Hermes but not every
   * environment exposes it the same way).
   */
  getLocale?: () => string;
}

const UNKNOWN_APP_INFO: AppInfo = Object.freeze({
  version: 'unknown',
  buildNumber: 'unknown',
  bundleId: 'unknown',
});

function normalizePlatform(os: string | undefined): PlatformName {
  if (os === 'ios' || os === 'android' || os === 'web') return os;
  return 'unknown';
}

function detectEmulator(
  platform: PlatformName,
  constants: Record<string, unknown> | undefined,
): boolean {
  if (!constants) return false;
  if (platform === 'android') {
    const fingerprint =
      typeof constants.Fingerprint === 'string' ? constants.Fingerprint : '';
    const brand = typeof constants.Brand === 'string' ? constants.Brand : '';
    return (
      fingerprint.includes('generic') ||
      fingerprint.includes('emulator') ||
      brand.toLowerCase() === 'google'
    );
  }
  if (platform === 'ios') {
    const isSim = constants.interfaceIdiom === 'pad' ? false : false;
    // iOS RN exposes Constants.isTesting only; real emulator detection needs
    // a native call. Phase 2 native module handles this properly.
    return Boolean((constants as { isTesting?: boolean }).isTesting) || isSim;
  }
  return false;
}

function detectLocale(getLocale: (() => string) | undefined): string {
  if (getLocale) {
    try {
      const v = getLocale();
      if (typeof v === 'string' && v.length > 0) return v;
    } catch {
      // fall through
    }
  }
  try {
    if (
      typeof Intl !== 'undefined' &&
      typeof Intl.DateTimeFormat === 'function'
    ) {
      const loc = Intl.DateTimeFormat().resolvedOptions().locale;
      if (typeof loc === 'string' && loc.length > 0) return loc;
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

/**
 * Pure-JS PlatformBridge. Cached on first call per field so we only pay the
 * cost once per session (device info doesn't change mid-session).
 */
export class JSPlatformBridge implements PlatformBridge {
  private deviceInfo: DeviceInfo | null = null;
  private appInfo: AppInfo | null = null;
  private readonly deps: JSPlatformBridgeDeps;

  constructor(deps: JSPlatformBridgeDeps = {}) {
    this.deps = deps;
  }

  getDeviceInfo(): DeviceInfo {
    if (this.deviceInfo !== null) return this.deviceInfo;
    const platform = normalizePlatform(this.deps.platform?.OS);
    const osVersion =
      this.deps.platform?.Version !== undefined
        ? String(this.deps.platform.Version)
        : 'unknown';
    const constants = this.deps.platform?.constants;
    const model =
      typeof constants?.Model === 'string'
        ? (constants.Model as string)
        : typeof constants?.interfaceIdiom === 'string'
          ? (constants.interfaceIdiom as string)
          : 'unknown';
    const screen = this.deps.dimensions?.get('screen') ?? {
      width: 0,
      height: 0,
    };
    this.deviceInfo = Object.freeze({
      platform,
      osVersion,
      model,
      isEmulator: detectEmulator(platform, constants),
      screenWidth: screen.width,
      screenHeight: screen.height,
      locale: detectLocale(this.deps.getLocale),
    });
    return this.deviceInfo;
  }

  getAppInfo(): AppInfo {
    if (this.appInfo !== null) return this.appInfo;
    const partial = this.deps.getAppInfo?.() ?? {};
    this.appInfo = Object.freeze({
      version:
        typeof partial.version === 'string'
          ? partial.version
          : UNKNOWN_APP_INFO.version,
      buildNumber:
        typeof partial.buildNumber === 'string'
          ? partial.buildNumber
          : UNKNOWN_APP_INFO.buildNumber,
      bundleId:
        typeof partial.bundleId === 'string'
          ? partial.bundleId
          : UNKNOWN_APP_INFO.bundleId,
    });
    return this.appInfo;
  }

  /**
   * JS cannot read platform memory counters — we return null so consumers
   * know to degrade gracefully. Phase 2 native module fills this in.
   */
  getMemoryUsage(): MemoryInfo | null {
    return null;
  }

  getConnectionType(): ConnectionType {
    if (this.deps.getConnectionType) {
      try {
        const v = this.deps.getConnectionType();
        if (v === 'wifi' || v === 'cellular' || v === 'offline') return v;
      } catch {
        // fall through
      }
    }
    return 'unknown';
  }

  /**
   * Phase 1a has no synchronous disk I/O available to JS. We stash crash
   * bytes on globalThis so that if the JS runtime reloads (Fast Refresh,
   * dev bundle rebuild) before the next session starts, the next
   * MonitorClient boot can drain the buffer. Phase 2 native bridge replaces
   * this with a real synchronous file write that survives process death.
   */
  persistCrashData(data: Uint8Array): void {
    const g = globalThis as { __erne_crash_buffer__?: Uint8Array[] };
    if (!Array.isArray(g.__erne_crash_buffer__)) {
      g.__erne_crash_buffer__ = [];
    }
    g.__erne_crash_buffer__.push(data);
  }

  /** Test helper: clears cached info so deps can be swapped mid-test. */
  __resetCache(): void {
    this.deviceInfo = null;
    this.appInfo = null;
  }
}
