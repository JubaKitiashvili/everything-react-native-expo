// SessionManager tracks the current user session. A new session starts when:
//   - the SDK boots, or
//   - the app returns to foreground after being backgrounded for > 5 minutes.
//
// Like JSPlatformBridge, SessionManager uses explicit dependency injection so
// tests do not need the react-native Jest preset and so Phase 2 can swap in
// native-backed AppState and persistence cleanly.

export type AppStateStatus = 'active' | 'background' | 'inactive' | 'unknown';

export interface AppStateLike {
  addChangeListener(
    cb: (status: AppStateStatus) => void,
  ): { remove(): void };
  currentState(): AppStateStatus;
}

export interface SessionManagerDeps {
  /** Inactivity threshold in milliseconds (default: 5 minutes). */
  inactivityMs?: number;
  /** Wall-clock now() — injectable so tests can fast-forward. */
  now?: () => number;
  /** Random for UUID generation — injectable for deterministic tests. */
  random?: () => number;
  /** AppState integration; omit in pure unit tests. */
  appState?: AppStateLike;
}

const DEFAULT_INACTIVITY_MS = 5 * 60 * 1000;

export type SessionChangeListener = (sessionId: string) => void;

/**
 * RFC 4122 v4 UUID using the injected random() for determinism.
 * Avoids dragging in a dependency just for UUIDs.
 */
function uuidV4(random: () => number): string {
  const bytes = new Array<number>(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(random() * 256) & 0xff;
  }
  // Version 4: bits 12..15 of time_hi_and_version = 0100
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  // Variant: bits 6..7 of clock_seq_hi_and_reserved = 10
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

export class SessionManager {
  private readonly inactivityMs: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly listeners = new Set<SessionChangeListener>();
  private readonly appStateSubscription: { remove(): void } | null;

  private sessionId: string;
  private sessionStartedAt: number;
  private backgroundedAt: number | null = null;

  constructor(deps: SessionManagerDeps = {}) {
    this.inactivityMs = deps.inactivityMs ?? DEFAULT_INACTIVITY_MS;
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.sessionId = uuidV4(this.random);
    this.sessionStartedAt = this.now();

    if (deps.appState) {
      this.appStateSubscription = deps.appState.addChangeListener((status) => {
        this.handleAppStateChange(status);
      });
    } else {
      this.appStateSubscription = null;
    }
  }

  getCurrentSessionId(): string {
    return this.sessionId;
  }

  startNewSession(): string {
    const previous = this.sessionId;
    this.sessionId = uuidV4(this.random);
    this.sessionStartedAt = this.now();
    this.backgroundedAt = null;
    if (previous !== this.sessionId) {
      this.fireChange();
    }
    return this.sessionId;
  }

  onSessionChange(listener: SessionChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Milliseconds since the current session started. */
  getSessionDuration(): number {
    return Math.max(0, this.now() - this.sessionStartedAt);
  }

  /**
   * Releases AppState subscription and listeners. Safe to call multiple
   * times — MonitorClient.stop() may invoke this.
   */
  dispose(): void {
    this.appStateSubscription?.remove();
    this.listeners.clear();
  }

  private handleAppStateChange(status: AppStateStatus): void {
    if (status === 'background' || status === 'inactive') {
      this.backgroundedAt = this.now();
      return;
    }
    if (status === 'active' && this.backgroundedAt !== null) {
      const awayFor = this.now() - this.backgroundedAt;
      this.backgroundedAt = null;
      if (awayFor >= this.inactivityMs) {
        this.startNewSession();
      }
    }
  }

  private fireChange(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(this.sessionId);
      } catch (err) {
        const g = globalThis as {
          __erne_session_listener_errors__?: unknown[];
        };
        if (!Array.isArray(g.__erne_session_listener_errors__)) {
          g.__erne_session_listener_errors__ = [];
        }
        g.__erne_session_listener_errors__.push(err);
      }
    }
  }
}
