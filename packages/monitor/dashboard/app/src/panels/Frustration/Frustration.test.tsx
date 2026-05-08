// Task 117.23 — Frustration panel render tests.

import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Frustration } from './Frustration';
import type { EventRecord } from '../../shared/api/types';

let counter = 0;
function event(payload: Record<string, unknown>, sessionId = 's1', timestamp = 0): EventRecord {
  counter += 1;
  return {
    id: `e-${counter}`,
    type: 'custom',
    severity: 'info',
    sessionId,
    timestamp,
    receivedAt: timestamp + 1,
    payload,
  };
}

function frustrationEvent(
  componentPath: string,
  signals: Array<'rage-tap' | 'dead-tap' | 'error-tap'>,
  sessionId = 's1',
  timestamp = 0,
): EventRecord {
  return event(
    {
      name: 'frustration',
      attributes: {
        componentPath,
        signals,
        level: signals.length >= 3 ? 'high' : signals.length === 2 ? 'medium' : 'low',
        tapCount: signals.length,
        windowMs: 5000,
      },
    },
    sessionId,
    timestamp,
  );
}

function touchEvent(componentPath: string, sessionId = 's1', timestamp = 0): EventRecord {
  return event({ name: 'touch', attributes: { componentPath } }, sessionId, timestamp);
}

describe('Frustration panel', () => {
  test('renders the empty-state headline when no events match', () => {
    render(<Frustration events={[]} />);
    expect(screen.getByText(/No frustration recorded/i)).toBeInTheDocument();
    // Per-button section heading is present even when there's no data;
    // the table renders an empty-state line instead.
    expect(screen.getByRole('heading', { name: /Per-button impact/i })).toBeInTheDocument();
    expect(screen.getByText(/No frustration signals recorded/i)).toBeInTheDocument();
  });

  test('renders the canonical "X% of users" sentence when error-taps cross sessions', () => {
    const events = [
      // 4 distinct sessions in the stream
      touchEvent('LoginButton', 's1'),
      touchEvent('LoginButton', 's2'),
      touchEvent('LoginButton', 's3'),
      touchEvent('LoginButton', 's4'),
      // 2 of them hit an error-tap on LoginButton → 50% of 4
      frustrationEvent('LoginButton', ['error-tap'], 's1', 100),
      frustrationEvent('LoginButton', ['error-tap'], 's2', 200),
    ];
    render(<Frustration events={events} />);
    expect(
      screen.getByText('LoginButton causes errors for 50% of users.'),
    ).toBeInTheDocument();
    // Per-button table contains the LoginButton row.
    const table = screen.getByRole('table', { name: /Per-button frustration impact/i });
    expect(table).toHaveTextContent('LoginButton');
    expect(table).toHaveTextContent('50%');
  });

  test('shows the dead-zones list when dead taps are present', () => {
    const events = [frustrationEvent('Help.cta', ['dead-tap'], 's1', 100)];
    render(<Frustration events={events} />);
    // Use the role-based query so we land on the <ul> regardless of
    // any aria-label sharing between the section + the list.
    const list = screen.getByRole('list', { name: /Dead zones/ });
    expect(list).toHaveTextContent('Help.cta');
    expect(list).toHaveTextContent('1 dead tap');
  });

  test('per-button table caps rendered rows at the limit', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      frustrationEvent(`Btn-${i}`, ['rage-tap'], `s${i}`, i * 100),
    );
    render(<Frustration events={events} />);
    const tableRows = screen
      .getByRole('table', { name: /Per-button frustration impact/i })
      .querySelectorAll('tbody tr');
    expect(tableRows.length).toBeLessThanOrEqual(12);
  });
});
