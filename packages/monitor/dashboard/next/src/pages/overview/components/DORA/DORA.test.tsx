import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CrashGroupRecord, SessionRecord } from '@/shared/api/types';
import { DORA } from './DORA';

const DAY = 86_400_000;
const NOW = 1_770_000_000_000;

function session(partial: Partial<SessionRecord>): SessionRecord {
  return {
    id: partial.id ?? 's',
    startedAt: partial.startedAt ?? NOW,
    eventCount: 0,
    crashCount: 0,
    ...partial,
  };
}

function group(partial: Partial<CrashGroupRecord>): CrashGroupRecord {
  return {
    fingerprint: partial.fingerprint ?? 'fp',
    message: partial.message ?? 'msg',
    firstSeen: partial.firstSeen ?? 0,
    lastSeen: partial.lastSeen ?? 0,
    eventCount: 1,
    sessionCount: 1,
    status: partial.status ?? 'new',
    ...partial,
  };
}

describe('DORA panel', () => {
  test('shows em-dash placeholders for every metric when no data exists', () => {
    render(<DORA groups={[]} sessions={[]} now={NOW} />);
    const mttr = screen.getByLabelText(/MTTR metric card/i);
    expect(mttr).toHaveTextContent(/^MTTR/);
    expect(mttr).toHaveTextContent('—');

    const cfr = screen.getByLabelText(/change failure rate metric card/i);
    expect(cfr).toHaveTextContent('—');

    const freq = screen.getByLabelText(/deploy frequency metric card/i);
    expect(freq).toHaveTextContent('—');

    const lead = screen.getByLabelText(/lead time \(deploy gap\) metric card/i);
    expect(lead).toHaveTextContent('—');
  });

  test('renders populated metrics + trend arrows when groups and sessions cover both current and previous windows', () => {
    const sessions: SessionRecord[] = [
      // Deploys in the previous window (beyond -14d)
      session({ id: 'p1', appVersion: '1.0.0', startedAt: NOW - 20 * DAY }),
      session({ id: 'p2', appVersion: '1.1.0', startedAt: NOW - 18 * DAY }),
      // Deploys in the current window (last 14d)
      session({ id: 'c1', appVersion: '1.2.0', startedAt: NOW - 10 * DAY }),
      session({ id: 'c2', appVersion: '1.3.0', startedAt: NOW - 6 * DAY }),
      session({ id: 'c3', appVersion: '1.4.0', startedAt: NOW - 2 * DAY }),
    ];
    const groups = [
      // Previous-window resolved crash (2 days to resolve)
      group({
        fingerprint: 'p-a',
        status: 'resolved',
        firstSeen: NOW - 17 * DAY,
        lastSeen: NOW - 15 * DAY,
      }),
      // Current-window resolved crash (1 day to resolve)
      group({
        fingerprint: 'c-a',
        status: 'resolved',
        firstSeen: NOW - 5 * DAY,
        lastSeen: NOW - 4 * DAY,
      }),
      // Crash tied to the v1.3.0 deploy window to trip CFR
      group({
        fingerprint: 'c-b',
        status: 'new',
        firstSeen: NOW - 6 * DAY + 60 * 60_000,
        lastSeen: NOW - 6 * DAY + 60 * 60_000,
      }),
    ];
    render(<DORA groups={groups} sessions={sessions} now={NOW} />);

    const mttr = screen.getByLabelText(/MTTR metric card/i);
    expect(mttr).toHaveTextContent('1.0 d');
    // MTTR improved from 2d → 1d (lower is better) → up arrow
    expect(mttr.querySelector('[aria-label="trend up"]')).not.toBeNull();

    const freq = screen.getByLabelText(/deploy frequency metric card/i);
    expect(freq).toHaveTextContent(/\//);
    expect(freq).toHaveTextContent('3 deploys');
  });
});
