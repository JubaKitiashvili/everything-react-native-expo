// Task 117.2 — HTTP client for the @erne/monitor dashboard server.
//
// Called by every MCP tool to reach the REST API that already serves
// the web dashboard. Built on the Node 20+ `fetch` global so we don't
// pull an HTTP library into this small process.
//
// Responsibilities:
//   - build the base URL + API key header once
//   - time every request out at `timeoutMs`
//   - retry once on transient 5xx / network errors (ingest errors are
//     expensive for Claude interactions; one retry is worth it)
//   - surface typed results that match the server's JSON response
//     envelopes ({ events }, { sessions }, { summary }, etc.)

/** Sub-set of the dashboard server's types — kept local so the MCP
 *  package doesn't import the monorepo's server package at build time
 *  and pull in its runtime deps. */

export type Severity = 'critical' | 'warning' | 'info' | 'success' | 'muted';

export interface EventRecord {
  id: string;
  type: string;
  severity: Severity | string;
  sessionId: string;
  fingerprint?: string;
  timestamp: number;
  receivedAt: number;
  screen?: string;
  platform?: string;
  payload: Record<string, unknown>;
  userId?: string;
}

export interface SessionRecord {
  id: string;
  userId?: string;
  startedAt: number;
  endedAt?: number;
  platform?: string;
  device?: Record<string, unknown>;
  appVersion?: string;
  runtimeVersion?: string;
  channel?: string;
  eventCount: number;
  crashCount: number;
}

export interface CrashGroupRecord {
  fingerprint: string;
  message: string;
  firstSeen: number;
  lastSeen: number;
  eventCount: number;
  sessionCount: number;
  status: 'new' | 'acknowledged' | 'resolved' | 'regressed' | string;
  topScreen?: string;
  aiSuggestion?: Record<string, unknown>;
}

export interface BugReportRecord {
  id: string;
  sessionId: string;
  submittedAt: number;
  title?: string;
  description?: string;
  status: string;
  assignee?: string;
  attachments?: Record<string, unknown>;
  eventIds?: string[];
}

export interface AlertRuleRecord {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  windowSeconds: number;
  channels: string[];
  cooldownSeconds: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AlertFiringRecord {
  id: string;
  ruleId: string;
  firedAt: number;
  metricValue: number;
  severity: Severity | string;
  payload?: Record<string, unknown>;
}

export interface SymbolFileRecord {
  id: string;
  platform: 'ios' | 'android';
  bundleId: string;
  version: string;
  filename: string;
  sizeBytes: number;
  uploadedAt: number;
  entryCount: number;
  uuid: string | null;
  mappingText: string | null;
}

export interface DashboardSettings {
  retentionDays: number;
  port: number;
  host: string;
  wsTokenMasked: string | null;
  wsTokenSet: boolean;
  uptimeSeconds: number;
}

export interface QueueStatsPayload {
  enqueued: number;
  processed: number;
  failed: number;
  retried: number;
  backpressured: number;
  currentSize: number;
  inFlight: number;
  highWaterMark: number;
}

export interface UserDataSummary {
  userId: string;
  sessionCount: number;
  eventCount: number;
  crashCount: number;
  firstSeen: number | null;
  lastSeen: number | null;
  eventTypes: { type: string; count: number }[];
}

export interface UserDataExport {
  userId: string;
  sessions: SessionRecord[];
  events: EventRecord[];
  exportedAt: number;
}

export interface ResolveSymbolInput {
  platform: 'ios' | 'android';
  bundleId: string;
  version: string;
  symbol?: string;
  fileId?: string;
}

export interface ResolveSymbolResult {
  frame: {
    class?: string | null;
    method?: string | null;
    line?: number | null;
    raw: string;
  } | null;
  file: SymbolFileRecord | null;
}

export interface EventListFilter {
  since?: number;
  until?: number;
  sessionId?: string;
  fingerprint?: string;
  userId?: string;
  type?: string | string[];
  severity?: Severity | Severity[];
  limit?: number;
}

export interface CrashGroupListFilter {
  since?: number;
  until?: number;
  status?: CrashGroupRecord['status'] | CrashGroupRecord['status'][];
  limit?: number;
}

export interface DashboardClientOptions {
  dashboardUrl: string;
  apiKey?: string | null;
  timeoutMs?: number;
  /** Injection hook for tests — override global fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Thrown by DashboardClient for every non-2xx response. Captures the
 *  HTTP status so tools can surface it in a structured error result
 *  rather than dumping a stack trace back to Claude. */
export class DashboardRequestError extends Error {
  readonly status: number;
  readonly path: string;
  readonly body: string | null;
  constructor(message: string, path: string, status: number, body: string | null) {
    super(message);
    this.name = 'DashboardRequestError';
    this.path = path;
    this.status = status;
    this.body = body;
  }
}

export class DashboardClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DashboardClientOptions) {
    // Trim trailing slashes so `${base}/api/events` doesn't double-up.
    this.baseUrl = options.dashboardUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey ?? null;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  // ---------- low-level ----------

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const init: RequestInit = {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };

