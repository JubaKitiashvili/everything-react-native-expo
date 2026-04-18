import type { EventListFilter } from '../api/types';

/**
 * Canonical query-key factory. Every hook + the realtime invalidator
 * goes through this module so a stray typo can't silently break cache
 * invalidation.
 *
 * All keys are `as const` arrays so TanStack Query's type inference
 * produces narrow literal types for `predicate` callbacks elsewhere.
 */
export const queryKeys = {
  events: {
    root: () => ['events'] as const,
    list: (filter: EventListFilter = {}) => ['events', 'list', filter] as const,
  },
  sessions: {
    root: () => ['sessions'] as const,
    list: () => ['sessions', 'list'] as const,
  },
  crashGroups: {
    root: () => ['crash-groups'] as const,
    list: () => ['crash-groups', 'list'] as const,
  },
  alertRules: {
    root: () => ['alert-rules'] as const,
    list: () => ['alert-rules', 'list'] as const,
  },
  bugReports: {
    root: () => ['bug-reports'] as const,
    list: () => ['bug-reports', 'list'] as const,
  },
  symbols: {
    root: () => ['symbols'] as const,
    list: () => ['symbols', 'list'] as const,
  },
} as const;

export type EventsQueryKey = ReturnType<typeof queryKeys.events.list>;
export type SessionsQueryKey = ReturnType<typeof queryKeys.sessions.list>;
export type CrashGroupsQueryKey = ReturnType<typeof queryKeys.crashGroups.list>;
export type AlertRulesQueryKey = ReturnType<typeof queryKeys.alertRules.list>;
export type BugReportsQueryKey = ReturnType<typeof queryKeys.bugReports.list>;
export type SymbolsQueryKey = ReturnType<typeof queryKeys.symbols.list>;
