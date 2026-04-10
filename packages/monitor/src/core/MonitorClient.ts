import type { Collector, MonitorConfig } from '../types';

/**
 * MonitorClient — root singleton for @erne/monitor.
 *
 * Phase 1a Task 1 (spec §3 SDK Architecture). Manages SDK lifecycle:
 * config, collector registration, start/stop. Does not yet wire SignalBus,
 * EventStore, or processors — those arrive in later Phase 1a tasks.
 */
export class MonitorClient {
  private static instance: MonitorClient | null = null;
  private static initializing = false;

  private readonly config: MonitorConfig;
  private readonly collectors: Collector[] = [];
  private running = false;

  private constructor(config: MonitorConfig) {
    this.config = config;
  }

  static init(config: MonitorConfig): MonitorClient {
    if (MonitorClient.instance !== null) {
      throw new Error(
        '[monitor] MonitorClient.init() called twice. Use getInstance() after the first init.',
      );
    }
    if (MonitorClient.initializing) {
      throw new Error(
        '[monitor] MonitorClient.init() is already in progress (re-entrant call).',
      );
    }
    MonitorClient.initializing = true;
    try {
      const client = new MonitorClient(config);
      MonitorClient.instance = client;
      return client;
    } finally {
      MonitorClient.initializing = false;
    }
  }

  static getInstance(): MonitorClient {
    if (MonitorClient.instance === null) {
      throw new Error(
        '[monitor] MonitorClient.getInstance() called before init(). Call MonitorClient.init(config) first.',
      );
    }
    return MonitorClient.instance;
  }

  /**
   * Test-only: resets the singleton so tests can re-init. Never call in
   * production code — the public contract is "init once per process".
   */
  static __resetForTesting(): void {
    if (MonitorClient.instance !== null) {
      const prev = MonitorClient.instance;
      MonitorClient.instance = null;
      if (prev.running) {
        try {
          prev.stop();
        } catch {
          // swallow — test reset must not throw
        }
      }
    }
    MonitorClient.initializing = false;
  }

  getConfig(): MonitorConfig {
    return this.config;
  }

  registerCollector(collector: Collector): void {
    if (this.running) {
      throw new Error(
        `[monitor] Cannot registerCollector("${collector.name}") while running. Register before start().`,
      );
    }
    const duplicate = this.collectors.find((c) => c.name === collector.name);
    if (duplicate) {
      throw new Error(
        `[monitor] Collector with name "${collector.name}" already registered.`,
      );
    }
    this.collectors.push(collector);
  }

  getCollectors(): readonly Collector[] {
    return this.collectors;
  }

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) {
      return;
    }
    const ordered = [...this.collectors].sort((a, b) => a.priority - b.priority);
    const started: Collector[] = [];
    try {
      for (const collector of ordered) {
        collector.init(this.config);
        collector.start();
        started.push(collector);
      }
      this.running = true;
    } catch (err) {
      // Roll back any collectors that were started before the failure so we
      // never leave the SDK in a half-started state.
      for (const collector of started.reverse()) {
        try {
          collector.stop();
          collector.dispose();
        } catch {
          // swallow rollback errors — original error is what the caller needs
        }
      }
      throw err;
    }
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    // Dispose in reverse priority order (LIFO) so collectors with higher
    // priority (lower number) shut down last.
    const reversed = [...this.collectors]
      .sort((a, b) => a.priority - b.priority)
      .reverse();
    let firstError: unknown = null;
    for (const collector of reversed) {
      try {
        collector.stop();
        collector.dispose();
      } catch (err) {
        if (firstError === null) firstError = err;
      }
    }
    this.running = false;
    if (firstError !== null) {
      throw firstError;
    }
  }
}
