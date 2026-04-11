import type { MonitorEvent, MonitorEventType } from '../types';
import type { SignalBus } from '../core/SignalBus';
import type { CrashEventData } from '../collectors/CrashCollector';
import type { NetworkEventData } from '../collectors/NetworkCollector';
import type { NavigationEventData } from '../collectors/NavigationCollector';
import type { CustomEventData } from '../collectors/CustomEventCollector';

export type ConsoleLike = Pick<Console, 'log' | 'warn' | 'error'>;

export interface TerminalReporterOptions {
  signalBus: SignalBus;
  /** Dev flag; reporter only runs when true. */
  isDev: boolean;
  /** Console sink — defaults to the global console. */
  console?: ConsoleLike;
  /** Rate limit window in ms (default 5000). */
  rateLimitMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

type Severity = 'crash' | 'warn' | 'info';

interface FormatResult {
  severity: Severity;
  icon: string;
  headline: string;
}

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  dim: '\x1b[2m',
};

function formatEvent(event: MonitorEvent): FormatResult | null {
  switch (event.type) {
    case 'crash': {
      const d = event.data as CrashEventData;
      return {
        severity: 'crash',
        icon: '🔴',
        headline: `CRASH ${d.kind === 'unhandled-rejection' ? '(rejection) ' : ''}${d.message}`,
      };
    }
    case 'network': {
      const d = event.data as NetworkEventData;
      if (d.errorMessage || (d.statusCode !== null && d.statusCode >= 500)) {
        return {
          severity: 'warn',
          icon: '🟡',
          headline: `NETWORK ${d.method} ${d.url} → ${
            d.statusCode ?? 'ERR'
          } ${d.errorMessage ?? ''}`.trim(),
        };
      }
      return null;
    }
    case 'navigation': {
      const d = event.data as NavigationEventData;
      return {
        severity: 'info',
        icon: '🟢',
        headline: `NAV ${d.previousScreen ?? '∅'} → ${d.screen}`,
      };
    }
    case 'custom': {
      const d = event.data as CustomEventData;
      return {
        severity: 'info',
        icon: '🟢',
        headline: `EVENT ${d.name}`,
      };
    }
    default:
      return null;
  }
}

function colorFor(severity: Severity): string {
  if (severity === 'crash') return ANSI.red;
  if (severity === 'warn') return ANSI.yellow;
  return ANSI.green;
}

/**
 * TerminalReporter renders monitor events as colored inline warnings in
 * the Metro bundler terminal. Dev-only (silent in prod), rate-limited to
 * one output per event type per window (default 5s), never blocks the
 * JS thread.
 */
export class TerminalReporter {
  private readonly bus: SignalBus;
  private readonly console: ConsoleLike;
  private readonly rateLimitMs: number;
  private readonly now: () => number;
  private readonly isDev: boolean;
  private unsubscribe: (() => void) | null = null;
  private lastEmittedAt = new Map<MonitorEventType, number>();

  constructor(options: TerminalReporterOptions) {
    this.bus = options.signalBus;
    this.isDev = options.isDev;
    this.console = options.console ?? (globalThis.console as ConsoleLike);
    this.rateLimitMs = options.rateLimitMs ?? 5000;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (!this.isDev) return;
    if (this.unsubscribe) return;
    this.unsubscribe = this.bus.onAll((event) => this.handle(event));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.lastEmittedAt.clear();
  }

  isRunning(): boolean {
    return this.unsubscribe !== null;
  }

  private handle(event: MonitorEvent): void {
    const formatted = formatEvent(event);
    if (!formatted) return;

    const last = this.lastEmittedAt.get(event.type) ?? -Infinity;
    const now = this.now();
    if (now - last < this.rateLimitMs) return;
    this.lastEmittedAt.set(event.type, now);

    const color = colorFor(formatted.severity);
    const line = `${formatted.icon} ${color}[monitor]${ANSI.reset} ${formatted.headline}`;
    // IMPORTANT: always use console.log — console.warn / console.error
    // trigger the RN LogBox yellow/red screen overlay, which would make a
    // monitoring SDK loudly interrupt the very app it is observing. ANSI
    // color codes still render in Metro's terminal (the actual target
    // audience), and the severity icon (🔴 🟡 🟢) preserves the signal
    // for devs scrolling the RN DevTools console panel.
    try {
      this.console.log(line);
    } catch {
      // never let a broken console break the bus
    }
  }
}
