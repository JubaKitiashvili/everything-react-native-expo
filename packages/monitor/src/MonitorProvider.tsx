import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MonitorConfigOverrides } from './types';
import {
  createMonitorRuntime,
  startMonitorRuntime,
  type MonitorRuntime,
  type MonitorRuntimeDeps,
} from './core/createMonitorRuntime';

/**
 * Sentinel used to distinguish "no MonitorProvider ancestor" (context
 * default) from "inside provider, still booting" (value === null).
 * The `{ strict: true }` overload of `useMonitor` throws on the sentinel
 * but accepts `null` — because booting is a normal transient state.
 */
const MISSING_PROVIDER = Symbol('erne.monitor.missing-provider');
type MonitorContextValue = MonitorRuntime | null | typeof MISSING_PROVIDER;

const MonitorContext = createContext<MonitorContextValue>(MISSING_PROVIDER);

export interface MonitorProviderProps {
  children?: ReactNode;
  /** Config overrides merged with `DEFAULT_MONITOR_CONFIG`. */
  config?: MonitorConfigOverrides;
  /**
   * Runtime dependency injection slot — battery provider, native module
   * loader, app-state source, console, network target, etc. See
   * `MonitorRuntimeDeps` for the full shape.
   */
  deps?: MonitorRuntimeDeps;
  /**
   * Ergonomic shortcut for `deps.exposeGlobal: true`. Publishes the live
   * runtime on `globalThis.__ERNE_MONITOR__` for Maestro flows, dev
   * diagnostics screens, and the JS debugger.
   */
  exposeGlobal?: boolean;
  /**
   * Ergonomic shortcut for `deps.dashboardUrl`. When set, the runtime
   * starts a WebSocket stream to the ERNE dashboard. Typically
   * `ws://localhost:3333/monitor` in dev.
   */
  dashboardUrl?: string;
  /**
   * Called once with the runtime reference after `startMonitorRuntime`.
   * Useful for tests and host apps that want to hold the reference
   * outside the React tree.
   */
  onReady?: (runtime: MonitorRuntime) => void;
}

/**
 * `MonitorProvider` boots the SDK runtime on mount, exposes it via
 * React Context so descendants can call `useMonitor()`, and tears it
 * down on unmount. It doesn't render any visual output — it's a
 * side-effect container.
 *
 * Non-React hosts can skip the provider and call
 * `createMonitorRuntime` + `startMonitorRuntime` directly.
 */
export function MonitorProvider({
  children,
  config,
  deps,
  exposeGlobal,
  dashboardUrl,
  onReady,
}: MonitorProviderProps) {
  const [runtime, setRuntime] = useState<MonitorRuntime | null>(null);
  const runtimeRef = useRef<MonitorRuntime | null>(null);

  useEffect(() => {
    let cancelled = false;
    let localRuntime: MonitorRuntime | null = null;

    // Merge the ergonomic shortcuts into deps so consumers don't have
    // to choose between the quick props and the DI slot. Explicit
    // `deps.exposeGlobal` / `deps.dashboardUrl` win over the shortcuts
    // so tests can override them.
    const mergedDeps: MonitorRuntimeDeps = {
      ...(deps ?? {}),
      exposeGlobal: deps?.exposeGlobal ?? exposeGlobal,
      dashboardUrl: deps?.dashboardUrl ?? dashboardUrl,
    };

    (async () => {
      const rt = await createMonitorRuntime(config, mergedDeps);
      if (cancelled) {
        await rt.shutdown();
        return;
      }
      startMonitorRuntime(rt);
      runtimeRef.current = rt;
      localRuntime = rt;
      setRuntime(rt);
      onReady?.(rt);
    })().catch(() => {
      // Monitor boot failures must never crash the host app. A Phase 1b
      // failure channel will surface these to the dashboard.
    });

    return () => {
      cancelled = true;
      const rt = localRuntime ?? runtimeRef.current;
      runtimeRef.current = null;
      setRuntime(null);
      if (rt) {
        void rt.shutdown();
      }
    };
    // We intentionally do NOT re-run this effect when config/deps change —
    // MonitorClient is a singleton and re-initialization is a no-go. Host
    // apps should remount the provider if they want a fresh runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MonitorContext.Provider value={runtime}>
      {children}
    </MonitorContext.Provider>
  );
}

/**
 * Reads the live `MonitorRuntime` from React context.
 *
 *   useMonitor()                    → MonitorRuntime | null
 *   useMonitor({ strict: true })    → MonitorRuntime | null, but throws
 *                                     when no <MonitorProvider> ancestor
 *
 * The default overload returns `null` when either there's no provider
 * in the tree OR the runtime is still booting (one microtask after
 * mount). Consumers should null-check:
 *
 *   const monitor = useMonitor();
 *   const handlePress = () => {
 *     monitor?.trackEvent('checkout_tapped');
 *   };
 *
 * `{ strict: true }` asserts "I'm definitely inside a provider" — it
 * throws on missing provider, but still returns `null` while the
 * runtime is booting (because that's a transient state, not a bug).
 */
export function useMonitor(): MonitorRuntime | null;
export function useMonitor(options: { strict: true }): MonitorRuntime | null;
export function useMonitor(
  options?: { strict?: boolean },
): MonitorRuntime | null {
  const value = useContext(MonitorContext);
  if (value === MISSING_PROVIDER) {
    if (options?.strict) {
      throw new Error(
        '[monitor] useMonitor({ strict: true }) called outside <MonitorProvider>. ' +
          'Wrap your app root (or this subtree) in <MonitorProvider>.',
      );
    }
    return null;
  }
  return value;
}
