import type { MonitorEvent } from '../types';
import type { CrashEventData } from '../collectors/CrashCollector';

export interface FingerprintedCrashData extends CrashEventData {
  fingerprint: string;
}

/**
 * Fingerprinter produces a stable hash for crash events so DedupEngine
 * (Phase 1c) can group occurrences of the same bug. The fingerprint is
 * derived from:
 *
 *   1. The error "type" portion of the message up to the first colon.
 *   2. The top 3 in-app frames from the stack (bridge/node_modules frames
 *      are dropped to survive minor library upgrades).
 *   3. The crash kind (exception vs unhandled-rejection).
 *
 * Fingerprints are base36 hashes so they are short and log-friendly.
 */
export class Fingerprinter {
  fingerprint(event: MonitorEvent): string | null {
    if (event.type !== 'crash') return null;
    const data = event.data as CrashEventData;
    const typeToken = this.extractErrorType(data.message);
    const frames = this.extractTopFrames(data.stack, 3);
    const key = `${data.kind}|${typeToken}|${frames.join('\n')}`;
    return this.hash(key);
  }

  /**
   * Convenience helper — mutates a crash event to carry its fingerprint.
   * Returns the event for chaining.
   */
  annotate(event: MonitorEvent): MonitorEvent {
    if (event.type !== 'crash') return event;
    const fp = this.fingerprint(event);
    if (fp) {
      (event.data as FingerprintedCrashData).fingerprint = fp;
    }
    return event;
  }

  private extractErrorType(message: string): string {
    const colon = message.indexOf(':');
    if (colon > 0 && colon < 80) {
      return message.slice(0, colon).trim();
    }
    return message.slice(0, 80).trim();
  }

  private extractTopFrames(stack: string | null, count: number): string[] {
    if (!stack) return [];
    const lines = stack.split('\n').map((l) => l.trim());
    const frames: string[] = [];
    for (const line of lines) {
      if (!/^at\s/.test(line) && !/@/.test(line)) continue;
      if (this.isLibraryFrame(line)) continue;
      const normalized = this.normalizeFrame(line);
      if (normalized) frames.push(normalized);
      if (frames.length >= count) break;
    }
    return frames;
  }

  private isLibraryFrame(line: string): boolean {
    return (
      line.includes('node_modules') ||
      line.includes('react-native/Libraries') ||
      line.includes('[native code]') ||
      line.includes('InternalBytecode') ||
      line.includes('@react-native/')
    );
  }

  private normalizeFrame(line: string): string | null {
    // Strip line:column numbers so rebuilds don't change the fingerprint.
    const withoutNumbers = line.replace(/:\d+(:\d+)?/g, '');
    const match =
      /at\s+([^\s(]+)(?:\s|$)/.exec(withoutNumbers) ||
      /(\S+)@/.exec(withoutNumbers);
    if (match && match[1]) return match[1];
    return withoutNumbers || null;
  }

  private hash(input: string): string {
    // djb2 32-bit — good enough for grouping; not crypto.
    let h = 5381;
    for (let i = 0; i < input.length; i++) {
      h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
    }
    return h.toString(36);
  }
}
