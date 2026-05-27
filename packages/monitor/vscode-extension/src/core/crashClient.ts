/**
 * Pure crash API client. No `vscode` import — `fetch` is injected so the logic
 * is fully unit-testable with a mock.
 */
import { normalizeBaseUrl } from './dashboardUrl';
import type { CrashGroup } from './types';

/** Minimal subset of the WHATWG fetch signature we depend on. */
export type FetchImpl = (
  input: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface FetchCrashGroupsOptions {
  /** Injected fetch implementation (global fetch at runtime, mock in tests). */
  fetchImpl: FetchImpl;
  /** Optional API key — sent as `Authorization: Bearer <key>` when present. */
  apiKey?: string;
}

/**
 * Fetch the crash groups from the dashboard API.
 *
 * GET `<base>/api/crash-groups`
 *
 * - Sends `Authorization: Bearer <apiKey>` when an apiKey is provided.
 * - Returns the parsed groups array on a 2xx response.
 * - Swallows all failure modes (non-ok status, thrown fetch, malformed body)
 *   and returns an empty array — a crash dashboard being down should never
 *   break the editor.
 */
export async function fetchCrashGroups(
  baseUrl: string,
  options: FetchCrashGroupsOptions,
): Promise<CrashGroup[]> {
  const { fetchImpl, apiKey } = options;
  const url = `${normalizeBaseUrl(baseUrl)}/api/crash-groups`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetchImpl(url, { method: 'GET', headers });
    if (!res.ok) {
      return [];
    }
    const body = await res.json();
    return normalizeGroups(body);
  } catch {
    return [];
  }
}

/**
 * Coerce a parsed JSON body into a CrashGroup[]. Accepts either a bare array
 * or `{ groups: [...] }`. Drops anything that isn't a well-formed group.
 */
function normalizeGroups(body: unknown): CrashGroup[] {
  const raw = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.groups)
      ? body.groups
      : [];

  const groups: CrashGroup[] = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }
    const { fingerprint, message, eventCount, status, topScreen } = item;
    if (typeof fingerprint !== 'string' || typeof eventCount !== 'number') {
      continue;
    }
    groups.push({
      fingerprint,
      message: typeof message === 'string' ? message : '',
      eventCount,
      status: typeof status === 'string' ? status : 'open',
      topScreen: typeof topScreen === 'string' ? topScreen : undefined,
    });
  }
  return groups;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
