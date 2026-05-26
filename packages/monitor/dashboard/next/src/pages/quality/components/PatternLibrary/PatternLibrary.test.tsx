import { describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CrashGroupRecord, EventRecord } from '@/shared/api/types';
import { BUILT_IN_PATTERNS } from './catalog';
import { PatternLibrary } from './PatternLibrary';

const NOW = 1_770_000_000_000;

function ev(type: string, timestamp: number, payload: Record<string, unknown>): EventRecord {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    type,
    severity: 'info',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 10,
    payload,
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

describe('PatternLibrary panel', () => {
  test('renders every built-in pattern when no events exist', () => {
    render(<PatternLibrary events={[]} groups={[]} now={NOW} />);
    const list = screen.getByLabelText(/pattern library entries/i);
    const items = list.querySelectorAll('li');
    expect(items.length).toBe(BUILT_IN_PATTERNS.length);
    // Summary footer reflects "0 matched above threshold".
    expect(screen.getByText(/0\/0 matched above threshold/i)).toBeInTheDocument();
  });

  test('confidence threshold slider hides matched patterns below it', async () => {
    const events = [
      ev('pattern_match', NOW - 3_600_000, { pattern: 'render-storm', confidence: 0.4 }),
    ];
    render(<PatternLibrary events={events} groups={[]} now={NOW} />);
    expect(screen.getByText('Re-render storm')).toBeInTheDocument();

    const slider = screen.getByLabelText(/confidence threshold/i) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '1' } });

    expect(screen.queryByText('Re-render storm')).toBeNull();
  });

  test('Learned only filter shows only patterns outside the catalog', async () => {
    const events = [
      ev('pattern_match', NOW - 1_000, { pattern: 'brand-new-pattern', confidence: 0.7 }),
    ];
    const groups = [
      group({
        fingerprint: 'a',
        aiSuggestion: { pattern: 'render-storm', confidence: 0.8 },
        lastSeen: NOW - 1_000,
      }),
    ];
    render(<PatternLibrary events={events} groups={groups} now={NOW} />);
    expect(screen.getByText('Re-render storm')).toBeInTheDocument();
    expect(screen.getByText('brand-new-pattern')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/learned only/i));
    expect(screen.queryByText('Re-render storm')).toBeNull();
    expect(screen.getByText('brand-new-pattern')).toBeInTheDocument();
  });
});
