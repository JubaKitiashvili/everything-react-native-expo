import type { CrashGroupRecord, SessionRecord } from '@/shared/api/types';

/** A single selectable command-palette result. */
export interface SearchResult {
  /** Stable unique key (also used for the DOM id). */
  id: string;
  type: 'nav' | 'crash' | 'session' | 'user';
  label: string;
  sublabel?: string;
  /** Route to navigate to on select. */
  to: string;
}

/** A labelled group of results, in display order. */
export interface SearchGroup {
  type: SearchResult['type'];
  heading: string;
  results: SearchResult[];
}

/** Per-group result cap so the palette stays scannable. */
const GROUP_CAP = 6;

/** Static navigation destinations — always searchable, even with no data. */
export const NAV_ITEMS: ReadonlyArray<{ label: string; to: string; keywords?: string }> = [
  { label: 'Overview', to: '/', keywords: 'home dashboard' },
  { label: 'Crashes', to: '/crashes' },
  { label: 'ANRs', to: '/anrs', keywords: 'anr frozen not responding' },
  { label: 'Performance', to: '/performance', keywords: 'traces flamegraph latency rsc' },
  { label: 'Sessions', to: '/sessions', keywords: 'replay' },
  { label: 'Quality', to: '/quality', keywords: 'alerts bug reports frustration' },
  { label: 'Settings', to: '/settings', keywords: 'config users access keys privacy' },
];

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function matches(haystack: string, q: string): boolean {
  return haystack.toLowerCase().includes(q);
}

export interface SearchData {
  crashGroups: CrashGroupRecord[];
  sessions: SessionRecord[];
}

/**
 * Build the grouped command-palette results for a query. Pure + synchronous so
 * it is trivially unit-testable. With an empty query it returns just the nav
 * destinations (quick navigation); a non-empty query also searches crash
 * groups, sessions, and the distinct users seen across sessions.
 */
export function buildResults(query: string, data: SearchData): SearchGroup[] {
  const q = norm(query);
  const groups: SearchGroup[] = [];

  // Navigation — always present; filtered by label/keywords when a query is set.
  const nav = NAV_ITEMS.filter(
    (item) => q.length === 0 || matches(item.label, q) || matches(item.keywords ?? '', q),
  ).map<SearchResult>((item) => ({
    id: `nav:${item.to}`,
    type: 'nav',
    label: item.label,
    sublabel: item.to,
    to: item.to,
  }));
  if (nav.length > 0) groups.push({ type: 'nav', heading: 'Go to', results: nav });

  // Data groups only when there's something to match against.
  if (q.length === 0) return groups;

  const crashes = data.crashGroups
    .filter((g) => matches(g.message, q) || matches(g.fingerprint, q))
    .slice(0, GROUP_CAP)
    .map<SearchResult>((g) => ({
      id: `crash:${g.fingerprint}`,
      type: 'crash',
      label: g.message || g.fingerprint,
      sublabel: `${g.status} · ${g.eventCount} events`,
      to: `/crashes/${encodeURIComponent(g.fingerprint)}`,
    }));
  if (crashes.length > 0) groups.push({ type: 'crash', heading: 'Crashes', results: crashes });

  const sessions = data.sessions
    .filter(
      (s) =>
        matches(s.id, q) ||
        matches(s.platform ?? '', q) ||
        matches(s.appVersion ?? '', q) ||
        matches(s.userId ?? '', q),
    )
    .slice(0, GROUP_CAP)
    .map<SearchResult>((s) => ({
      id: `session:${s.id}`,
      type: 'session',
      label: s.id,
      sublabel: [s.platform, s.appVersion].filter(Boolean).join(' · ') || undefined,
      to: `/sessions/${encodeURIComponent(s.id)}`,
    }));
  if (sessions.length > 0)
    groups.push({ type: 'session', heading: 'Sessions', results: sessions });

  // Distinct users seen across sessions.
  const seen = new Set<string>();
  const users: SearchResult[] = [];
  for (const s of data.sessions) {
    const userId = s.userId;
    if (!userId || seen.has(userId) || !matches(userId, q)) continue;
    seen.add(userId);
    users.push({
      id: `user:${userId}`,
      type: 'user',
      label: userId,
      sublabel: 'User',
      to: `/users/${encodeURIComponent(userId)}`,
    });
    if (users.length >= GROUP_CAP) break;
  }
  if (users.length > 0) groups.push({ type: 'user', heading: 'Users', results: users });

  return groups;
}

/** Flatten grouped results into the linear order used for keyboard navigation. */
export function flattenResults(groups: SearchGroup[]): SearchResult[] {
  return groups.flatMap((g) => g.results);
}
