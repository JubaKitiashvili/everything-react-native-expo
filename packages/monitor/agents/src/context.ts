// Task 117.6 — context bundler.
//
// Builds the structured input the LLM receives. Pulls a crash group +
// its recent events from the dashboard's REST API and rolls them up
// into a flat `FixContext` the prompt template iterates over without
// further IO.
//
// Designing this around a typed record (instead of free-form text)
// means: (a) the prompt template stays deterministic, (b) tests can
// assert on structure, and (c) the LLM gets a predictable shape that
// pairs nicely with prompt caching (Task 117.6 must keep cost down).

import type {
  CrashGroupRecord,
  DashboardClient,
  EventRecord,
} from '@erne/monitor-mcp/client';

/** A single stack frame as we expose it to the LLM. */
export interface ContextFrame {
  /** Original (or symbolicated) symbol — `Class.method` / `myFn`. */
  symbol: string;
  /** Source file when known — `src/Home.tsx`. */
  file?: string;
  /** 1-indexed line in the source file when known. */
  line?: number;
  /** 1-indexed column in the source file when known. */
  column?: number;
  /** Raw frame string from the SDK, kept for the LLM as fallback. */
  raw?: string;
}

export interface ContextBreadcrumb {
  /** ms timestamp relative to crash event (negative = before). */
  offsetMs: number;
  type: string;
  severity: string;
  message?: string;
}

export interface FixContext {
  fingerprint: string;
  message: string;
  /** When the crash group was first seen (ms). */
  firstSeen: number;
  /** When the crash group was last seen (ms). */
  lastSeen: number;
  /** Number of events under this fingerprint. */
  eventCount: number;
  /** Number of distinct sessions affected. */
  sessionCount: number;
  /** Top screen if the dashboard has one rolled up. */
  topScreen?: string;
  /** Most-recent representative event id (used to anchor breadcrumbs). */
  representativeEventId: string;
  /** Symbolicated stack frames from the representative event. */
  stack: ContextFrame[];
  /**
   * Ordered breadcrumb list (events that happened in the same session
   * in the 60s before the crash). Trimmed to a soft cap.
   */
  breadcrumbs: ContextBreadcrumb[];
  /** Platform tag (`ios` / `android` / `web`) when present. */
  platform?: string;
  /** App version (when present). */
  appVersion?: string;
}

export interface BuildContextOptions {
  /** Max breadcrumbs to include in the context. Default 30. */
  maxBreadcrumbs?: number;
  /** Window before the crash event to capture breadcrumbs from. Default 60s. */
  breadcrumbWindowMs?: number;
}

const DEFAULT_MAX_BREADCRUMBS = 30;
const DEFAULT_BREADCRUMB_WINDOW_MS = 60_000;

/**
 * Pull the data the LLM needs to produce a fix.
 *
 * `representativeEventId` is the most recent event under the
 * fingerprint — that's typically the freshest stack from a known-
 * affected build. Breadcrumbs come from the same session, in the
 * minute leading up to the crash.
 */
