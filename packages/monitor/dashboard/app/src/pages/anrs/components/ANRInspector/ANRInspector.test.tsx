import { describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { EventRecord } from '@/shared/api/types';
import { ANRInspector } from './ANRInspector';

function anr(
  id: string,
  timestamp: number,
  durationMs: number,
  screen: string | null,
  stack = 'Error\n    at MainThread (App.tsx:1:1)',
): EventRecord {
  return {
    id,
    type: 'anr',
    severity: 'warning',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 10,
    payload: { durationMs, stack },
    ...(screen !== null ? { screen } : {}),
  };
}

const NOW = 1_770_000_000_000;

describe('ANRInspector panel', () => {
  test('shows empty states everywhere when no ANR events exist', () => {
    render(<ANRInspector events={[]} now={NOW} />);
    expect(screen.getByText(/no ANRs in window/i)).toBeInTheDocument();
    expect(screen.getByText(/no ANRs to chart/i)).toBeInTheDocument();
    expect(screen.getByText(/no offender screens yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no ANRs to show/i)).toBeInTheDocument();
  });

  test('renders populated charts, top offenders, and the worst-ANR banner', () => {
    const events = [
      anr('a', NOW - 60_000, 4_800, 'Home'),
      anr('b', NOW - 45_000, 6_500, 'Home'),
      anr('c', NOW - 30_000, 15_000, 'Settings'),
      anr('d', NOW - 15_000, 25_000, null),
    ];
    render(<ANRInspector events={events} now={NOW} />);

    // Total ANR count appears in the histogram footer.
    expect(screen.getByText(/4 total/i)).toBeInTheDocument();

    // Histogram + timeline + offenders + stack list all render.
    expect(screen.getByLabelText(/ANR duration buckets/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ANR recurrence timeline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/offender screens list/i)).toBeInTheDocument();

    // Home beat Settings on count, then unknown-screen fallback.
    const offenderList = screen.getByLabelText(/offender screens list/i);
    expect(offenderList).toHaveTextContent('Home');
    expect(offenderList).toHaveTextContent('Settings');
    expect(offenderList).toHaveTextContent('<unknown screen>');

    // Worst-recent banner highlights the 25-second ANR.
    const banner = screen.getByRole('note', { name: /worst recent ANR/i });
    expect(banner).toHaveTextContent('25 s');
  });

  test('clicking a list row opens the detail view; back returns to overview', () => {
    const events = [
      anr('a', NOW - 60_000, 4_800, 'Home'),
      anr('b', NOW - 30_000, 15_000, 'Settings', 'Error\n    at hot (Hot.tsx:1:1)'),
    ];
    render(<ANRInspector events={events} now={NOW} />);

    // Overview shows the list.
    const listRow = screen.getByLabelText(/Open ANR from Settings, 15 s/);
    fireEvent.click(listRow);

    // Detail view is rendered.
    expect(screen.getByLabelText(/^ANR detail$/)).toBeInTheDocument();
    expect(screen.getByText(/Stack at ANR time/i)).toBeInTheDocument();

    // Back button returns to overview.
    fireEvent.click(screen.getByLabelText(/Back to ANR list/));
    expect(screen.queryByLabelText(/^ANR detail$/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^ANR list$/)).toBeInTheDocument();
  });
});
