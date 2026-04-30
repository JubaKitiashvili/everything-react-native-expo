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

export type SymbolPlatform = 'ios' | 'android';

/**
 * Metadata + optional text body for an uploaded symbolication artefact.
 *
 * - Android / ProGuard: `mappingText` holds the parsed `mapping.txt`, `uuid`
 *   is null. We parse the mapping client-side so the server stays dumb.
 * - iOS / dSYM: `mappingText` is null (dSYM is a binary bundle we don't
 *   parse in the dashboard MVP), `uuid` is the machO UUID the SDK reports
 *   with every crash frame so the server can match the right artefact.
 */
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

export interface SymbolFileListFilter {
  platform?: SymbolPlatform;
  bundleId?: string;
  version?: string;
  limit?: number;
}

export interface SymbolResolveInput {
  platform: SymbolPlatform;
  bundleId: string;
  version: string;
  /** Full symbol string, e.g. `a.b.c.d` (ProGuard) or a hex address (iOS). */
  symbol: string;
  /**
   * Optional generated `(line, column)` for Hermes / Metro source map
   * resolution (Task 117.3). When the artefact's `mappingText` is a
   * Hermes / SourceMap v3 JSON, the resolver uses these to find the
   * original `(file, line, column)`. 1-indexed lines in stack traces
   * should be converted to 0-indexed before sending.
   */
  line?: number;
  column?: number;
}

// ──────────────────────────────────────────────────────────────────
// AI agent audit trail (Task 117.81)
// ──────────────────────────────────────────────────────────────────
//
// Every action a Claude-driven agent takes through the dashboard
// surface — proposing a fix PR, calling an MCP tool, recording an
// outcome — gets one row in `ai_actions`. Operators query it for
// "what did the agent do, when, with what confidence, against what
// data" — the table is the auditable counterpart to the
// confidence-decay store inside the agent itself.

/** Outcome enum kept loose because future agents may add categories. */
export type AiActionOutcome =
  | 'proposed'
  | 'merged'
  | 'rejected'
  | 'ignored'
  | 'invoked'
  | 'errored'
  | (string & {});

export interface AiActionRecord {
  /** Stable id (uuid). The caller picks one so retries can dedupe. */
  id: string;
  /** ms timestamp when the action occurred. */
  timestamp: number;
  /** Short stable agent id (`ai-fix-pr`, `mcp-tool`, `mcp-server`). */
  agent: string;
  /** Action verb (`propose-fix`, `invoke-tool`, `record-outcome`). */
  action: string;
  /** Operator user id when known. */
  user?: string;
  /** Crash group fingerprint when the action targets a crash. */
  fingerprint?: string;
  /** Names of MCP tools called by the agent during this action. */
  toolsCalled?: string[];
  /** Repo-relative file paths the agent considered or edited. */
  filesConsidered?: string[];
  /** Self-reported confidence, 0..100. */
  confidence?: number;
  /** Decay-weighted effective confidence the gate ran on. */
  effectiveConfidence?: number;
  /** Classification bucket (matches AIFixPR's confidence buckets). */
  classification?: string;
  /** Final outcome for the action. */
  outcome: AiActionOutcome;
  /** PR URL when one was opened. */
  prUrl?: string;
  /** Sanitiser labels triggered while building / running the action. */
  redactionLabels?: string[];
  /** Free-form bag for agent-specific extras (skip detail, queue stats). */
  metadata?: Record<string, unknown>;
}

export interface AiActionListFilter {
  since?: number;
  until?: number;
  agent?: string;
  action?: string;
  fingerprint?: string;
  outcome?: AiActionOutcome | AiActionOutcome[];
  limit?: number;
  offset?: number;
}
