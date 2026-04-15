import { BugReporter } from './BugReporter';
import type { BugReporterDeps, BugReport } from './BugReporter';
import { SignalBus } from '../core/SignalBus';
import { SessionManager } from '../core/SessionManager';
import type { MonitorEvent } from '../types';
import type { Breadcrumb } from '../collectors/BreadcrumbCollector';

// ── helpers ──

function makeBreadcrumbs(count: number): Breadcrumb[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'navigation',
    category: 'navigation' as const,
    message: `screen-${i}`,
    timestamp: 1000 + i * 100,
  }));
}

function makeReporter(overrides?: Partial<BugReporterDeps>): {
  reporter: BugReporter;
  events: MonitorEvent[];
  submitted: BugReport[];
  shakeHandler: (() => void) | null;
} {
  const bus = new SignalBus();
  const session = new SessionManager({ random: () => 0.5 });
  const submitted: BugReport[] = [];
  let shakeHandler: (() => void) | null = null;
  let idCounter = 0;

  const reporter = new BugReporter({
    signalBus: bus,
    sessionManager: session,
    getBreadcrumbs: () => makeBreadcrumbs(3),
    getReplayFrames: () => [
      { frameBase64: 'frame-1', timestamp: 1000 },
      { frameBase64: 'frame-2', timestamp: 2000 },
    ],
    getScreenshot: () => 'screenshot-base64',
    captureLayoutSnapshot: async () => ({ type: 'View', children: [] }),
    getDeviceInfo: () => ({
      platform: 'ios' as const,
      osVersion: '17.0',
      model: 'iPhone 15',
      isEmulator: false,
      screenWidth: 375,
      screenHeight: 812,
      locale: 'en-US',
    }),
    submitReport: async (report) => {
      submitted.push(report);
    },
    onShakeDetected: (handler) => {
      shakeHandler = handler;
      return {
        remove() {
          shakeHandler = null;
        },
      };
    },
    generateId: () => `bug-${++idCounter}`,
    now: () => Date.now(),
    ...overrides,
  });

  const events: MonitorEvent[] = [];
  bus.onAll((e) => events.push(e));

  return { reporter, events, submitted, shakeHandler: shakeHandler! };
}

// ── tests ──

describe('BugReporter', () => {
  test('creates a bug report with all data', async () => {
    const { reporter, submitted } = makeReporter();
    reporter.start();

    const report = await reporter.createReport('programmatic', 'Something is wrong');

    expect(report).not.toBeNull();
    expect(report!.id).toBe('bug-1');
    expect(report!.trigger).toBe('programmatic');
    expect(report!.screenshot).toBe('screenshot-base64');
    expect(report!.breadcrumbs).toHaveLength(3);
    expect(report!.replayFrames).toHaveLength(2);
    expect(report!.layoutSnapshot).toEqual({ type: 'View', children: [] });
    expect(report!.deviceInfo?.model).toBe('iPhone 15');
    expect(report!.userDescription).toBe('Something is wrong');
    expect(submitted).toHaveLength(1);
  });

  test('emits bug_report event to SignalBus', async () => {
    const { reporter, events } = makeReporter();
    reporter.start();

    await reporter.createReport();

    expect(events).toHaveLength(1);
    expect(events[0]!.data).toMatchObject({
      name: 'bug_report',
      reportId: 'bug-1',
      trigger: 'programmatic',
      hasScreenshot: true,
      hasReplay: true,
      hasLayout: true,
    });
  });

  test('rate limits reports', async () => {
    let time = 1000;
    const { reporter } = makeReporter({
      now: () => time,
      rateLimitMs: 60_000,
    });
    reporter.start();

    const first = await reporter.createReport();
    expect(first).not.toBeNull();

    // Second report within rate limit window
    time += 10_000; // only 10s later
    const second = await reporter.createReport();
    expect(second).toBeNull();

    // Third report after rate limit window
    time += 60_000;
    const third = await reporter.createReport();
    expect(third).not.toBeNull();
  });

  test('responds to shake trigger', async () => {
    let shakeHandler: (() => void) | null = null;
    const { reporter, submitted } = makeReporter({
      onShakeDetected: (handler) => {
        shakeHandler = handler;
        return {
          remove() {
            shakeHandler = null;
          },
        };
      },
    });
    reporter.start();

    expect(shakeHandler).not.toBeNull();
    shakeHandler!();

    // Wait for async report creation
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(submitted.length).toBeGreaterThanOrEqual(1);
    expect(submitted[0]!.trigger).toBe('shake');
  });

  test('returns null when not running', async () => {
    const { reporter } = makeReporter();
    // Not started
    const report = await reporter.createReport();
    expect(report).toBeNull();
  });

  test('respects trigger configuration', async () => {
    const { reporter } = makeReporter({
      triggers: ['programmatic'], // shake not allowed
    });
    reporter.start();

    const shakeReport = await reporter.createReport('shake');
    expect(shakeReport).toBeNull();

    const progReport = await reporter.createReport('programmatic');
    expect(progReport).not.toBeNull();
  });

  test('handles missing optional providers gracefully', async () => {
    const bus = new SignalBus();
    const session = new SessionManager({ random: () => 0.5 });
    let idCounter = 0;
    const reporter = new BugReporter({
      signalBus: bus,
      sessionManager: session,
      getBreadcrumbs: () => [],
      // No optional providers
      generateId: () => `bug-${++idCounter}`,
      now: () => Date.now(),
    });
    reporter.start();

    const report = await reporter.createReport();
    expect(report).not.toBeNull();
    expect(report!.screenshot).toBeNull();
    expect(report!.replayFrames).toHaveLength(0);
    expect(report!.layoutSnapshot).toBeNull();
    expect(report!.deviceInfo).toBeNull();
  });

  test('handles layout capture failure gracefully', async () => {
    const { reporter } = makeReporter({
      captureLayoutSnapshot: async () => {
        throw new Error('native module crash');
      },
    });
    reporter.start();

    const report = await reporter.createReport();
    expect(report).not.toBeNull();
    expect(report!.layoutSnapshot).toBeNull();
  });

  test('handles submit failure gracefully', async () => {
    const { reporter } = makeReporter({
      submitReport: async () => {
        throw new Error('network error');
      },
    });
    reporter.start();

    // Should not throw
    const report = await reporter.createReport();
    expect(report).not.toBeNull();
  });

  test('stop removes shake subscription', () => {
    let shakeHandler: (() => void) | null = null;
    const { reporter } = makeReporter({
      onShakeDetected: (handler) => {
        shakeHandler = handler;
        return {
          remove() {
            shakeHandler = null;
          },
        };
      },
    });
    reporter.start();
    expect(shakeHandler).not.toBeNull();

    reporter.stop();
    expect(shakeHandler).toBeNull();
    expect(reporter.isRunning()).toBe(false);
  });

  test('dispose clears reports', async () => {
    const { reporter } = makeReporter();
    reporter.start();
    await reporter.createReport();
    expect(reporter.getReports()).toHaveLength(1);

    reporter.dispose();
    expect(reporter.getReports()).toHaveLength(0);
    expect(reporter.isRunning()).toBe(false);
  });

  test('getReports returns all reports', async () => {
    let time = 1000;
    const { reporter } = makeReporter({
      now: () => time,
      rateLimitMs: 100,
    });
    reporter.start();

    await reporter.createReport();
    time += 200;
    await reporter.createReport();
    time += 200;
    await reporter.createReport();

    expect(reporter.getReports()).toHaveLength(3);
  });
});
