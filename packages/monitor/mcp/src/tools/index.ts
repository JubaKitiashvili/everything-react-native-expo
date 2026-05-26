// Task 117.2 — MCP tool catalogue.
//
// Each entry is a `ToolDefinition` — enough metadata to let both the
// production `server.ts` (which registers into an MCP server) and the
// vitest suite (which validates schemas + mocks a DashboardClient)
// share the same source of truth.
//
// Tool philosophy:
//   - read-only. Nothing here mutates state. Mutations happen through
//     the dashboard UI (or future purpose-built write tools); that
//     keeps the initial MCP attack surface minimal.
//   - narrow. Each tool does one thing. "list_events" takes filters,
//     "list_crash_groups" takes filters. We avoid mega-tools with
//     20 optional params — Claude picks the right tool faster.
//   - sanitised. Every string-bearing field passes through `sanitize`
//     before being returned.

import { z, type ZodRawShape, type ZodTypeAny } from 'zod';
import type {
  CrashGroupRecord,
  DashboardClient,
  EventRecord,
  SymbolFileRecord,
} from '../client.js';
import { sanitizeValue } from '../sanitize.js';

/**
 * Type-erased tool signature used by the catalogue + MCP server. The
 * authoring helpers below restore strong typing in each definition
 * while still allowing the catalogue to be a homogeneous array.
 */
/**
 * Task 117.82 — tool permission tier.
 *   - `read`  — queries telemetry, mutates nothing. Always allowed.
 *   - `write` — mutates dashboard state. Gated behind
 *     `permissions.allowWrite` + optional per-call `confirmWrite`.
 */
export type ToolTier = 'read' | 'write';

export interface ToolDefinition {
  name: string;
  description: string;
  /**
   * Usage example shown to Claude. Keep it short and natural —
   * Claude picks the right tool based on the description + example.
   */
  example: string;
  /**
   * Task 117.82 — declares whether the tool only reads telemetry or
   * also mutates dashboard state. The server refuses `write` tools
   * unless the operator explicitly opts in.
   */
  tier: ToolTier;
  inputSchema: ZodRawShape;
  handler: (args: Record<string, unknown>, client: DashboardClient) => Promise<unknown>;
}

type InferShape<S extends ZodRawShape> = {
  [K in keyof S]: S[K] extends ZodTypeAny ? z.infer<S[K]> : never;
};

/**
 * Authoring helper — lets each tool declare a strongly-typed handler
 * and then erases the generic at the boundary so the catalogue is a
 * plain `ToolDefinition[]`.
 */
function defineTool<S extends ZodRawShape>(spec: {
  name: string;
  description: string;
  example: string;
  /** Defaults to `read` — the vast majority of tools query telemetry. */
  tier?: ToolTier;
  inputSchema: S;
  handler: (args: InferShape<S>, client: DashboardClient) => Promise<unknown>;
}): ToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    example: spec.example,
    tier: spec.tier ?? 'read',
    inputSchema: spec.inputSchema,
    handler: (args, client) => spec.handler(args as InferShape<S>, client),
  };
}

// ------- shared schema atoms -------

const severityEnum = z.enum(['critical', 'warning', 'info', 'success', 'muted']);
const crashStatusEnum = z.enum(['new', 'acknowledged', 'resolved', 'regressed']);
const platformEnum = z.enum(['ios', 'android']);

// ------- derivation helpers -------

/**
 * "Interesting" crash groups by count. Computed on top of list_crash_groups
 * because the REST API doesn't currently have a "top crashes" endpoint.
 * Done this way so we don't have to modify the server for this feature.
 */
function rankCrashesByCount(groups: CrashGroupRecord[]): CrashGroupRecord[] {
  return groups
    .slice()
    .sort((a, b) => b.eventCount - a.eventCount);
}

