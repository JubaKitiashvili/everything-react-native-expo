import { beforeEach, describe, expect, test } from 'vitest';
import {
  resetUiStore,
  selectActiveSeverityFilters,
  selectActiveTypeFilters,
  useUiStore,
} from './uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    resetUiStore();
  });

  test('starts with everything selected and no realtime error', () => {
    const state = useUiStore.getState();
    expect(state.realtimeStatus).toBe('idle');
    expect(state.selectedSessionId).toBeNull();
    expect(selectActiveTypeFilters(state).sort()).toEqual(['anr', 'crash', 'custom', 'network']);
    expect(selectActiveSeverityFilters(state)).toHaveLength(5);
  });

  test('toggleTypeFilter flips just that one key, leaves others intact', () => {
    useUiStore.getState().toggleTypeFilter('crash');
    const after = useUiStore.getState();
    expect(after.filters.type.crash).toBe(false);
    expect(after.filters.type.anr).toBe(true);
    expect(selectActiveTypeFilters(after).sort()).toEqual(['anr', 'custom', 'network']);
  });

  test('toggleSeverityFilter flips just that severity', () => {
    useUiStore.getState().toggleSeverityFilter('critical');
    expect(useUiStore.getState().filters.severity.critical).toBe(false);
    expect(selectActiveSeverityFilters(useUiStore.getState())).not.toContain('critical');
  });

  test('setSearch and resetFilters round-trip cleanly', () => {
    useUiStore.getState().setSearch('TypeError');
    useUiStore.getState().toggleTypeFilter('custom');
    useUiStore.getState().resetFilters();
    const state = useUiStore.getState();
    expect(state.filters.search).toBe('');
    expect(state.filters.type.custom).toBe(true);
  });

  test('setRealtimeStatus records status + optional error', () => {
    useUiStore.getState().setRealtimeStatus('error', 'socket closed');
    const state = useUiStore.getState();
    expect(state.realtimeStatus).toBe('error');
    expect(state.realtimeError).toBe('socket closed');
    useUiStore.getState().setRealtimeStatus('open');
    expect(useUiStore.getState().realtimeError).toBeNull();
  });

  test('selecting a session / event / crash fingerprint updates the store independently', () => {
    useUiStore.getState().setSelectedSession('session-a');
    useUiStore.getState().setSelectedEvent('evt-1');
    useUiStore.getState().setSelectedCrashFingerprint('fp-1');
    const state = useUiStore.getState();
    expect(state.selectedSessionId).toBe('session-a');
    expect(state.selectedEventId).toBe('evt-1');
    expect(state.selectedCrashFingerprint).toBe('fp-1');
  });

  test('setTheme flips the store value and persists it to localStorage so reloads stick', () => {
    expect(useUiStore.getState().theme).toBe('system');
    useUiStore.getState().setTheme('dark');
    expect(useUiStore.getState().theme).toBe('dark');
    expect(localStorage.getItem('erne-monitor:theme')).toBe('dark');

    useUiStore.getState().setTheme('light');
    expect(localStorage.getItem('erne-monitor:theme')).toBe('light');
  });
});
