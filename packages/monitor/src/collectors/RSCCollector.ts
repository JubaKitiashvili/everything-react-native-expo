/**
 * Task 69 — RSC Monitoring
 *
 * Detects RSC projects. Tracks server render time, payload size,
 * streaming chunks, cache status, router.reload() timing.
 * Correlates with client navigation. No-op in non-RSC projects.
 */

import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface RSCEventData {
  readonly kind:
    | 'server-render'
    | 'payload'
    | 'streaming-chunk'
    | 'cache-status'
    | 'reload';
  readonly routePath?: string;
  readonly serverRenderTimeMs?: number;
  readonly payloadSizeBytes?: number;
  readonly chunkIndex?: number;
  readonly chunkCount?: number;
  readonly cacheHit?: boolean;
  readonly reloadDurationMs?: number;
  readonly correlationId?: string;
}

export interface RSCCollectorDeps {
  signalBus: SignalBus;
  /** Detect if RSC is enabled. Return true if the project uses RSC. */
  isRSCEnabled: () => boolean;
  /** Clock. */
  now?: () => number;
}

// ────────────────────────────────────────────────────────────
// Collector
// ────────────────────────────────────────────────────────────

export class RSCCollector implements Collector {
  readonly name = 'rsc';
  readonly priority = 35;

  private readonly deps: RSCCollectorDeps;
  private readonly now: () => number;
  private running = false;
  private rscEnabled = false;

  constructor(deps: RSCCollectorDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

  init(_config: MonitorConfig): void {
    this.rscEnabled = this.deps.isRSCEnabled();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  isActive(): boolean {
    return this.rscEnabled;
  }

  /** Record a server render event. No-op if RSC not detected. */
  recordServerRender(routePath: string, renderTimeMs: number, correlationId?: string): void {
    if (!this.running || !this.rscEnabled) return;
    this.emit({
      kind: 'server-render',
      routePath,
      serverRenderTimeMs: renderTimeMs,
      correlationId,
    });
  }

  /** Record an RSC payload received. */
  recordPayload(routePath: string, sizeBytes: number, correlationId?: string): void {
    if (!this.running || !this.rscEnabled) return;
    this.emit({
      kind: 'payload',
      routePath,
      payloadSizeBytes: sizeBytes,
      correlationId,
    });
  }

  /** Record a streaming chunk. */
  recordStreamingChunk(routePath: string, chunkIndex: number, chunkCount: number): void {
    if (!this.running || !this.rscEnabled) return;
    this.emit({
      kind: 'streaming-chunk',
      routePath,
      chunkIndex,
      chunkCount,
    });
  }

  /** Record a cache status event. */
  recordCacheStatus(routePath: string, cacheHit: boolean): void {
    if (!this.running || !this.rscEnabled) return;
    this.emit({
      kind: 'cache-status',
      routePath,
      cacheHit,
    });
  }

  /** Record a router.reload() timing. */
  recordReload(routePath: string, durationMs: number, correlationId?: string): void {
    if (!this.running || !this.rscEnabled) return;
    this.emit({
      kind: 'reload',
      routePath,
      reloadDurationMs: durationMs,
      correlationId,
    });
  }

  private emit(data: RSCEventData): void {
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.now(),
      sessionId: '',
      data: {
        name: 'rsc',
        attributes: data,
      },
    };
    this.deps.signalBus.emit(event);
  }
}
