import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CrashGroupRecord, EventRecord } from '@/shared/api/types';
import { AIInsights } from './AIInsights';

function group(partial: Partial<CrashGroupRecord>): CrashGroupRecord {
  return {
    fingerprint: partial.fingerprint ?? 'fp',
    message: partial.message ?? 'msg',
    firstSeen: partial.firstSeen ?? 0,
    lastSeen: partial.lastSeen ?? 0,
    eventCount: partial.eventCount ?? 1,
    sessionCount: partial.sessionCount ?? 1,
    status: partial.status ?? 'new',
    ...partial,
  };
}

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

describe('AIInsights panel', () => {
  test('renders empty-ish values when no AI-assisted data exists', () => {
    render(<AIInsights groups={[]} events={[]} />);
    const successCell = screen.getByLabelText(/agent fix success/i);
    expect(successCell).toHaveTextContent('—');

    const mttrCell = screen.getByLabelText(/mean time to resolution/i);
    expect(mttrCell).toHaveTextContent('agent');
    expect(mttrCell).toHaveTextContent('human');
    expect(mttrCell).toHaveTextContent('—');

    expect(screen.getByText(/no pattern hits yet/i)).toBeInTheDocument();
    expect(screen.getByText(/not enough AI samples yet/i)).toBeInTheDocument();
  });

  test('renders populated cells when crash groups + events supply full data', () => {
    const groups = [
      group({
        fingerprint: 'a',
        status: 'resolved',
        firstSeen: 0,
        lastSeen: 60_000,
        aiSuggestion: { pattern: 'unhandled-rejection', confidence: 0.9 },
      }),
      group({
        fingerprint: 'b',
        status: 'resolved',
        firstSeen: 0,
        lastSeen: 120_000,
        aiSuggestion: { pattern: 'unhandled-rejection', confidence: 0.85 },
      }),
      group({ fingerprint: 'c', status: 'resolved', firstSeen: 0, lastSeen: 3_600_000 }),
      group({ fingerprint: 'd', status: 'investigating', aiSuggestion: { pattern: 'p' } }),
    ];
    const events = [
      ev('pattern_match', 10, { pattern: 'unhandled-rejection', confidence: 0.8 }),
      ev('ai_suggestion', 20, { confidence: 0.9 }),
      ev('ai_suggestion', 30, { confidence: 0.95 }),
    ];
    render(<AIInsights groups={groups} events={events} />);

    const successCell = screen.getByLabelText(/agent fix success/i);
    expect(successCell).toHaveTextContent('67%');
    expect(successCell).toHaveTextContent('2 resolved');

    const mttrCell = screen.getByLabelText(/mean time to resolution/i);
    expect(mttrCell).toHaveTextContent('2 samples');
    expect(mttrCell).toHaveTextContent('1 samples');

    const patternCell = screen.getByLabelText(/pattern hits list/i);
    expect(patternCell).toHaveTextContent('unhandled-rejection');
    expect(patternCell).toHaveTextContent('×3');

    expect(screen.getByRole('img', { name: /AI confidence trend/i })).toBeInTheDocument();
  });
});
