import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

export type A11ySeverity = 'error' | 'warning' | 'info';
export type A11yViolation =
  | 'missing-label'
  | 'small-touch-target'
  | 'missing-role'
  | 'image-missing-alt';

export interface A11yElementInfo {
  componentPath: string;
  role?: string;
  label?: string;
  width?: number;
  height?: number;
  isInteractive: boolean;
  isImage?: boolean;
  isDecorative?: boolean;
}

export interface A11yEventData {
  violation: A11yViolation;
  severity: A11ySeverity;
  componentPath: string;
  suggestion: string;
  measured?: { width?: number; height?: number };
}

export interface A11yCollectorDeps {
  signalBus: SignalBus;
  /** Minimum interactive touch target size (Apple HIG / WCAG). Default 44. */
  minTouchTarget?: number;
  now?: () => number;
  wallNow?: () => number;
}

const SUGGESTIONS: Record<A11yViolation, string> = {
  'missing-label':
    'Add an accessibilityLabel describing the control for screen readers.',
  'small-touch-target':
    'Increase touch target to at least 44x44 points (use hitSlop if the visual is smaller).',
  'missing-role':
    'Set accessibilityRole (e.g. "button", "link", "header") on this interactive element.',
  'image-missing-alt':
    'Add an accessibilityLabel to this image, or mark it decorative with importantForAccessibility="no".',
};

/**
 * A11yCollector runs lightweight accessibility audits. Host code (or the
 * Babel plugin in Phase 1c #36) calls `audit(elements)` with a list of
 * element descriptions collected from a screen; the collector checks
 * each for common violations and emits one event per violation.
 */
export class A11yCollector implements Collector {
  readonly name = 'a11y';
  readonly priority = 80;

  private readonly deps: A11yCollectorDeps;
  private readonly minTouchTarget: number;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private running = false;

  constructor(deps: A11yCollectorDeps) {
    this.deps = deps;
    this.minTouchTarget = deps.minTouchTarget ?? 44;
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
    this.wallNow = deps.wallNow ?? Date.now;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
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

  audit(elements: readonly A11yElementInfo[]): A11yEventData[] {
    if (!this.running) return [];
    const found: A11yEventData[] = [];
    for (const el of elements) {
      if (el.isDecorative) continue;
      if (el.isInteractive && !el.label) {
        found.push(this.make('missing-label', 'error', el));
      }
      if (el.isInteractive && !el.role) {
        found.push(this.make('missing-role', 'warning', el));
      }
      if (
        el.isInteractive &&
        ((el.width !== undefined && el.width < this.minTouchTarget) ||
          (el.height !== undefined && el.height < this.minTouchTarget))
      ) {
        found.push(this.make('small-touch-target', 'warning', el));
      }
      if (el.isImage && !el.label && !el.isDecorative) {
        found.push(this.make('image-missing-alt', 'warning', el));
      }
    }
    for (const v of found) this.emit(v);
    return found;
  }

  private make(
    violation: A11yViolation,
    severity: A11ySeverity,
    el: A11yElementInfo,
  ): A11yEventData {
    return {
      violation,
      severity,
      componentPath: el.componentPath,
      suggestion: SUGGESTIONS[violation],
      measured:
        el.width !== undefined || el.height !== undefined
          ? { width: el.width, height: el.height }
          : undefined,
    };
  }

  private emit(data: A11yEventData): void {
    const event: MonitorEvent = {
      type: 'custom',
      timestamp: this.now(),
      wallTime: this.wallNow(),
      sessionId: '',
      data: {
        name: 'a11y',
        attributes: data as unknown as Record<string, never>,
      },
    };
    this.deps.signalBus.emit(event);
  }
}
