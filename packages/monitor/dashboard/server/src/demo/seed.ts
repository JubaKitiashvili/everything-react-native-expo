/**
 * Inserts a small, self-contained demo dataset into the dashboard store so
 * the Onboarding panel's "Generate sample events" button gives new users a
 * fully populated dashboard in one click. Deterministic given a fixed
 * `now` timestamp so tests can snapshot counts.
 */

import type { DashboardStore } from '../storage/sqliteStore.js';

export interface SeedCounts {
  sessions: number;
  events: number;
  crashGroups: number;
  bugReports: number;
  alertRules: number;
  symbolFiles: number;
}

export function seedDemoData(store: DashboardStore, now: number): SeedCounts {
  const userId = 'demo-user';
  const sessions = [
    {
      id: 'demo-sess-ios',
      userId,
      startedAt: now - 120_000,
      endedAt: now - 30_000,
      platform: 'ios',
      device: { model: 'iPhone 16 Pro', systemVersion: '18.4' },
      appVersion: '1.0.0',
      runtimeVersion: '55.0.0',
      channel: 'production',
      eventCount: 6,
      crashCount: 1,
    },
    {
      id: 'demo-sess-android',
      userId,
      startedAt: now - 90_000,
      endedAt: now - 15_000,
      platform: 'android',
      device: { model: 'Pixel 9', osVersion: '15' },
      appVersion: '1.0.0',
      channel: 'production',
      eventCount: 3,
      crashCount: 0,
    },
  ];
  for (const session of sessions) store.upsertSession(session);

  const events = [
    {
      id: 'demo-crash-1',
      type: 'crash',
      severity: 'critical' as const,
      sessionId: 'demo-sess-ios',
      fingerprint: 'demo-fp',
      timestamp: now - 60_000,
      receivedAt: now - 60_000,
      screen: 'HomeScreen',
      platform: 'ios',
      payload: {
        message: 'Sample crash: TypeError: undefined is not an object',
        stack:
          'TypeError: undefined is not an object\n' +
          '    at HomeScreen.render (HomeScreen.tsx:24)\n',
        screen: 'HomeScreen',
      },
      userId,
    },
    {
      id: 'demo-nav-1',
      type: 'breadcrumb',
      severity: 'info' as const,
      sessionId: 'demo-sess-ios',
      timestamp: now - 100_000,
      receivedAt: now - 100_000,
      payload: { category: 'nav', message: 'Navigated to /home' },
      userId,
    },
    {
      id: 'demo-net-1',
      type: 'network',
      severity: 'warning' as const,
      sessionId: 'demo-sess-ios',
      timestamp: now - 55_000,
      receivedAt: now - 55_000,
      payload: {
        url: 'https://api.example.com/items',
        method: 'GET',
        status: 200,
        durationMs: 1_240,
      },
      userId,
    },
  ];
  for (const event of events) store.insertEvent(event);

  store.upsertCrashGroup({
    fingerprint: 'demo-fp',
    message: 'Sample crash: TypeError: undefined is not an object',
    firstSeen: now - 60_000,
    lastSeen: now - 60_000,
    eventCount: 1,
    sessionCount: 1,
    status: 'new',
    topScreen: 'HomeScreen',
  });

  store.insertBugReport({
    id: 'demo-bug-1',
    sessionId: 'demo-sess-ios',
    submittedAt: now - 45_000,
    title: 'Sample shake report',
    description: 'User shook the phone to submit a sample bug.',
    status: 'new',
    attachments: {
      breadcrumbs: [
        { category: 'nav', message: 'Navigated to /home', timestamp: now - 100_000 },
      ],
      device: { model: 'iPhone 16 Pro' },
    },
    eventIds: ['demo-nav-1'],
  });

  store.saveAlertRule({
    id: 'demo-rule',
    name: 'Demo: crash spike',
    metric: 'crash_count',
    threshold: 5,
    windowSeconds: 300,
    channels: ['slack'],
    cooldownSeconds: 300,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });

  return {
    sessions: sessions.length,
    events: events.length,
    crashGroups: 1,
    bugReports: 1,
    alertRules: 1,
    symbolFiles: 0,
  };
}
