import type { BuiltContext } from './ContextBuilder';

export type DispatchChannel = 'terminal' | 'dashboard' | 'store';

export interface DispatchedSignal {
  id: string;
  context: BuiltContext;
  score: number;
  channels: DispatchChannel[];
  ts: number;
}

export interface DispatchOutput {
  name: DispatchChannel;
  /** Fire-and-forget handler — never throws. */
  deliver: (signal: DispatchedSignal) => void;
}

export interface DispatchEngineOptions {
  outputs: DispatchOutput[];
  /** Max dispatches per output per minute. Default 10. */
  ratePerMinute?: number;
  now?: () => number;
}

/**
 * Routes processed signals to output channels with per-channel rate
 * limiting. Priority:
 *   - score >= 80 → all outputs
 *   - score >= 60 → terminal + store
 *   - score <  60 → store only
 */
export class DispatchEngine {
  private readonly outputs: DispatchOutput[];
  private readonly ratePerMinute: number;
  private readonly now: () => number;
  private readonly windows = new Map<DispatchChannel, number[]>();
  private nextId = 1;

  constructor(options: DispatchEngineOptions) {
    this.outputs = options.outputs;
    this.ratePerMinute = options.ratePerMinute ?? 10;
    this.now = options.now ?? Date.now;
  }

  dispatch(context: BuiltContext, score: number): DispatchedSignal | null {
    const channels = this.channelsForScore(score);
    const now = this.now();
    const allowed: DispatchChannel[] = [];
    for (const ch of channels) {
      if (this.allow(ch, now)) allowed.push(ch);
    }
    if (allowed.length === 0) return null;
    const signal: DispatchedSignal = {
      id: `sig-${this.nextId++}`,
      context,
      score,
      channels: allowed,
      ts: now,
    };
    for (const ch of allowed) {
      const out = this.outputs.find((o) => o.name === ch);
      if (!out) continue;
      try {
        out.deliver(signal);
      } catch {
        // never fail dispatch
      }
    }
    return signal;
  }

  private channelsForScore(score: number): DispatchChannel[] {
    if (score >= 80) return ['terminal', 'dashboard', 'store'];
    if (score >= 60) return ['terminal', 'store'];
    return ['store'];
  }

  private allow(channel: DispatchChannel, now: number): boolean {
    const cutoff = now - 60_000;
    const window = this.windows.get(channel) ?? [];
    const recent = window.filter((t) => t >= cutoff);
    if (recent.length >= this.ratePerMinute) {
      this.windows.set(channel, recent);
      return false;
    }
    recent.push(now);
    this.windows.set(channel, recent);
    return true;
  }

  /** Diagnostic: count of dispatches per channel in the current window. */
  channelStats(): Record<DispatchChannel, number> {
    const now = this.now();
    const cutoff = now - 60_000;
    const out: Record<DispatchChannel, number> = {
      terminal: 0,
      dashboard: 0,
      store: 0,
    };
    for (const [ch, times] of this.windows.entries()) {
      out[ch] = times.filter((t) => t >= cutoff).length;
    }
    return out;
  }
}
