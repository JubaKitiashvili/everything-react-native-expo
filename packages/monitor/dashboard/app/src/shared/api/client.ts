import type {
  AlertRuleRecord,
  BugReportRecord,
  BugReportReply,
  CrashGroupRecord,
  DashboardResetResult,
  DashboardSettings,
  DemoSeedResult,
  EventListFilter,
  EventRecord,
  ResolvedFrame,
  SessionRecord,
  Severity,
  SymbolFileRecord,
  SymbolPlatform,
  SymbolResolveInput,
  UserDataExport,
  UserDataSummary,
} from './types';

export interface AlertFiringRecord {
  id: string;
  ruleId: string;
  firedAt: number;
  metricValue: number;
  severity: Severity;
  payload?: Record<string, unknown>;
}

export interface SaveAlertRuleInput {
  id?: string;
  name: string;
  metric: string;
  threshold: number;
  windowSeconds: number;
  channels: string[];
  cooldownSeconds?: number;
  enabled?: boolean;
}

export interface AlertHistoryFilter {
  ruleId?: string;
  limit?: number;
}

export interface UpdateBugReportInput {
  status?: 'new' | 'assigned' | 'resolved';
  assignee?: string;
  title?: string;
  description?: string;
}

export interface SymbolFileListFilter {
  platform?: SymbolPlatform;
  bundleId?: string;
  version?: string;
}

export interface UploadSymbolFileInput {
  platform: SymbolPlatform;
  bundleId: string;
  version: string;
  filename: string;
  uuid?: string;
  mappingText?: string;
  sizeBytes?: number;
}

export interface DashboardApiClient {
  fetchEvents(filter?: EventListFilter): Promise<EventRecord[]>;
  fetchSessions(): Promise<SessionRecord[]>;
  fetchCrashGroups(): Promise<CrashGroupRecord[]>;
  fetchAlertRules(): Promise<AlertRuleRecord[]>;
  saveAlertRule(rule: SaveAlertRuleInput): Promise<AlertRuleRecord>;
  deleteAlertRule(id: string): Promise<void>;
  fetchAlertHistory(filter?: AlertHistoryFilter): Promise<AlertFiringRecord[]>;
  fetchBugReports(): Promise<BugReportRecord[]>;
  updateBugReport(id: string, patch: UpdateBugReportInput): Promise<BugReportRecord | null>;
  /** Task 117.20 — the bug report's reply thread, oldest first. */
  fetchBugReportReplies(reportId: string): Promise<BugReportReply[]>;
  /** Task 117.20 — append an operator reply (Member+). */
  addBugReportReply(reportId: string, body: string): Promise<BugReportReply>;
  fetchSymbolFiles(filter?: SymbolFileListFilter): Promise<SymbolFileRecord[]>;
  uploadSymbolFile(input: UploadSymbolFileInput): Promise<SymbolFileRecord>;
  deleteSymbolFile(id: string): Promise<void>;
  resolveFrame(input: SymbolResolveInput): Promise<ResolvedFrame>;
  fetchUserSummary(userId: string): Promise<UserDataSummary>;
  exportUserData(userId: string): Promise<UserDataExport>;
  deleteUserData(userId: string): Promise<{ deletedEvents: number }>;
  fetchSettings(): Promise<DashboardSettings>;
  patchSettings(patch: { retentionDays?: number }): Promise<DashboardSettings>;
  rotateWsToken(): Promise<{ wsTokenMasked: string | null; wsTokenSet: boolean }>;
  resetDatabase(): Promise<DashboardResetResult>;
  generateSampleData(): Promise<DemoSeedResult>;
  // --- Task 117.18 RBAC ---
  /** Exchange email+password for a JWT. Rejects on 401 (bad credentials). */
  login(email: string, password: string): Promise<LoginResponse>;
  /** The current principal + whether RBAC is enforced. */
  fetchMe(): Promise<MeResponse>;
  /** Create a user (Owner-only; the first call bootstraps the first Owner). */
  registerUser(input: RegisterUserInput): Promise<AuthUser>;
  /** List users in the caller's tenant (Owner-only). */
  fetchUsers(): Promise<AuthUser[]>;
  /** Change a user's role (Owner-only). */
  setUserRole(id: string, role: AuthRole): Promise<void>;
  /** Remove a user (Owner-only). */
  deleteUser(id: string): Promise<void>;
}

/** Task 117.18 — the three RBAC roles, mirrored from the server. */
export type AuthRole = 'owner' | 'member' | 'viewer';

