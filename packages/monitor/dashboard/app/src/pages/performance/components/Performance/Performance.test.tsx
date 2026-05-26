import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EventRecord } from '@/shared/api/types';
import { Performance } from './Performance';

function ev(type: string, timestamp: number, payload: Record<string, unknown>): EventRecord {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    type,
    severity: 'info',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 10,
    payload,
  };
}

describe('Performance panel', () => {
  test('renders empty states for every sub-chart when no performance events exist', () => {
    render(<Performance events={[]} />);
    expect(screen.getByText(/not enough FPS samples/i)).toBeInTheDocument();
    expect(screen.getByText(/no CPU\/memory samples/i)).toBeInTheDocument();
    expect(screen.getByText(/no Fabric commits recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/no startup traces captured/i)).toBeInTheDocument();
  });

  test('renders populated charts when the event stream covers every perf type', () => {
    const events: EventRecord[] = [
      ev('dual_thread_fps', 1, { jsThread: 60, uiThread: 60 }),
      ev('dual_thread_fps', 2, { jsThread: 55, uiThread: 58 }),
      ev('native_metrics', 3, {
        cpuUsagePercent: 18,
        memoryUsedBytes: 300 * 1024 * 1024,
      }),
      ev('native_metrics', 4, {
        cpuUsagePercent: 22,
        memoryUsedBytes: 320 * 1024 * 1024,
      }),
      ev('fabric_commit', 5, { durationMs: 6 }),
      ev('fabric_commit', 6, { durationMs: 24 }),
      ev('startup', 7, {
        kind: 'cold',
        totalMs: 900,
        phases: [
          { label: 'native', startMs: 0, durationMs: 200 },
          { label: 'js', startMs: 200, durationMs: 700 },
        ],
      }),
    ];

    render(<Performance events={events} />);
    expect(screen.getByRole('img', { name: /dual-thread fps chart/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /memory and CPU chart/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/commit latency bars/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/startup phase chart/i)).toBeInTheDocument();
    expect(screen.getByText(/2 commits in window/i)).toBeInTheDocument();
    expect(screen.getByText('Cold start')).toBeInTheDocument();
    expect(screen.getByText('900 ms')).toBeInTheDocument();
  });
});
