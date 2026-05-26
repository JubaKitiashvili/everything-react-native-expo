import { describe, expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { EventRecord } from '@/shared/api/types';
import type { RscEventPayload } from './aggregate';
import { RscBoundaries } from './RscBoundaries';

let seq = 0;

function rsc(payload: RscEventPayload): EventRecord {
  seq += 1;
  return {
    id: `rsc-${seq}`,
    type: 'rsc',
    severity: 'info',
    sessionId: 's1',
    timestamp: 1_770_000_000_000 + seq,
    receivedAt: 1_770_000_000_000 + seq,
    payload: payload as unknown as Record<string, unknown>,
  };
}

describe('RscBoundaries panel', () => {
  test('renders the panel heading', () => {
    render(<RscBoundaries events={[]} />);
    expect(screen.getByRole('heading', { name: /rsc boundaries/i })).toBeInTheDocument();
  });

  test('renders the empty state when there are no RSC events', () => {
    render(<RscBoundaries events={[]} />);
    expect(screen.getByText(/no rsc boundaries captured/i)).toBeInTheDocument();
  });

  test('renders a row per boundary with its route and timing', () => {
    render(
      <RscBoundaries
        events={[
          rsc({ kind: 'server-render', routePath: '/home', serverRenderTimeMs: 80 }),
          rsc({ kind: 'payload', routePath: '/home', payloadSizeBytes: 4096 }),
          rsc({ kind: 'cache-status', routePath: '/home', cacheHit: true }),
        ]}
      />,
    );

    const table = screen.getByRole('table', { name: /rsc boundaries/i });
    const row = within(table).getByRole('rowheader', { name: '/home' }).closest('tr');
    expect(row).not.toBeNull();
    // Fast render → OK status pill.
    expect(within(row as HTMLElement).getByText('OK')).toBeInTheDocument();
    // Largest payload formatted.
    expect(within(row as HTMLElement).getByText('4.0 KB')).toBeInTheDocument();
  });

  test('shows a Slow status pill for boundaries above the p95 threshold', () => {
    render(
      <RscBoundaries
        events={[rsc({ kind: 'server-render', routePath: '/slow', serverRenderTimeMs: 600 })]}
      />,
    );
    const row = screen.getByRole('rowheader', { name: '/slow' }).closest('tr');
    expect(within(row as HTMLElement).getByText('Slow')).toBeInTheDocument();
  });

  test('shows streaming progress while chunks are outstanding', () => {
    render(
      <RscBoundaries
        events={[
          rsc({ kind: 'streaming-chunk', routePath: '/stream', chunkIndex: 1, chunkCount: 5 }),
        ]}
      />,
    );
    const row = screen.getByRole('rowheader', { name: '/stream' }).closest('tr');
    expect(within(row as HTMLElement).getByText(/streaming 2\/5/i)).toBeInTheDocument();
  });
});
