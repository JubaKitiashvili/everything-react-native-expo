import { describe, expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { EventRecord } from '@/shared/api/types';
import { UserJourneys } from './UserJourneys';

let seq = 0;

function event(partial: Partial<EventRecord>): EventRecord {
  seq += 1;
  return {
    id: partial.id ?? `e${seq}`,
    type: partial.type ?? 'custom',
    severity: partial.severity ?? 'info',
    sessionId: partial.sessionId ?? 's1',
    timestamp: partial.timestamp ?? seq,
    receivedAt: partial.receivedAt ?? (partial.timestamp ?? seq) + 1,
    payload: partial.payload ?? {},
    ...partial,
  };
}

describe('UserJourneys panel', () => {
  test('shows the empty state when there is no screen activity', () => {
    render(<UserJourneys events={[]} />);
    expect(screen.getByText(/no screen activity yet/i)).toBeInTheDocument();
  });

  test('renders the heading, a weighted transition row, and per-screen risk badges', () => {
    const events: EventRecord[] = [
      event({ sessionId: 's1', screen: 'Home', timestamp: 1 }),
      event({ sessionId: 's1', screen: 'Checkout', timestamp: 2 }),
      event({ sessionId: 's1', screen: 'Checkout', type: 'crash', timestamp: 3 }),
      event({ sessionId: 's2', screen: 'Home', timestamp: 1 }),
      event({ sessionId: 's2', screen: 'Checkout', timestamp: 2 }),
    ];
    render(<UserJourneys events={events} />);

    // Heading.
    expect(screen.getByRole('heading', { name: 'User Journeys' })).toBeInTheDocument();

    // Weighted transition row: Home → Checkout, summed to 2 across sessions.
    const transition = screen.getByLabelText('Home to Checkout');
    expect(transition).toHaveTextContent('Home');
    expect(transition).toHaveTextContent('Checkout');
    expect(transition).toHaveTextContent('2');

    // Risk badge: Checkout had a crash → critical risk pill.
    const checkoutRow = screen.getByLabelText('Checkout screen');
    expect(within(checkoutRow).getByText(/1 crash/i)).toBeInTheDocument();

    // Healthy screen carries a success pill.
    const homeRow = screen.getByLabelText('Home screen');
    expect(within(homeRow).getByText(/healthy/i)).toBeInTheDocument();
  });
});