function toEventSummary(e: EventRecord): {
  id: string;
  type: string;
  severity: string;
  sessionId: string;
  timestamp: number;
  fingerprint?: string;
  screen?: string;
  userId?: string;
  message?: string;
} {
  const msg = (e.payload as { message?: unknown })?.message;
  const summary: ReturnType<typeof toEventSummary> = {
    id: e.id,
    type: e.type,
    severity: String(e.severity),
    sessionId: e.sessionId,
    timestamp: e.timestamp,
  };
  if (e.fingerprint !== undefined) summary.fingerprint = e.fingerprint;
  if (e.screen !== undefined) summary.screen = e.screen;
  if (e.userId !== undefined) summary.userId = e.userId;
  if (typeof msg === 'string') summary.message = msg;
  return summary;
}

function toSymbolFileSummary(s: SymbolFileRecord): Omit<SymbolFileRecord, 'mappingText'> {
  // mappingText can be hundreds of kilobytes — never dump it into a
  // tool result. Operators who need the raw map can hit the REST API
  // directly.
  const { mappingText: _discarded, ...rest } = s;
  void _discarded;
  return rest;
}

// ------- tool definitions -------

const getHealth = defineTool({
  name: 'get_health',
  description:
    'Return the dashboard server liveness probe. Safe to poll. Returns { ok, tables, uptimeSeconds }.',
  example: 'Use this to check the dashboard is alive before running other tools.',
  tier: 'read',
  inputSchema: {},
  handler: async (_args, client) => await client.getHealth(),
});

const getReadiness = defineTool({
  name: 'get_readiness',
  description:
    'Return the dashboard readiness probe. `ready: false` means migrations are pending or the store is busy.',
  example:
    'Before asking the dashboard for historical data, verify readiness — a "not ready" server may return stale data.',
  tier: 'read',
  inputSchema: {},
  handler: async (_args, client) => await client.getReadiness(),
});

const getQueueStats = defineTool({
  name: 'get_queue_stats',
  description:
    'Return ingest queue statistics: enqueued, processed, failed, retried, backpressured, depth. Non-zero `backpressured` means the dashboard is ingesting slower than SDKs deliver.',
  example:
    'Check queue_stats.backpressured after a flaky release to see if telemetry is being dropped at the front door.',
  tier: 'read',
  inputSchema: {},
  handler: async (_args, client) => await client.getQueueStats(),
});

const getSettings = defineTool({
  name: 'get_settings',
  description:
    'Return dashboard server configuration — retention_days, host/port, masked websocket token, uptime.',
  example: 'Use this to understand the current retention window before asking about old events.',
  tier: 'read',
  inputSchema: {},
  handler: async (_args, client) => await client.getSettings(),
});

const listEventsSchema = {
  since: z
    .number()
    .int()
    .optional()
    .describe('Lower bound timestamp (ms since epoch). Events with timestamp >= since.'),
  until: z
    .number()
    .int()
    .optional()
    .describe('Upper bound timestamp (ms since epoch). Events with timestamp <= until.'),
  sessionId: z.string().min(1).optional(),
  fingerprint: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  type: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  severity: z.union([severityEnum, z.array(severityEnum)]).optional(),
  limit: z.number().int().min(1).max(1000).optional().default(100),
};

const listEvents = defineTool({
  name: 'list_events',
  description:
    'List events matching an optional filter. Default limit 100, max 1000. Supports filters by time range, session, fingerprint, user, type, and severity.',
  example:
    'Ask for the last hour of crash events: `{ type: "crash", since: Date.now() - 3600_000, limit: 50 }`',
  tier: 'read',
  inputSchema: listEventsSchema,
  handler: async (args, client) => {
    const events = await client.listEvents(args);
    return {
      count: events.length,
      events: events.map((e) => sanitizeValue(toEventSummary(e), { wrap: true, path: 'event' })),
    };
  },
});

const searchEventsSchema = {
  query: z
    .string()
    .min(1)
    .describe(
      'Substring to search for inside event payload messages. Matched case-insensitively against the `payload.message` field.',
    ),
  since: z.number().int().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50),
};