    const attempt = async (): Promise<T> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, { ...init, signal: controller.signal });
        if (!res.ok) {
          const text = await res.text().catch(() => null);
          throw new DashboardRequestError(
            `${method} ${path} failed with ${res.status}`,
            path,
            res.status,
            text,
          );
        }
        return (await res.json()) as T;
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      return await attempt();
    } catch (err) {
      // One retry for transient failures. 401/403 are terminal (wrong
      // key — retrying won't help), 404 is also terminal.
      if (err instanceof DashboardRequestError) {
        if (err.status >= 500) return await attempt();
        throw err;
      }
      // Network / abort — single retry.
      return await attempt();
    }
  }

  // ---------- endpoints ----------

  async getHealth(): Promise<{ ok: true; tables: string[]; uptimeSeconds: number }> {
    return await this.request('GET', '/api/health');
  }

  async getReadiness(): Promise<{ ready: boolean; reason?: string; migrationsApplied: number }> {
    // /api/ready responds 200 or 503 with the same body shape; we
    // tolerate both because 503 isn't an "error" for our purposes.
    try {
      return await this.request('GET', '/api/ready');
    } catch (err) {
      if (err instanceof DashboardRequestError && err.status === 503 && err.body) {
        try {
          return JSON.parse(err.body) as { ready: false; reason: string; migrationsApplied: number };
        } catch {
          /* fall through */
        }
      }
      throw err;
    }
  }

  async getQueueStats(): Promise<QueueStatsPayload | null> {
    const body = await this.request<{ queue: QueueStatsPayload | null }>('GET', '/api/queue/stats');
    return body.queue;
  }

  async getSettings(): Promise<DashboardSettings> {
    const body = await this.request<{ settings: DashboardSettings }>('GET', '/api/settings');
    return body.settings;
  }

  async listEvents(filter: EventListFilter = {}): Promise<EventRecord[]> {
    const params = buildEventQuery(filter);
    const body = await this.request<{ events: EventRecord[] }>(
      'GET',
      `/api/events${params}`,
    );
    return body.events;
  }

  async listSessions(limit = 50): Promise<SessionRecord[]> {
    const body = await this.request<{ sessions: SessionRecord[] }>(
      'GET',
      `/api/sessions?limit=${Math.min(500, Math.max(1, limit))}`,
    );
    return body.sessions;
  }

  async listCrashGroups(filter: CrashGroupListFilter = {}): Promise<CrashGroupRecord[]> {
    const parts: string[] = [];
    if (filter.since !== undefined) parts.push(`since=${filter.since}`);
    if (filter.until !== undefined) parts.push(`until=${filter.until}`);
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      for (const s of statuses) parts.push(`status=${encodeURIComponent(String(s))}`);
    }
    if (filter.limit !== undefined) parts.push(`limit=${Math.min(500, Math.max(1, filter.limit))}`);
    const suffix = parts.length > 0 ? `?${parts.join('&')}` : '';
    const body = await this.request<{ groups: CrashGroupRecord[] }>(
      'GET',
      `/api/crash-groups${suffix}`,
    );
    return body.groups;
  }

  async listBugReports(limit = 100): Promise<BugReportRecord[]> {
    const body = await this.request<{ reports: BugReportRecord[] }>(
      'GET',
      `/api/bug-reports?limit=${Math.min(500, Math.max(1, limit))}`,
    );
    return body.reports;
  }

  async listAlertRules(): Promise<AlertRuleRecord[]> {
    const body = await this.request<{ rules: AlertRuleRecord[] }>('GET', '/api/alert-rules');
    return body.rules;
  }

  async listAlertHistory(options: {
    ruleId?: string;
    since?: number;
    until?: number;
    limit?: number;
  } = {}): Promise<AlertFiringRecord[]> {
    const parts: string[] = [];
    if (options.ruleId) parts.push(`ruleId=${encodeURIComponent(options.ruleId)}`);
    if (options.since !== undefined) parts.push(`since=${options.since}`);
    if (options.until !== undefined) parts.push(`until=${options.until}`);
    if (options.limit !== undefined)
      parts.push(`limit=${Math.min(500, Math.max(1, options.limit))}`);
    const suffix = parts.length > 0 ? `?${parts.join('&')}` : '';
    const body = await this.request<{ firings: AlertFiringRecord[] }>(
      'GET',
      `/api/alert-history${suffix}`,
    );
    return body.firings;
  }

  async listSymbolFiles(options: {
    platform?: 'ios' | 'android';
    bundleId?: string;
    version?: string;
  } = {}): Promise<SymbolFileRecord[]> {
    const parts: string[] = [];
    if (options.platform) parts.push(`platform=${options.platform}`);
    if (options.bundleId) parts.push(`bundleId=${encodeURIComponent(options.bundleId)}`);
    if (options.version) parts.push(`version=${encodeURIComponent(options.version)}`);
    const suffix = parts.length > 0 ? `?${parts.join('&')}` : '';
    const body = await this.request<{ files: SymbolFileRecord[] }>(
      'GET',
      `/api/symbols${suffix}`,
    );
    return body.files;
  }

  async resolveSymbol(input: ResolveSymbolInput): Promise<ResolveSymbolResult> {
    const body = await this.request<{ resolved: ResolveSymbolResult }>(
      'POST',
      '/api/symbols/resolve',
      input,
    );
    return body.resolved;
  }

  async getUserDataSummary(userId: string): Promise<UserDataSummary> {
    const body = await this.request<{ summary: UserDataSummary }>(
      'GET',
      `/api/users/${encodeURIComponent(userId)}/summary`,
    );
    return body.summary;
  }

  async exportUserData(userId: string): Promise<UserDataExport> {
    const body = await this.request<{ export: UserDataExport }>(
      'GET',
      `/api/users/${encodeURIComponent(userId)}/export`,
    );
    return body.export;
  }
}

function buildEventQuery(filter: EventListFilter): string {
  const parts: string[] = [];
  if (filter.since !== undefined) parts.push(`since=${filter.since}`);
  if (filter.until !== undefined) parts.push(`until=${filter.until}`);
  if (filter.sessionId) parts.push(`sessionId=${encodeURIComponent(filter.sessionId)}`);
  if (filter.fingerprint) parts.push(`fingerprint=${encodeURIComponent(filter.fingerprint)}`);
  if (filter.userId) parts.push(`userId=${encodeURIComponent(filter.userId)}`);
  if (filter.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    for (const t of types) parts.push(`type=${encodeURIComponent(t)}`);
  }
  if (filter.limit !== undefined) {
    parts.push(`limit=${Math.min(1000, Math.max(1, filter.limit))}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}
