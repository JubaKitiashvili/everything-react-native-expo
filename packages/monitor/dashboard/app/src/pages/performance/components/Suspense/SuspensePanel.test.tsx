import { describe, expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { EventRecord } from '@/shared/api/types';
import type { SuspenseEventPayload } from './aggregate';
import { SuspensePanel } from './SuspensePanel';

let seq = 0;

function suspense(payload: SuspenseEventPayload): EventRecord {
  seq += 1;
  return {
    id: `suspense-${seq}`,
    type: 'suspense',
    severity: 'info',
    sessionId: 's1',
    timestamp: 1_770_000_000_000 + seq,
    receivedAt: 1_770_000_000_000 + seq,
    payload: payload as unknown as Record<string, unknown>,
  };
}

describe('SuspensePanel', () => {
  test('renders the panel heading', () => {
    render(<SuspensePanel events={[]} />);
    expect(screen.getByRole('heading', { name: /suspense stalls/i })).toBeInTheDocument();
  });

  test('renders the empty state when there are no suspense events', () => {
    render(<SuspensePanel events={[]} />);
    expect(screen.getByText(/no suspense stalls captured/i)).toBeInTheDocument();
  });

  test('renders a row per boundary with its name and timing', () => {
    render(
      <SuspensePanel
        events={[
          suspense({ boundaryName: 'Feed', fallbackDurationMs: 800, depth: 2, outcome: 'resolved' }),
          suspense({ boundaryName: 'Feed', fallbackDurationMs: 1200, depth: 2, outcome: 'resolved' }),
        ]}
      />,
    );

    const table = screen.getByRole('table', { name: /suspense stalls/i });
    const row = within(table).getByRole('rowheader', { name: 'Feed' }).closest('tr');
    expect(row).not.toBeNull();
    // Fast (sub-3s) resolved stalls → OK status pill.
    expect(within(row as HTMLElement).getByText('OK')).toBeInTheDocument();
    // Longest stall is the 1200ms one.
    expect(within(row as HTMLElement).getByText('1200 ms')).toBeInTheDocument();
  });

  test('shows a Slow status pill for boundaries above the p95 threshold', () => {
    render(
      <SuspensePanel
        events={[suspense({ boundaryName: 'SlowOne', fallbackDurationMs: 12_000, outcome: 'resolved' })]}
      />,
    );
    const row = screen.getByRole('rowheader', { name: 'SlowOne' }).closest('tr');
    expect(within(row as HTMLElement).getByText('Slow')).toBeInTheDocument();
    // Durations of 10s or longer render in seconds.
    expect(within(row as HTMLElement).getAllByText('12.0 s').length).toBeGreaterThan(0);
  });

  test('shows an error status pill with a count for errored boundaries', () => {
    render(
      <SuspensePanel
        events={[
          suspense({
            boundaryName: 'Broken',
            fallbackDurationMs: 300,
            outcome: 'error',
            errorMessage: 'fetch failed',
          }),
          suspense({
            boundaryName: 'Broken',
            fallbackDurationMs: 300,
            outcome: 'error',
            errorMessage: 'fetch failed',
          }),
        ]}
      />,
    );
    const row = screen.getByRole('rowheader', { name: 'Broken' }).closest('tr');
    expect(within(row as HTMLElement).getByText(/errored 2/i)).toBeInTheDocument();
  });

  test('summarises the boundary and stall counts in the header action', () => {
    render(
      <SuspensePanel
        events={[
          suspense({ boundaryName: 'A', fallbackDurationMs: 100, outcome: 'resolved' }),
          suspense({ boundaryName: 'B', fallbackDurationMs: 200, outcome: 'resolved' }),
        ]}
      />,
    );
    expect(screen.getByText(/2 boundaries · 2 stalls/i)).toBeInTheDocument();
  });
});