const searchEvents = defineTool({
  name: 'search_events',
  description:
    'Search recent events by substring in their payload message. Returns the matching events up to `limit`. Used when the user asks something like "find events containing Network timeout".',
  example:
    'Find timeout-related events in the last day: `{ query: "timeout", since: Date.now() - 86_400_000, limit: 50 }`',
  tier: 'read',
  inputSchema: searchEventsSchema,
  handler: async (args, client) => {
    // The server doesn't have a full-text search endpoint — implement
    // client-side on top of list_events. Budget a larger fetch so the
    // substring filter has enough haystack.
    const batch = await client.listEvents({
      ...(args.since !== undefined ? { since: args.since } : {}),
      limit: Math.min(1000, args.limit * 10),
    });
    const needle = args.query.toLowerCase();
    const matches: EventRecord[] = [];
    for (const e of batch) {
      const msg = (e.payload as { message?: unknown })?.message;
      if (typeof msg === 'string' && msg.toLowerCase().includes(needle)) {
        matches.push(e);
        if (matches.length >= args.limit) break;
      }
    }
    return {
      query: args.query,
      count: matches.length,
      events: matches.map((e) => sanitizeValue(toEventSummary(e), { wrap: true, path: 'event' })),
    };
  },
});

const listSessionsSchema = {
  limit: z.number().int().min(1).max(500).optional().default(50),
};

const listSessions = defineTool({
  name: 'list_sessions',
  description:
    'List recent sessions, newest first. Each session summarises event + crash counts. Use to find which run of the app a user was in.',
  example: 'Show me the 10 latest sessions: `{ limit: 10 }`',
  tier: 'read',
  inputSchema: listSessionsSchema,
  handler: async (args, client) => {
    const sessions = await client.listSessions(args.limit);
    return {
      count: sessions.length,
      sessions: sessions.map((s) => sanitizeValue(s, { wrap: false, path: 'session' })),
    };
  },
});

const listCrashGroupsSchema = {
  since: z.number().int().optional(),
  until: z.number().int().optional(),
  status: z.union([crashStatusEnum, z.array(crashStatusEnum)]).optional(),
  limit: z.number().int().min(1).max(500).optional().default(50),
};

const listCrashGroups = defineTool({
  name: 'list_crash_groups',
  description:
    'List crash groups ordered by last-seen time. A crash group aggregates identical crashes by fingerprint across many sessions.',
  example: 'Show open crashes since yesterday: `{ status: "new", since: Date.now() - 86_400_000 }`',
  tier: 'read',
  inputSchema: listCrashGroupsSchema,
  handler: async (args, client) => {
    const groups = await client.listCrashGroups(args);
    return {
      count: groups.length,
      groups: groups.map((g) =>
        sanitizeValue(g, { wrap: true, path: 'crashGroup' }),
      ),
    };
  },
});

const getTopCrashesSchema = {
  since: z.number().int().optional(),
  until: z.number().int().optional(),
  limit: z.number().int().min(1).max(50).optional().default(5),
};

const getTopCrashes = defineTool({
  name: 'get_top_crashes',
  description:
    'Return the crash groups with the highest event counts in the requested window. Useful for "what is the biggest crash right now".',
  example: 'Biggest crashes in the last week: `{ since: Date.now() - 7 * 86_400_000, limit: 5 }`',
  tier: 'read',
  inputSchema: getTopCrashesSchema,
  handler: async (args, client) => {
    const groups = await client.listCrashGroups({
      ...(args.since !== undefined ? { since: args.since } : {}),
      ...(args.until !== undefined ? { until: args.until } : {}),
      limit: 500,
    });
    const top = rankCrashesByCount(groups).slice(0, args.limit);
    return {
      count: top.length,
      groups: top.map((g) => sanitizeValue(g, { wrap: true, path: 'crashGroup' })),
    };
  },
});

