export interface AgentState {
  status: 'idle' | 'working' | 'planning' | 'done';
  task: string | null;
  room: string;
  startedAt: string | null;
  lastEvent: string | null;
}

export type AgentMap = Record<string, AgentState>;

export interface HistoryEntry {
  type: 'start' | 'complete' | 'planning' | 'timeout';
  task: string | null;
  timestamp: string;
  durationMs?: number;
}

export type HistoryMap = Record<string, HistoryEntry[]>;

export interface AuditFinding {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  detail: string;
  fix: string;
}

export interface AuditReport {
  version?: number;
  project?: string;
  date?: string;
  score: number;
  strengths?: Array<{ category: string; title: string }>;
  findings: AuditFinding[];
  stack?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface UpgradePackage {
  name: string;
  current: string;
  latest: string;
  type: 'major' | 'minor' | 'patch';
}

export interface WorkerTask {
  ticketId?: string;
  identifier?: string;
  title?: string;
  status: string;
  source?: string;
  step?: string;
  prUrl?: string;
  startedAt?: string;
  completedAt?: string;
  agent?: string;
  confidence?: number;
}

export interface WorkerState {
  status: string;
  provider?: string;
  repo?: string;
  currentTicket?: WorkerTask;
  tasks?: WorkerTask[];
  history?: WorkerTask[];
  log?: string[];
  ticketsToday?: number;
}

export interface Issue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  detail: string;
  fix: string;
  source: 'audit' | 'deps' | 'security' | 'performance' | 'quality';
  isExecutable: boolean;
}

export interface LocalTask {
  id: string;
  title: string;
  description: string;
  source: string;
  status: 'queue' | 'in_progress' | 'in_review' | 'done';
  photos: string[];
  createdAt: string;
  prUrl: string | null;
}

export interface McpServer {
  name: string;
  transport: string;
  status: 'connected' | 'disconnected' | 'unknown';
  source: 'project' | 'user';
}

export interface AppOverview {
  name?: string;
  version?: string;
  framework?: string;
  typescript?: boolean;
  newArch?: boolean;
  healthGrade?: string;
  stack?: Record<string, string>;
  audit?: AuditReport;
  mcp?: McpServer[];
  updates?: UpgradePackage[];
  recommendations?: Array<{ type: string; message: string }>;
  fixes?: Array<{ text: string; timestamp: string }>;
}

export interface EnvironmentTool {
  name: string;
  version: string | null;
  status: 'ok' | 'missing' | 'outdated';
}
