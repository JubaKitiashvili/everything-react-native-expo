import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EventRecord } from '@/shared/api/types';
import { BreadcrumbTimeline } from './BreadcrumbTimeline';

const NOW = 1_770_000_000_000;

function crashEvent(id: string, breadcrumbs: Array<Record<string, unknown>>): EventRecord {
  return {
    id,
    type: 'crash',
    severity: 'critical',
    sessionId: 's1',
    timestamp: NOW,
    receivedAt: NOW + 10,
    payload: { breadcrumbs },
  };
}

function sessionEvent(id: string, type: string, timestamp: number, message?: string): EventRecord {
  return {
    id,
    type,
    severity: 'info',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 10,
    payload: message ? { message } : {},
  };
}

describe('BreadcrumbTimeline panel', () => {
  test('renders the empty state when neither source carries breadcrumbs', () => {
    render(<BreadcrumbTimeline crashEvent={null} sessionEvents={[]} now={NOW} />);
    expect(screen.getByText(/no breadcrumbs to show/i)).toBeInTheDocument();
  });

  test('renders crash-embedded crumbs newest-first with category labels', () => {
    const event = crashEvent('c1', [
      { category: 'nav', message: 'Navigated to /users', timestamp: NOW - 30_000 },
      { category: 'touch', message: 'Tapped Refresh', timestamp: NOW - 20_000 },
      { category: 'http', message: 'GET /api/users 500', timestamp: NOW - 10_000 },
    ]);
    render(<BreadcrumbTimeline crashEvent={event} sessionEvents={[]} now={NOW} />);

    const list = screen.getByRole('list', { name: /breadcrumb trail/i });
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Network');
    expect(items[0]).toHaveTextContent('GET /api/users 500');
    expect(items[1]).toHaveTextContent('Touch');
    expect(items[2]).toHaveTextContent('Navigation');
  });

  test('falls back to session events when the crash event has no breadcrumbs, and caps at `limit`', () => {
    const events = Array.from({ length: 120 }, (_, i) =>
      sessionEvent(`e${i}`, 'custom', NOW - 60_000 + i * 100, `event-${i}`),
    );
    render(
      <BreadcrumbTimeline
        crashEvent={crashEvent('c1', [])}
        sessionEvents={events}
        now={NOW}
        limit={5}
      />,
    );
    const list = screen.getByRole('list', { name: /breadcrumb trail/i });
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent('event-119');
    expect(items[4]).toHaveTextContent('event-115');
  });
});
