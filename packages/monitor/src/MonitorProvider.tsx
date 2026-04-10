import { useEffect, useRef, type ReactNode } from 'react';
import type { MonitorConfigOverrides } from './types';
import {
  createMonitorRuntime,
  startMonitorRuntime,
  type MonitorRuntime,
  type MonitorRuntimeDeps,
} from './core/createMonitorRuntime';

export interface MonitorProviderProps {
  children?: ReactNode;
  config?: MonitorConfigOverrides;
  deps?: MonitorRuntimeDeps;
  /**
   * Called with the runtime once it has been created. Useful for tests
   * and for host apps that want to hold a reference for trackEvent.
   */
  onReady?: (runtime: MonitorRuntime) => void;
}

/**
 * MonitorProvider wraps the app root, builds the monitor runtime on mount,
 * starts it, and tears it down on unmount. It does not render any visual
 * output — it's a side-effect container. The same monitor can run without
 * React by calling createMonitorRuntime + startMonitorRuntime directly.
 */
export function MonitorProvider({
  children,
  config,
  deps,
  onReady,
}: MonitorProviderProps) {
  const runtimeRef = useRef<MonitorRuntime | null>(null);

  useEffect(() => {
    let cancelled = false;
    let localRuntime: MonitorRuntime | null = null;

    (async () => {
      const runtime = await createMonitorRuntime(config, deps);
      if (cancelled) {
        await runtime.shutdown();
        return;
      }
      startMonitorRuntime(runtime);
      runtimeRef.current = runtime;
      localRuntime = runtime;
      onReady?.(runtime);
    })().catch(() => {
      // Monitor boot failures must never crash the host app. A Phase 1b
      // failure channel will surface these to the dashboard.
    });

    return () => {
      cancelled = true;
      const rt = localRuntime ?? runtimeRef.current;
      runtimeRef.current = null;
      if (rt) {
        void rt.shutdown();
      }
    };
    // We intentionally do NOT re-run this effect when config/deps change —
    // MonitorClient is a singleton and re-initialization is a no-go. Host
    // apps should remount the provider if they want a fresh runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
