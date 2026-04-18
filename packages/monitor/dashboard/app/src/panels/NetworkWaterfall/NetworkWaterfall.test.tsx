import { describe, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventRecord } from '../../shared/api/types';
import { NetworkWaterfall } from './NetworkWaterfall';

function net(
  id: string,
  timestamp: number,
  payload: Record<string, unknown>,
  screen?: string,
): EventRecord {
  return {
    id,
    type: 'network',
    severity: 'info',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 10,
    payload,
    ...(screen !== undefined ? { screen } : {}),
  };
}

const NOW = 1_770_000_000_000;

describe('NetworkWaterfall panel', () => {
  test('renders the empty state when there are no network events', () => {
    render(<NetworkWaterfall events={[]} now={NOW} />);
    expect(screen.getByText(/no network requests captured/i)).toBeInTheDocument();
  });

  test('renders one row per request, each with its status and severity pill', () => {
    const events = [
      net('a', NOW - 3_000, {
        method: 'GET',
        url: 'https://api.example.com/users',
        status: 200,
        durationMs: 120,
      }),
      net('b', NOW - 2_000, {
        method: 'POST',
        url: 'https://api.example.com/orders',
        status: 500,
        durationMs: 340,
      }),
      net('c', NOW - 1_000, {
        method: 'GET',
        url: 'https://api.example.com/feed',
        status: 200,
        durationMs: 2_300,
      }),
    ];
    render(<NetworkWaterfall events={events} now={NOW} />);
    const rows = screen.getAllByRole('button', { expanded: false });
    const requestRows = rows.filter((el) => el.textContent?.includes('api.example.com'));
    expect(requestRows).toHaveLength(3);
    // Newest request sits at the top; "c" (the slow one) is freshest, then "b" (error).
    expect(requestRows[0]).toHaveTextContent('/feed');
    expect(requestRows[0]).toHaveTextContent('slow');
    expect(requestRows[1]).toHaveTextContent('500');
    expect(requestRows[1]).toHaveTextContent('/orders');
    expect(requestRows[1]).toHaveTextContent('error');
    expect(requestRows[2]).toHaveTextContent('/users');
    expect(requestRows[2]).toHaveTextContent('ok');
  });

  test('filter pill hides non-matching rows', async () => {
    const events = [
      net('a', NOW - 3_000, {
        method: 'GET',
        url: 'https://api.example.com/users',
        status: 200,
        durationMs: 120,
      }),
      net('b', NOW - 2_000, {
        method: 'POST',
        url: 'https://api.example.com/orders',
        status: 500,
        durationMs: 340,
      }),
    ];
    render(<NetworkWaterfall events={events} now={NOW} />);

    await userEvent.click(screen.getByRole('button', { name: /filter to errors/i }));
    const list = await waitFor(() => screen.getByRole('list', { name: /network requests/i }));
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('/orders');
  });

  test('clicking a row expands the detail panel with headers and URL', async () => {
    const events = [
      net('a', NOW, {
        method: 'GET',
        url: 'https://api.example.com/users?id=42',
        status: 200,
        durationMs: 120,
        requestSize: 128,
        responseSize: 2_048,
        initiator: 'UserList.tsx',
        requestHeaders: { Authorization: 'Bearer abc', Accept: 'application/json' },
        responseHeaders: { 'Content-Type': 'application/json', 'X-Served-By': 'node-1' },
      }),
    ];
    render(<NetworkWaterfall events={events} now={NOW} />);

    const row = screen.getByRole('button', { name: /get.*api.example.com/i });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(row);

    const detail = await waitFor(() => screen.getByLabelText(/request detail/i));
    expect(detail).toHaveTextContent('https://api.example.com/users?id=42');
    expect(detail).toHaveTextContent('UserList.tsx');
    expect(detail).toHaveTextContent('authorization');
    expect(detail).toHaveTextContent('content-type');
    expect(screen.getByRole('button', { expanded: true })).toBe(row);
  });
});