const getCrashGroupSchema = {
  fingerprint: z
    .string()
    .min(1)
    .describe('Fingerprint of the crash group. Obtain via `list_crash_groups`.'),
};

const getCrashGroup = defineTool({
  name: 'get_crash_group',
  description:
    'Look up a specific crash group by fingerprint. Returns the group record + its five most recent events for context.',
  example:
    '`{ fingerprint: "a1b2c3d4" }` — pass a fingerprint from `list_crash_groups` to see recent instances.',
  tier: 'read',
  inputSchema: getCrashGroupSchema,
  handler: async (args, client) => {
    const [groupMatches, events] = await Promise.all([
      client.listCrashGroups({ limit: 500 }),
      client.listEvents({ fingerprint: args.fingerprint, limit: 5 }),
    ]);
    const group = groupMatches.find((g) => g.fingerprint === args.fingerprint) ?? null;
    return {
      group: group ? sanitizeValue(group, { wrap: true, path: 'crashGroup' }) : null,
      recentEvents: events.map((e) =>
        sanitizeValue(toEventSummary(e), { wrap: true, path: 'event' }),
      ),
    };
  },
});

const listBugReportsSchema = {
  limit: z.number().int().min(1).max(500).optional().default(50),
};

const listBugReports = defineTool({
  name: 'list_bug_reports',
  description:
    'List recently submitted in-app bug reports ordered by submission time. Each report may include a title, description, and attached event ids.',
  example: 'Show the latest 20 bug reports: `{ limit: 20 }`',
  tier: 'read',
  inputSchema: listBugReportsSchema,
  handler: async (args, client) => {
    const reports = await client.listBugReports(args.limit);
    return {
      count: reports.length,
      reports: reports.map((r) => sanitizeValue(r, { wrap: true, path: 'bugReport' })),
    };
  },
});

const listAlertRules = defineTool({
  name: 'list_alert_rules',
  description:
    'Return every configured alert rule. Rules define when a metric threshold triggers a webhook / email / slack message.',
  example: 'Show all rules so we can find the crash-spike alert config.',
  tier: 'read',
  inputSchema: {},
  handler: async (_args, client) => {
    const rules = await client.listAlertRules();
    return {
      count: rules.length,
      rules: rules.map((r) => sanitizeValue(r, { wrap: false, path: 'rule' })),
    };
  },
});

const listAlertHistorySchema = {
  ruleId: z.string().min(1).optional(),
  since: z.number().int().optional(),
  until: z.number().int().optional(),
  limit: z.number().int().min(1).max(500).optional().default(50),
};

const listAlertHistory = defineTool({
  name: 'list_alert_history',
  description:
    'List fired alerts. Optionally filter by ruleId and time window. Use to see when an alert last fired before this incident.',
  example: 'All firings for rule_abc in the last day: `{ ruleId: "rule_abc", since: Date.now() - 86_400_000 }`',
  tier: 'read',
  inputSchema: listAlertHistorySchema,
  handler: async (args, client) => {
    const firings = await client.listAlertHistory(args);
    return {
      count: firings.length,
      firings: firings.map((f) => sanitizeValue(f, { wrap: true, path: 'firing' })),
    };
  },
});

const listSymbolFilesSchema = {
  platform: platformEnum.optional(),
  bundleId: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
};

const listSymbolFiles = defineTool({
  name: 'list_symbol_files',
  description:
    'List uploaded symbol / mapping files available for symbolication, filtered by platform / bundleId / version.',
  example: 'Which iOS 1.4.0 maps do we have? `{ platform: "ios", version: "1.4.0" }`',
  tier: 'read',
  inputSchema: listSymbolFilesSchema,
  handler: async (args, client) => {
    const files = await client.listSymbolFiles(args);
    return {
      count: files.length,
      files: files.map((f) => sanitizeValue(toSymbolFileSummary(f), { wrap: false, path: 'file' })),
    };
  },
});