export async function buildFixContext(
  client: DashboardClient,
  fingerprint: string,
  options: BuildContextOptions = {},
): Promise<FixContext | null> {
  const maxBreadcrumbs = options.maxBreadcrumbs ?? DEFAULT_MAX_BREADCRUMBS;
  const windowMs = options.breadcrumbWindowMs ?? DEFAULT_BREADCRUMB_WINDOW_MS;

  // 1. Find the crash group. We list a page and filter; if the
  // dashboard later adds a single-fingerprint endpoint we'll switch.
  const groups = await client.listCrashGroups({ limit: 500 });
  const group = groups.find((g) => g.fingerprint === fingerprint) ?? null;
  if (!group) return null;

  // 2. Fetch events under the fingerprint, newest first.
  const events = await client.listEvents({ fingerprint, limit: 5 });
  const representative = events[0];
  if (!representative) return null;

  // 3. Pull breadcrumbs from the same session in the lead-up window.
  const breadcrumbEvents = await client.listEvents({
    sessionId: representative.sessionId,
    since: representative.timestamp - windowMs,
    until: representative.timestamp,
    limit: maxBreadcrumbs + 1,
  });

  // 4. Symbolicate any frame that has line/column but no source file.
  // Hermes / Metro emits raw bundle coordinates in some configurations;
  // shipping those to Claude as `(line, column)` is useless without
  // the file path. The dashboard's resolve API does the heavy lifting
  // (Task 117.3). Best-effort: we never block the context build on a
  // resolve failure.
  const stack = await resolveStackBestEffort(
    client,
    extractStack(representative),
    representative,
  );

  return {
    fingerprint: group.fingerprint,
    message: extractMessage(group, representative),
    firstSeen: group.firstSeen,
    lastSeen: group.lastSeen,
    eventCount: group.eventCount,
    sessionCount: group.sessionCount,
    ...(group.topScreen ? { topScreen: group.topScreen } : {}),
    representativeEventId: representative.id,
    stack,
    breadcrumbs: extractBreadcrumbs(representative, breadcrumbEvents, maxBreadcrumbs),
    ...(representative.platform ? { platform: representative.platform } : {}),
    ...(extractAppVersion(representative)
      ? { appVersion: extractAppVersion(representative) as string }
      : {}),
  };
}

/**
 * For each frame that looks unresolved (has line/column but no file,
 * or file equals the bundle name), call the dashboard's resolve API.
 * Failures are absorbed silently — context is still useful with raw
 * frames, and we don't want a missing symbol map to block fix
 * generation entirely.
 *
 * Resolution requires a `platform`, `bundleId`, and `version`. We
 * pull the platform off the event and the version off the payload's
 * `appVersion`. `bundleId` is harder — most SDKs surface it as
 * `payload.bundleId`; if absent, we skip the resolve call.
 */
async function resolveStackBestEffort(
  client: DashboardClient,
  frames: ContextFrame[],
  event: EventRecord,
): Promise<ContextFrame[]> {
  const platform = event.platform;
  const appVersion = extractAppVersion(event);
  const bundleId =
    typeof (event.payload as { bundleId?: unknown }).bundleId === 'string'
      ? ((event.payload as { bundleId: string }).bundleId)
      : undefined;
  if (
    (platform !== 'ios' && platform !== 'android') ||
    !appVersion ||
    !bundleId
  ) {
    return frames;
  }
  const out: ContextFrame[] = [];
  for (const f of frames) {
    if (
      f.line !== undefined &&
      (!f.file || isBundleArtefact(f.file))
    ) {
      try {
        const resolved = await client.resolveSymbol({
          platform: platform as 'ios' | 'android',
          bundleId,
          version: appVersion,
          symbol: f.symbol,
          ...(f.line !== undefined ? { line: f.line } : {}),
          ...(f.column !== undefined ? { column: f.column } : {}),
        } as unknown as Parameters<DashboardClient['resolveSymbol']>[0]);
        if (resolved.frame && resolved.frame.method) {
          out.push({
            symbol: resolved.frame.method ?? f.symbol,
            ...(typeof resolved.frame.line === 'number'
              ? { line: resolved.frame.line }
              : {}),
            ...(f.column !== undefined ? { column: f.column } : {}),
            // ResolvedSymbolResult doesn't carry a file path on the
            // frame — the symbol string carries it (`render
            // (src/Home.tsx:1:1)`). Fall back to the original raw.
            ...(f.raw ? { raw: f.raw } : {}),
          });
          continue;
        }
      } catch {
        // Best-effort — fall through to the original frame.
      }
    }
    out.push(f);
  }
  return out;
}

/** Heuristic — bundle paths look like `index.bundle`, `main.jsbundle`,
 *  `index.android.bundle`, or end in `.hbc`. None of these are useful
 *  to a code reviewer, so we treat them as "missing source". */
function isBundleArtefact(path: string): boolean {
  return /(\.bundle|\.jsbundle|\.hbc)$/.test(path);
}

