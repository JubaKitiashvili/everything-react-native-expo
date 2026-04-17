export type Severity = 'critical' | 'warning' | 'info' | 'success' | 'muted';

export interface EventRecord {
  id: string;
  type: string;
  severity: Severity;
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

export type CrashGroupStatus = 'new' | 'investigating' | 'resolved' | 'ignored';

export interface CrashGroupRecord {
  fingerprint: string;
  message: string;
  firstSeen: number;
  lastSeen: number;
  eventCount: number;
  sessionCount: number;
  status: CrashGroupStatus;
  topScreen?: string;
  aiSuggestion?: Record<string, unknown>;
}

export type BugReportStatus = 'new' | 'assigned' | 'resolved';

export interface BugReportRecord {
  id: string;
  sessionId: string;
  submittedAt: number;
  title?: string;
  description?: string;
  status: BugReportStatus;
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
  severity: Severity;
  payload?: Record<string, unknown>;
}

export interface EventListFilter {
  since?: number;
  until?: number;
  type?: string | string[];
  severity?: Severity | Severity[];
  sessionId?: string;
  fingerprint?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface CrashGroupListFilter {
  status?: CrashGroupStatus | CrashGroupStatus[];
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

export interface BugReportListFilter {
  status?: BugReportStatus | BugReportStatus[];
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export interface AlertHistoryListFilter {
  ruleId?: string;
  since?: number;
  until?: number;
  limit?: number;
}
