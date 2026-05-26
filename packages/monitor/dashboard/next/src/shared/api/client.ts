import type {
  AlertRuleRecord,
  BugReportRecord,
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
}

export interface CreateApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
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

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetchFn(`${baseUrl}${path}`, {
      signal: options.signal ?? null,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
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
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetchFn(`${baseUrl}${path}`, init);
    if (!response.ok) {
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
  };
}