/** The authenticated identity returned by login / me. */
export interface AuthUser {
  id: string;
  email: string;
  role: AuthRole;
  tenantId: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface MeResponse {
  /** Whether RBAC is enforced. When false the dashboard runs login-free. */
  enforcing: boolean;
  user: AuthUser;
}

export interface RegisterUserInput {
  email: string;
  password: string;
  role?: AuthRole;
}

export interface CreateApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /**
   * Task 117.18 — supplies the current Bearer JWT for each request. A getter
   * (not a static value) so a fresh login/logout is picked up without
   * recreating the client. Returns null when unauthenticated.
   */
  getToken?: () => string | null;
  /**
   * Task 117.18 — invoked once when any request gets a 401, so the app can
   * clear its session + redirect to login. The originating call still
   * rejects (callers see the error) — this is a side-channel, not a retry.
   */
  onUnauthorized?: () => void;
}

/**
 * Build the query-string for `/api/events`. Arrays are serialised as
 * repeated params (`?type=crash&type=anr`) to match the server's
 * `URLSearchParams.getAll('type')` parser.
 */
export function buildEventsQuery(filter: EventListFilter): string {
  const params = new URLSearchParams();
  if (filter.since !== undefined) params.set('since', String(filter.since));
  if (filter.until !== undefined) params.set('until', String(filter.until));
  if (filter.sessionId !== undefined) params.set('sessionId', filter.sessionId);
  if (filter.fingerprint !== undefined) params.set('fingerprint', filter.fingerprint);
  if (filter.userId !== undefined) params.set('userId', filter.userId);
  if (filter.limit !== undefined) params.set('limit', String(filter.limit));
  if (filter.type !== undefined) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    for (const t of types) params.append('type', t);
  }
  if (filter.severity !== undefined) {
    const severities = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
    for (const s of severities) params.append('severity', s);
  }
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : '';
}

