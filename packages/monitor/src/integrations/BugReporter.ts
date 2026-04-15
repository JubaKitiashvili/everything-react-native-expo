/**
 * Task 52 — BugReporter
 *
 * Orchestrates bug report creation. Bundles screenshot (via
 * ReplayCollector buffer), breadcrumb trail, replay segment,
 * layout snapshot, device info, and session ID into a single report.
 *
 * Configurable trigger: shake gesture (via native ShakeDetector) or
 * programmatic only. Rate-limited to max 1 report per 60 seconds.
 */
import type { MonitorEvent, DeviceInfo } from '../types';
import type { SignalBus } from '../core/SignalBus';
import type { SessionManager } from '../core/SessionManager';
import type { Breadcrumb } from '../collectors/BreadcrumbCollector';

export type BugReportTrigger = 'shake' | 'programmatic';

export interface BugReport {
  /** Unique report ID. */
  readonly id: string;
  /** Session ID at the time of the report. */
  readonly sessionId: string;
  /** Trigger that created this report. */
  readonly trigger: BugReportTrigger;
  /** Device info at the time of report. */
  readonly deviceInfo: DeviceInfo | null;
  /** Most recent screenshot (base64 JPEG) or null. */
  readonly screenshot: string | null;
  /** Breadcrumb trail leading up to the report. */
  readonly breadcrumbs: readonly Breadcrumb[];
  /** Replay segment (base64 frames). */
  readonly replayFrames: readonly ReplayFrameSnapshot[];
  /** Layout snapshot tree or null. */
  readonly layoutSnapshot: Record<string, unknown> | null;
  /** Timestamp in ms. */
  readonly timestamp: number;
  /** User-provided description (optional). */
  readonly userDescription?: string;
}

export interface ReplayFrameSnapshot {
  readonly frameBase64: string;
  readonly timestamp: number;
}

export interface BugReporterDeps {
  signalBus: SignalBus;
  sessionManager: SessionManager;
  /** Provides the current breadcrumb trail. */
  getBreadcrumbs: () => readonly Breadcrumb[];
  /** Provides recent replay frames (from ReplayCollector). */
  getReplayFrames?: () => readonly ReplayFrameSnapshot[];
  /** Provides the most recent screenshot. */
  getScreenshot?: () => string | null;
  /** Captures the layout snapshot. */
  captureLayoutSnapshot?: () => Promise<Record<string, unknown> | null>;
  /** Provides device info. */
  getDeviceInfo?: () => DeviceInfo | null;
  /** Submit report to endpoint or local storage. */
  submitReport?: (report: BugReport) => Promise<void>;
  /** Called when native shake is detected. Wire to native module event. */
  onShakeDetected?: (handler: () => void) => { remove(): void };
  /** Rate limit in ms. Default 60_000 (1 minute). */
  rateLimitMs?: number;
  /** Allowed triggers. Default ['shake', 'programmatic']. */
  triggers?: readonly BugReportTrigger[];
  /** UUID generator for deterministic tests. */
  generateId?: () => string;
  /** Clock for testing. */
  now?: () => number;
}

const DEFAULT_RATE_LIMIT_MS = 60_000;

export class BugReporter {
  private readonly deps: BugReporterDeps;
  private readonly rateLimitMs: number;
  private readonly triggers: ReadonlySet<BugReportTrigger>;
  private readonly generateId: () => string;
  private readonly now: () => number;

  private lastReportTime = -Infinity;
  private running = false;
  private shakeSubscription: { remove(): void } | null = null;
  private reports: BugReport[] = [];

  constructor(deps: BugReporterDeps) {
    this.deps = deps;
    this.rateLimitMs = deps.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
    this.triggers = new Set(deps.triggers ?? ['shake', 'programmatic']);
    this.generateId = deps.generateId ?? (() => `bug-${Math.random().toString(36).slice(2, 10)}`);
    this.now = deps.now ?? Date.now;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    if (this.triggers.has('shake') && this.deps.onShakeDetected) {
      this.shakeSubscription = this.deps.onShakeDetected(() => {
        void this.createReport('shake');
      });
    }
  }

  stop(): void {
    this.running = false;
    this.shakeSubscription?.remove();
    this.shakeSubscription = null;
  }

  dispose(): void {
    this.stop();
    this.reports = [];
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Programmatically create a bug report.
   * Returns the report or null if rate-limited.
   */
  async createReport(
    trigger: BugReportTrigger = 'programmatic',
    userDescription?: string,
  ): Promise<BugReport | null> {
    if (!this.running) return null;
    if (!this.triggers.has(trigger)) return null;

    // Rate limit check
    const currentTime = this.now();
    if (currentTime - this.lastReportTime < this.rateLimitMs) {
      return null;
    }
    this.lastReportTime = currentTime;

    // Gather data
    const sessionId = this.deps.sessionManager.getCurrentSessionId();
    const breadcrumbs = this.deps.getBreadcrumbs();
    const replayFrames = this.deps.getReplayFrames?.() ?? [];
    const screenshot = this.deps.getScreenshot?.() ?? null;
    const deviceInfo = this.deps.getDeviceInfo?.() ?? null;

    let layoutSnapshot: Record<string, unknown> | null = null;
    try {
      layoutSnapshot = (await this.deps.captureLayoutSnapshot?.()) ?? null;
    } catch {
      // Layout capture failure is non-fatal
    }

    const report: BugReport = {
      id: this.generateId(),
      sessionId,
      trigger,
      deviceInfo,
      screenshot,
      breadcrumbs,
      replayFrames: replayFrames.map((f) => ({
        frameBase64: f.frameBase64,
        timestamp: f.timestamp,
      })),
      layoutSnapshot,
      timestamp: currentTime,
      ...(userDescription ? { userDescription } : {}),
    };

    this.reports.push(report);

    // Emit event for pipeline tracking
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: currentTime,
      wallTime: currentTime,
      sessionId,
      data: {
        name: 'bug_report',
        reportId: report.id,
        trigger,
        breadcrumbCount: breadcrumbs.length,
        hasScreenshot: screenshot !== null,
        hasReplay: replayFrames.length > 0,
        hasLayout: layoutSnapshot !== null,
      },
    };
    this.deps.signalBus.emit(event);

    // Submit if handler is provided
    try {
      await this.deps.submitReport?.(report);
    } catch {
      // Submission failure is non-fatal
    }

    return report;
  }

  /** Get all reports created in this session. */
  getReports(): readonly BugReport[] {
    return this.reports;
  }
}
