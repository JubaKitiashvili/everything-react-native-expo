import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SessionRecord } from '../../shared/api/types';
import { resetUiStore, useUiStore } from '../../shared/store/uiStore';
import { DeviceSwitcher } from './DeviceSwitcher';

const NOW = 1_770_000_000_000;

function session(partial: Partial<SessionRecord>): SessionRecord {
  return {
    id: partial.id ?? 's',
    startedAt: partial.startedAt ?? NOW,
    eventCount: partial.eventCount ?? 0,
    crashCount: partial.crashCount ?? 0,
    ...partial,
  };
}

describe('DeviceSwitcher panel', () => {
  beforeEach(() => resetUiStore());
  afterEach(() => resetUiStore());

  test('renders the empty state when no sessions are in hand', () => {
    render(<DeviceSwitcher sessions={[]} now={NOW} />);
    expect(screen.getByText(/no devices have reported sessions yet/i)).toBeInTheDocument();
  });

  test('groups multi-session devices into single cards with roll-up counts + crash badge', () => {
    const sessions = [
      session({
        id: 'a1',
        platform: 'ios',
        appVersion: '1.2.0',
        device: { model: 'iPhone 16 Pro', systemVersion: '18.4' },
        startedAt: NOW - 60_000,
        eventCount: 12,
        crashCount: 1,
      }),
      session({
        id: 'a2',
        platform: 'ios',
        appVersion: '1.2.0',
        device: { model: 'iPhone 16 Pro', systemVersion: '18.4' },
        startedAt: NOW - 10_000,
        eventCount: 4,
      }),
      session({
        id: 'b1',
        platform: 'android',
        appVersion: '1.2.0',
        device: { model: 'Pixel 9', osVersion: '15' },
        startedAt: NOW - 2_000,
      }),
    ];
    render(<DeviceSwitcher sessions={sessions} now={NOW} />);
    const iphoneCard = screen.getByLabelText(/device iPhone 16 Pro card/i);
    expect(iphoneCard).toHaveTextContent(/IOS · 18\.4 · app 1\.2\.0/i);
    expect(iphoneCard).toHaveTextContent('×1 crash');
    // Sessions section lists both a1 + a2
    const sessions$ = iphoneCard.querySelectorAll('ul li');
    expect(sessions$.length).toBe(2);

    // Pixel 9 card is the newest (by lastSeen) → sits first in the grid.
    const cards = screen.getAllByLabelText(/device .* card/i);
    expect(cards[0]).toHaveTextContent('Pixel 9');
  });

  test('clicking a session row updates the zustand selectedSessionId (other panels react to it)', async () => {
    const sessions = [
      session({
        id: 's-foo',
        platform: 'ios',
        appVersion: '1.0.0',
        device: { model: 'iPhone 15', systemVersion: '17.2' },
        startedAt: NOW - 1_000,
      }),
    ];
    render(<DeviceSwitcher sessions={sessions} now={NOW} />);

    await userEvent.click(screen.getByRole('button', { name: /s-foo/ }));
    expect(useUiStore.getState().selectedSessionId).toBe('s-foo');
  });
});
