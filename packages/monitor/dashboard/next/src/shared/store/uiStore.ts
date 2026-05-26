import { create } from 'zustand';
import type { Severity } from '../api/types';

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export type ThemePreference = 'dark' | 'light' | 'system';

export interface EventTypeFilter {
  crash: boolean;
  anr: boolean;
  network: boolean;
  custom: boolean;
}

export type TypeFilterKey = keyof EventTypeFilter;

export interface UiFilters {
  type: EventTypeFilter;
  severity: Record<Severity, boolean>;
  sessionId: string | null;
  search: string;
}

export interface UiStoreState {
  selectedSessionId: string | null;
  selectedEventId: string | null;
  selectedCrashFingerprint: string | null;
  filters: UiFilters;
  realtimeStatus: RealtimeStatus;
  realtimeError: string | null;
  theme: ThemePreference;
  setSelectedSession: (id: string | null) => void;
  setSelectedEvent: (id: string | null) => void;
  setSelectedCrashFingerprint: (fp: string | null) => void;
  toggleTypeFilter: (type: TypeFilterKey) => void;
  toggleSeverityFilter: (severity: Severity) => void;
  setSearch: (search: string) => void;
  resetFilters: () => void;
  setRealtimeStatus: (status: RealtimeStatus, error?: string | null) => void;
  setTheme: (theme: ThemePreference) => void;
}

const DEFAULT_TYPE_FILTER: EventTypeFilter = {
  crash: true,
  anr: true,
  network: true,
  custom: true,
};

const DEFAULT_SEVERITY_FILTER: Record<Severity, boolean> = {
  critical: true,
  warning: true,
  info: true,
  success: true,
  muted: true,
};

const DEFAULT_FILTERS: UiFilters = {
  type: { ...DEFAULT_TYPE_FILTER },
  severity: { ...DEFAULT_SEVERITY_FILTER },
  sessionId: null,
  search: '',
};

const THEME_STORAGE_KEY = 'erne-monitor:theme';

function readStoredTheme(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'dark' || raw === 'light' || raw === 'system' ? raw : 'system';
  } catch {
    return 'system';
  }
}

function writeStoredTheme(theme: ThemePreference): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* no-op — storage quota / privacy-mode; theme just stays in memory */
  }
}

/**
 * Client-only UI state. Server state lives in TanStack Query. Anything
 * derivable from event data should go into a selector over this store,
 * not its own slice.
 */
export const useUiStore = create<UiStoreState>((set) => ({
  selectedSessionId: null,
  selectedEventId: null,
  selectedCrashFingerprint: null,
  filters: {
    ...DEFAULT_FILTERS,
    type: { ...DEFAULT_TYPE_FILTER },
    severity: { ...DEFAULT_SEVERITY_FILTER },
  },
  realtimeStatus: 'idle',
  realtimeError: null,
  theme: readStoredTheme(),
  setSelectedSession: (id) => set({ selectedSessionId: id }),
  setSelectedEvent: (id) => set({ selectedEventId: id }),
  setSelectedCrashFingerprint: (fp) => set({ selectedCrashFingerprint: fp }),
  toggleTypeFilter: (type) =>
    set((state) => ({
      filters: {
        ...state.filters,
        type: { ...state.filters.type, [type]: !state.filters.type[type] },
      },
    })),
  toggleSeverityFilter: (severity) =>
    set((state) => ({
      filters: {
        ...state.filters,
        severity: { ...state.filters.severity, [severity]: !state.filters.severity[severity] },
      },
    })),
  setSearch: (search) => set((state) => ({ filters: { ...state.filters, search } })),
  resetFilters: () =>
    set({
      filters: {
        ...DEFAULT_FILTERS,
        type: { ...DEFAULT_TYPE_FILTER },
        severity: { ...DEFAULT_SEVERITY_FILTER },
      },
    }),
  setRealtimeStatus: (realtimeStatus, realtimeError = null) =>
    set({ realtimeStatus, realtimeError }),
  setTheme: (theme) => {
    writeStoredTheme(theme);
    set({ theme });
  },
}));

/**
 * Reset the store back to its initial state. Exposed for tests;
 * also used by the DSAR flow (Task 112) to wipe locally-cached
 * selection state.
 */
export function resetUiStore(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  useUiStore.setState({
    selectedSessionId: null,
    selectedEventId: null,
    selectedCrashFingerprint: null,
    filters: {
      ...DEFAULT_FILTERS,
      type: { ...DEFAULT_TYPE_FILTER },
      severity: { ...DEFAULT_SEVERITY_FILTER },
    },
    realtimeStatus: 'idle',
    realtimeError: null,
    theme: 'system',
  });
}

export const selectActiveTypeFilters = (state: UiStoreState): TypeFilterKey[] =>
  (Object.keys(state.filters.type) as TypeFilterKey[]).filter((k) => state.filters.type[k]);

export const selectActiveSeverityFilters = (state: UiStoreState): Severity[] =>
  (Object.keys(state.filters.severity) as Severity[]).filter((k) => state.filters.severity[k]);