const resolveSymbolSchema = {
  platform: platformEnum,
  bundleId: z.string().min(1),
  version: z.string().min(1),
  symbol: z
    .string()
    .min(1)
    .optional()
    .describe('Obfuscated symbol to resolve. Either `symbol` or `fileId` is required.'),
  fileId: z
    .string()
    .min(1)
    .optional()
    .describe('Specific symbol file id. Optional — server picks the freshest match otherwise.'),
};

const resolveSymbol = defineTool({
  name: 'resolve_symbol',
  description:
    'Resolve an obfuscated symbol to its original class / method / line using an uploaded mapping file.',
  example:
    '`{ platform: "android", bundleId: "com.acme", version: "1.4.0", symbol: "a.b.c:42" }`',
  tier: 'read',
  inputSchema: resolveSymbolSchema,
  handler: async (args, client) => {
    const resolved = await client.resolveSymbol(args);
    return sanitizeValue(resolved, { wrap: true, path: 'resolve' });
  },
});

const userIdSchema = {
  userId: z.string().min(1).describe('Stable user identifier supplied by the SDK via setUserId().'),
};

const getUserDataSummary = defineTool({
  name: 'get_user_data_summary',
  description:
    'Return a DSAR-friendly summary of every record on file for a user — session and event counts, first/last seen, event-type breakdown.',
  example: '`{ userId: "user_42" }` — use before approving an export or delete.',
  tier: 'read',
  inputSchema: userIdSchema,
  handler: async (args, client) => {
    const summary = await client.getUserDataSummary(args.userId);
    return sanitizeValue(summary, { wrap: false, path: 'summary' });
  },
});

const exportUserData = defineTool({
  name: 'export_user_data',
  description:
    'Return every session + event on file for a user. Large — prefer `get_user_data_summary` for a count first.',
  example: '`{ userId: "user_42" }`',
  tier: 'read',
  inputSchema: userIdSchema,
  handler: async (args, client) => {
    const exported = await client.exportUserData(args.userId);
    return {
      userId: exported.userId,
      exportedAt: exported.exportedAt,
      sessions: exported.sessions.map((s) => sanitizeValue(s, { wrap: false, path: 'session' })),
      eventCount: exported.events.length,
      events: exported.events.map((e) =>
        sanitizeValue(toEventSummary(e), { wrap: true, path: 'event' }),
      ),
    };
  },
});

// ------- write-tier tools (Task 117.82) -------

const acknowledgeCrashGroupSchema = {
  fingerprint: z
    .string()
    .min(1)
    .describe('Fingerprint of the crash group to acknowledge. Obtain via `list_crash_groups`.'),
};

const acknowledgeCrashGroup = defineTool({
  name: 'acknowledge_crash_group',
  description:
    'Mark a crash group as acknowledged (triaged). MUTATES dashboard state — only runs when the operator has granted write permission.',
  example:
    '`{ fingerprint: "a1b2c3d4" }` — acknowledge an open crash so it drops off the "new" board.',
  tier: 'write',
  inputSchema: acknowledgeCrashGroupSchema,
  handler: async (args, client) => {
    const result = await client.setCrashGroupStatus(args.fingerprint, 'acknowledged');
    return {
      fingerprint: args.fingerprint,
      status: 'acknowledged' as const,
      group: sanitizeValue(result.group, { wrap: true, path: 'crashGroup' }),
    };
  },
});

// ------- catalogue -------

/** Order matters — the README + Claude Desktop tool listing follow this sequence. */
export const TOOL_CATALOGUE: ToolDefinition[] = [
  getHealth,
  getReadiness,
  getQueueStats,
  getSettings,
  listEvents,
  searchEvents,
  listSessions,
  listCrashGroups,
  getTopCrashes,
  getCrashGroup,
  listBugReports,
  listAlertRules,
  listAlertHistory,
  listSymbolFiles,
  resolveSymbol,
  getUserDataSummary,
  exportUserData,
  acknowledgeCrashGroup,
];

export const TOOL_COUNT = TOOL_CATALOGUE.length;