export function createApiClient(options: CreateApiClientOptions = {}): DashboardApiClient {
  const baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
  const fetchFn = options.fetchImpl ?? fetch;

  /** Authorization header from the current token getter, when present. */
  function authHeader(): Record<string, string> {
    const token = options.getToken?.();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  /** Notify the app on a 401 so it can clear the session + redirect. */
  function noteStatus(status: number): void {
    if (status === 401) options.onUnauthorized?.();
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetchFn(`${baseUrl}${path}`, {
      signal: options.signal ?? null,
      headers: { accept: 'application/json', ...authHeader() },
    });
    if (!response.ok) {
      noteStatus(response.status);
      const body = await response.text().catch(() => '');
      throw new Error(
        `[dashboard-api] ${response.status} ${response.statusText} for ${path}: ${body || '<no body>'}`,
      );
    }
    return (await response.json()) as T;
  }

  async function sendJson<T>(
    path: string,
    method: 'POST' | 'DELETE' | 'PATCH',
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      signal: options.signal ?? null,
      headers: {
        accept: 'application/json',
        ...authHeader(),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetchFn(`${baseUrl}${path}`, init);
    if (!response.ok) {
      noteStatus(response.status);
      const text = await response.text().catch(() => '');
      throw new Error(
        `[dashboard-api] ${response.status} ${response.statusText} for ${method} ${path}: ${text || '<no body>'}`,
      );
    }
    return (await response.json()) as T;
  }

  return {
    async fetchEvents(filter = {}) {
      const { events } = await getJson<{ events: EventRecord[] }>(
        `/api/events${buildEventsQuery(filter)}`,
      );
      return events;
    },
    async fetchSessions() {
      const { sessions } = await getJson<{ sessions: SessionRecord[] }>('/api/sessions');
      return sessions;
    },
    async fetchCrashGroups() {
      const { groups } = await getJson<{ groups: CrashGroupRecord[] }>('/api/crash-groups');
      return groups;
    },
    async fetchAlertRules() {
      const { rules } = await getJson<{ rules: AlertRuleRecord[] }>('/api/alert-rules');
      return rules;
    },
    async saveAlertRule(rule) {
      const { rule: saved } = await sendJson<{ rule: AlertRuleRecord }>(
        '/api/alert-rules',
        'POST',
        rule,
      );
      return saved;
    },
    async deleteAlertRule(id) {
      await sendJson<{ ok: true }>(`/api/alert-rules/${encodeURIComponent(id)}`, 'DELETE');
    },
    async fetchAlertHistory(filter = {}) {
      const params = new URLSearchParams();
      if (filter.ruleId) params.set('ruleId', filter.ruleId);
      if (filter.limit !== undefined) params.set('limit', String(filter.limit));
      const qs = params.toString();
      const { firings } = await getJson<{ firings: AlertFiringRecord[] }>(
        `/api/alert-history${qs.length > 0 ? `?${qs}` : ''}`,
      );
      return firings;
    },
    async fetchBugReports() {
      const { reports } = await getJson<{ reports: BugReportRecord[] }>('/api/bug-reports');
      return reports;
    },
    async updateBugReport(id, patch) {
      const { report } = await sendJson<{ report: BugReportRecord | null }>(
        `/api/bug-reports/${encodeURIComponent(id)}`,
        'PATCH',
        patch,
      );
      return report;
    },
    async fetchBugReportReplies(reportId) {
      const { replies } = await getJson<{ replies: BugReportReply[] }>(
        `/api/bug-reports/${encodeURIComponent(reportId)}/replies`,
      );
      return replies;
    },
    async addBugReportReply(reportId, body) {
      const { reply } = await sendJson<{ reply: BugReportReply }>(
        `/api/bug-reports/${encodeURIComponent(reportId)}/replies`,
        'POST',
        { body },
      );
      return reply;
    },
    async fetchSymbolFiles(filter = {}) {
      const params = new URLSearchParams();
      if (filter.platform) params.set('platform', filter.platform);
      if (filter.bundleId) params.set('bundleId', filter.bundleId);
      if (filter.version) params.set('version', filter.version);
      const qs = params.toString();
      const { files } = await getJson<{ files: SymbolFileRecord[] }>(
        `/api/symbols${qs.length > 0 ? `?${qs}` : ''}`,
      );
      return files;
    },
    async uploadSymbolFile(input) {
      const { file } = await sendJson<{ file: SymbolFileRecord }>('/api/symbols', 'POST', input);
      return file;
    },
    async deleteSymbolFile(id) {
      await sendJson<{ ok: true }>(`/api/symbols/${encodeURIComponent(id)}`, 'DELETE');
    },
    async resolveFrame(input) {
      const { frame } = await sendJson<{ frame: ResolvedFrame }>(
        '/api/symbols/resolve',
        'POST',
        input,
      );
      return frame;
    },
    async fetchUserSummary(userId) {
      const { summary } = await getJson<{ summary: UserDataSummary }>(
        `/api/users/${encodeURIComponent(userId)}/summary`,
      );
      return summary;
    },
    async exportUserData(userId) {
      const { export: exported } = await getJson<{ export: UserDataExport }>(
        `/api/users/${encodeURIComponent(userId)}/export`,
      );
      return exported;
    },
    async deleteUserData(userId) {
      const response = await sendJson<{ ok: true; deletedEvents: number }>(
        `/api/users/${encodeURIComponent(userId)}`,
        'DELETE',
      );
      return { deletedEvents: response.deletedEvents };
    },
    async fetchSettings() {
      const { settings } = await getJson<{ settings: DashboardSettings }>('/api/settings');
      return settings;
    },
    async patchSettings(patch) {
      const { settings } = await sendJson<{ settings: DashboardSettings }>(
        '/api/settings',
        'PATCH',
        patch,
      );
      return settings;
    },
    async rotateWsToken() {
      return sendJson<{ wsTokenMasked: string | null; wsTokenSet: boolean }>(
        '/api/settings/rotate-token',
        'POST',
      );
    },
    async resetDatabase() {
      return sendJson<DashboardResetResult>('/api/settings/reset', 'POST');
    },
    async generateSampleData() {
      return sendJson<DemoSeedResult>('/api/demo/seed', 'POST');
    },
    async login(email, password) {
      // Direct fetch (not sendJson): a 401 here means "wrong password", NOT
      // "session expired", so it must not trip the onUnauthorized side-channel.
      const response = await fetchFn(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        signal: options.signal ?? null,
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        throw new Error(response.status === 401 ? 'invalid_credentials' : `login_failed_${response.status}`);
      }
      return (await response.json()) as LoginResponse;
    },
    async fetchMe() {
      return getJson<MeResponse>('/api/auth/me');
    },
    async registerUser(input) {
      const { user } = await sendJson<{ user: AuthUser }>('/api/auth/register', 'POST', input);
      return user;
    },
    async fetchUsers() {
      const { users } = await getJson<{ users: AuthUser[] }>('/api/auth/users');
      return users;
    },
    async setUserRole(id, role) {
      await sendJson<{ ok: true }>(`/api/auth/users/${encodeURIComponent(id)}`, 'PATCH', { role });
    },
    async deleteUser(id) {
      await sendJson<{ ok: true }>(`/api/auth/users/${encodeURIComponent(id)}`, 'DELETE');
    },
  };
}
