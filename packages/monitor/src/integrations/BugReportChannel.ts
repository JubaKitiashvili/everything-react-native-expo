/**
 * Task 117.20 — BugReportChannel
 *
 * The SDK side of bidirectional bug reports. Talks HTTP to the dashboard's
 * ingest-authed `/v1/bug-reports` routes (distinct from the WS event channel):
 *
 *   submit()  — POST a new report for the current session.
 *   reply()   — POST a "reporter" (app-user) reply into a report's thread.
 *   poll()    — GET operator replies newer than the last seen, for in-app
 *               display; advances an internal `since` watermark + emits each
 *               new reply via `onReply`.
 *   start()/stop() — run `poll()` on a timer.
 *
 * Every network call swallows its errors and returns a benign value — bug
 * reporting must never throw into or crash the host app. All I/O (fetch,
 * clock, timer) is injectable so the whole channel is deterministically
 * unit-testable with no real network.
 */

export interface OperatorReply {
  id: string;
  reportId: string;
  author: string;
  authorRole: 'operator';
  body: string;
  createdAt: number;
}

export interface SubmitReportInput {
  title?: string;
  description?: string;
  eventIds?: string[];
  attachments?: Record<string, unknown>;
}

export interface BugReportChannelOptions {
  /** http(s):// base URL of the ERNE dashboard. */
  baseUrl: string;
  /** Current session id — scopes report creation + reply polling. */
  sessionId: string;
  /** Ingest bearer token. Omit when the server has no keys configured. */
  apiKey?: string;
  /** Invoked for each newly-seen operator reply during polling. */
  onReply?: (reply: OperatorReply) => void;
  /** Poll interval in ms. Default 30s. */
  pollIntervalMs?: number;
  /** fetch injection (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Clock injection. */
  now?: () => number;
  /** Timer injection for tests. */
  setIntervalImpl?: (fn: () => void, ms: number) => unknown;
  clearIntervalImpl?: (handle: unknown) => void;
}

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export class BugReportChannel {
  private readonly baseUrl: string;
  private readonly sessionId: string;
  private readonly apiKey: string | undefined;
  private readonly onReply: ((reply: OperatorReply) => void) | undefined;
  private readonly pollIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly setIntervalImpl: (fn: () => void, ms: number) => unknown;
  private readonly clearIntervalImpl: (handle: unknown) => void;

  /** Watermark: only operator replies with createdAt > since are "new". */
  private since = 0;
  private timer: unknown = null;

  constructor(options: BugReportChannelOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.sessionId = options.sessionId;
    this.apiKey = options.apiKey;
    this.onReply = options.onReply;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.now = options.now ?? Date.now;
    this.setIntervalImpl =
      options.setIntervalImpl ?? ((fn, ms) => setInterval(fn, ms) as unknown);
    this.clearIntervalImpl =
      options.clearIntervalImpl ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
    };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  /** Create a new report for the current session. Returns its id, or null. */
  async submit(input: SubmitReportInput = {}): Promise<{ id: string } | null> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/bug-reports`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ sessionId: this.sessionId, ...input }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { report?: { id?: string } };
      const id = data.report?.id;
      return typeof id === 'string' ? { id } : null;
    } catch {
      return null;
    }
  }

  /** Append the app user's reply to a report thread. Returns success. */
  async reply(reportId: string, body: string): Promise<boolean> {
    if (typeof body !== 'string' || body.trim().length === 0) return false;
    try {
      const res = await this.fetchImpl(
        `${this.baseUrl}/v1/bug-reports/${encodeURIComponent(reportId)}/replies`,
        { method: 'POST', headers: this.headers(), body: JSON.stringify({ body }) },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch operator replies newer than the watermark, advance the watermark,
   * emit each via `onReply`, and return them. Returns [] on any error.
   */
  async poll(): Promise<OperatorReply[]> {
    try {
      const url =
        `${this.baseUrl}/v1/bug-reports/replies` +
        `?sessionId=${encodeURIComponent(this.sessionId)}&since=${this.since}`;
      const res = await this.fetchImpl(url, { method: 'GET', headers: this.headers() });
      if (!res.ok) return [];
      const data = (await res.json()) as { replies?: unknown };
      const replies = Array.isArray(data.replies) ? (data.replies as OperatorReply[]) : [];
      const fresh = replies.filter(
        (r) =>
          r &&
          typeof r.createdAt === 'number' &&
          r.authorRole === 'operator' &&
          r.createdAt > this.since,
      );
      for (const reply of fresh) {
        this.since = Math.max(this.since, reply.createdAt);
        this.onReply?.(reply);
      }
      return fresh;
    } catch {
      return [];
    }
  }

  /** Begin polling on the configured interval. Idempotent. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = this.setIntervalImpl(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  /** Stop polling. */
  stop(): void {
    if (this.timer === null) return;
    this.clearIntervalImpl(this.timer);
    this.timer = null;
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
