import type { Collector, MonitorConfig, MonitorEvent } from '../../types';
import type { SignalBus } from '../../core/SignalBus';
import type { SessionManager } from '../../core/SessionManager';
import type { ErneMonitorNative } from '../../native/ErneMonitorNative';

export interface LayoutSnapshotNode {
  readonly type: string;
  readonly frame: { x: number; y: number; w: number; h: number };
  readonly accessibilityLabel?: string;
  readonly props?: Record<string, unknown>;
  readonly children?: readonly LayoutSnapshotNode[];
  readonly truncated?: boolean;
  readonly truncatedChildCount?: number;
}

export interface LayoutSnapshotCollectorDeps {
  native: ErneMonitorNative;
  signalBus: SignalBus;
  sessionManager: SessionManager;
  /** Max view tree depth. Default 50. */
  maxDepth?: number;
}

/**
 * Task 48 — LayoutSnapshotCollector
 *
 * On-demand capture of the native view hierarchy. Not a continuous
 * collector — provides `capture()` method called by BugReporter,
 * DevTools, or explicitly by the consumer.
 *
 * The collector still implements Collector for lifecycle management
 * but start/stop are no-ops (it doesn't run continuously).
 */
export class LayoutSnapshotCollector implements Collector {
  readonly name = 'layoutSnapshot';
  readonly priority = 60; // low priority, on-demand only

  private readonly deps: LayoutSnapshotCollectorDeps;
  private readonly maxDepth: number;
  private available = false;

  constructor(deps: LayoutSnapshotCollectorDeps) {
    this.deps = deps;
    this.maxDepth = deps.maxDepth ?? 50;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    this.available = this.deps.native.isAvailable();
  }

  stop(): void {
    this.available = false;
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.available;
  }

  /**
   * Capture the current native view hierarchy.
   * Returns null if the native module is unavailable or capture fails.
   */
  async capture(): Promise<LayoutSnapshotNode | null> {
    if (!this.available) return null;
    const result = await this.deps.native.captureLayoutSnapshot(this.maxDepth);
    if (!result) return null;

    // Emit event for pipeline tracking
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: Date.now(),
      wallTime: Date.now(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data: {
        name: 'layout_snapshot',
        nodeCount: this.countNodes(result),
      },
    };
    this.deps.signalBus.emit(event);

    return result as unknown as LayoutSnapshotNode;
  }

  private countNodes(node: Record<string, unknown>): number {
    let count = 1;
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (typeof child === 'object' && child !== null) {
          count += this.countNodes(child as Record<string, unknown>);
        }
      }
    }
    return count;
  }
}
