import { describe, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventRecord } from '@/shared/api/types';
import { TraceWaterfall } from './TraceWaterfall';

function trace(id: string, timestamp: number, payload: Record<string, unknown>): EventRecord {
  return {
    id,
    type: 'trace',
    severity: 'info',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 5,
    payload,
  };
}

const NOW = 1_770_000_000_000;

const FIXTURE = trace('t1', NOW, {
  traceId: 'trace-1',
  spans: [
    {
      id: 'root',
      name: 'AppStartup',
      startMs: 0,
      durationMs: 400,
      attributes: { screen: 'Home' },
      checkpoints: [{ label: 'first-frame', atMs: 120 }],
    },
    {
      id: 'fetch',
      name: 'fetchUser',
      startMs: 40,
      durationMs: 200,
      parentId: 'root',
      attributes: { url: 'https://api.example.com/me' },
    },
    { id: 'parse', name: 'parseResponse', startMs: 240, durationMs: 30, parentId: 'fetch' },
  ],
});

describe('TraceWaterfall panel', () => {
  test('renders the panel heading', () => {
    render(<TraceWaterfall events={[FIXTURE]} />);
    expect(screen.getByRole('heading', { name: /trace waterfall/i })).toBeInTheDocument();
  });

  test('renders the empty state when there is no trace', () => {
    render(<TraceWaterfall events={[]} />);
    expect(screen.getByText(/no trace captured yet/i)).toBeInTheDocument();
  });

  test('renders a row per span in the latest trace', () => {
    render(<TraceWaterfall events={[FIXTURE]} />);
    expect(screen.getByRole('button', { name: 'AppStartup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'fetchUser' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'parseResponse' })).toBeInTheDocument();
  });

  test('collapsing a span hides its descendants; expanding restores them', async () => {
    render(<TraceWaterfall events={[FIXTURE]} />);
    expect(screen.getByRole('button', { name: 'fetchUser' })).toBeInTheDocument();

    // Collapse the root → its children (fetchUser, parseResponse) disappear.
    await userEvent.click(screen.getByRole('button', { name: /collapse appstartup/i }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'fetchUser' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'parseResponse' })).not.toBeInTheDocument();

    // Expand again → children come back.
    await userEvent.click(screen.getByRole('button', { name: /expand appstartup/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'fetchUser' })).toBeInTheDocument();
    });
  });

  test('clicking a span name opens its detail with attributes and checkpoints', async () => {
    render(<TraceWaterfall events={[FIXTURE]} />);

    await userEvent.click(screen.getByRole('button', { name: 'AppStartup' }));
    const detail = await waitFor(() => screen.getByLabelText(/span detail/i));
    expect(detail).toHaveTextContent('AppStartup');
    expect(detail).toHaveTextContent('screen');
    expect(detail).toHaveTextContent('Home');
    expect(detail).toHaveTextContent('first-frame');
  });

  test('uses the newest trace event when several are present', () => {
    const older = trace('t-old', NOW - 10_000, {
      spans: [{ id: 'old', name: 'OldRoot', startMs: 0, durationMs: 10 }],
    });
    render(<TraceWaterfall events={[older, FIXTURE]} />);
    expect(screen.getByRole('button', { name: 'AppStartup' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'OldRoot' })).not.toBeInTheDocument();
  });
});
