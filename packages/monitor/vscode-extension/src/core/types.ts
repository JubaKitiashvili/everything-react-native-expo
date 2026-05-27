/**
 * Shared shapes for the pure core logic. No `vscode` import.
 */

export type CrashStatus = 'open' | 'resolved' | 'ignored' | string;

/**
 * A crash group as returned by the @erne/monitor dashboard API
 * (GET <base>/api/crash-groups).
 */
export interface CrashGroup {
  fingerprint: string;
  message: string;
  eventCount: number;
  status: CrashStatus;
  /** Screen/file hint used to attach a CodeLens to the right file. */
  topScreen?: string;
}

/**
 * Aggregated crash info for a single screen, used to render a CodeLens.
 */
export interface CrashIndexEntry {
  /** Sum of eventCount across all crash groups on this screen. */
  count: number;
  /** Fingerprint of the highest-eventCount group on this screen. */
  topFingerprint: string;
}

/** Map of `screen name → aggregated crash entry`. */
export type CrashIndex = Map<string, CrashIndexEntry>;
