/**
 * Client-side record + filter types. Kept deliberately in sync with
 * `dashboard/server/src/storage/types.ts` — the two packages are separate
 * by design (browser vs Node), so we mirror rather than share.
 *
 * When the server's types.ts changes, update this file in the same PR.
 */

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

export interface EventListFilter {
  since?: number;
  until?: number;
  type?: string | string[];
  severity?: Severity | Severity[];
  sessionId?: string;
  fingerprint?: string;
  userId?: string;
  limit?: number;
}

export type SymbolPlatform = 'ios' | 'android';

export interface SymbolFileRecord {
  id: string;
  platform: SymbolPlatform;
  bundleId: string;
  version: string;
  filename: string;
  sizeBytes: number;
  uploadedAt: number;
  entryCount: number;
  uuid: string | null;
  mappingText: string | null;
}

export interface SymbolResolveInput {
  platform: SymbolPlatform;
  bundleId: string;
  version: string;
  symbol: string;
  fileId?: string;
}

export interface ResolvedFrame {
  input: Omit<SymbolResolveInput, 'fileId'>;
  resolved: boolean;
  symbol: string;
  note?: string;
  source?: {
    fileId: string;
    platform: SymbolPlatform;
    version: string;
  };
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