function extractMessage(group: CrashGroupRecord, event: EventRecord): string {
  // Prefer the freshest message off the representative event payload —
  // the rolled-up group message can be stale relative to a regression.
  const fromEvent = (event.payload as { message?: unknown }).message;
  if (typeof fromEvent === 'string' && fromEvent.length > 0) return fromEvent;
  return group.message;
}

function extractAppVersion(event: EventRecord): string | undefined {
  const v = (event.payload as { appVersion?: unknown }).appVersion;
  return typeof v === 'string' ? v : undefined;
}

function extractStack(event: EventRecord): ContextFrame[] {
  const payload = event.payload as { stack?: unknown; frames?: unknown };
  // Stacks come in a few shapes — string blob, array of strings,
  // or an array of `{symbol, file, line, column}` records. Normalise
  // all three.
  if (Array.isArray(payload.frames)) {
    return payload.frames.flatMap((raw) => normaliseFrame(raw));
  }
  if (Array.isArray(payload.stack)) {
    return payload.stack.flatMap((raw) => normaliseFrame(raw));
  }
  if (typeof payload.stack === 'string') {
    return payload.stack
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseStringFrame(line));
  }
  return [];
}

function normaliseFrame(raw: unknown): ContextFrame[] {
  if (typeof raw === 'string') return [parseStringFrame(raw)];
  if (raw && typeof raw === 'object') {
    const r = raw as {
      symbol?: unknown;
      function?: unknown;
      file?: unknown;
      line?: unknown;
      column?: unknown;
      raw?: unknown;
    };
    const symbol =
      typeof r.symbol === 'string'
        ? r.symbol
        : typeof r.function === 'string'
          ? r.function
          : '<unknown>';
    const out: ContextFrame = { symbol };
    if (typeof r.file === 'string') out.file = r.file;
    if (typeof r.line === 'number') out.line = r.line;
    if (typeof r.column === 'number') out.column = r.column;
    if (typeof r.raw === 'string') out.raw = r.raw;
    return [out];
  }
  return [];
}

/**
 * Parse a stringy frame like:
 *
 *   "at HomeScreen.render (src/Home.tsx:42:7)"
 *   "    at MyComponent (Foo.tsx:12)"
 *   "anon@http://localhost/index.bundle:1:5"
 *
 * — returning whatever fields we can confidently extract. Falls back
 * to the entire string as `symbol` when the pattern doesn't match.
 */
const FRAME_PATTERN =
  /^\s*(?:at\s+)?(?<symbol>[^\s(@]+)?\s*[(@]?(?<file>[^):\s]+):(?<line>\d+)(?::(?<column>\d+))?\)?\s*$/;

function parseStringFrame(raw: string): ContextFrame {
  const match = FRAME_PATTERN.exec(raw);
  if (!match?.groups) return { symbol: raw, raw };
  const out: ContextFrame = {
    symbol: match.groups.symbol ?? '<anonymous>',
    raw,
  };
  if (match.groups.file) out.file = match.groups.file;
  if (match.groups.line) out.line = Number(match.groups.line);
  if (match.groups.column) out.column = Number(match.groups.column);
  return out;
}

function extractBreadcrumbs(
  representative: EventRecord,
  events: EventRecord[],
  cap: number,
): ContextBreadcrumb[] {
  // Skip the representative crash itself and entries that aren't on
  // the timeline — anything strictly after the crash is irrelevant.
  const out: ContextBreadcrumb[] = [];
  for (const e of events) {
    if (e.id === representative.id) continue;
    if (e.timestamp > representative.timestamp) continue;
    out.push({
      offsetMs: e.timestamp - representative.timestamp,
      type: e.type,
      severity: String(e.severity),
      ...(extractEventMessage(e) ? { message: extractEventMessage(e) as string } : {}),
    });
    if (out.length >= cap) break;
  }
  return out;
}

function extractEventMessage(e: EventRecord): string | undefined {
  const m = (e.payload as { message?: unknown }).message;
  return typeof m === 'string' ? m : undefined;
}
