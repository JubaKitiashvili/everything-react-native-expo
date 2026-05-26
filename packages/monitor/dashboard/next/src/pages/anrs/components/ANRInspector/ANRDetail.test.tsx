// Task 117.22 — ANRDetail component tests.

import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ANRDetail } from './ANRDetail';
import type { AnrInstance } from './aggregate';

function instance(overrides: Partial<AnrInstance> = {}): AnrInstance {
  return {
    id: 'a',
    timestamp: 1_770_000_000_000,
    durationMs: 12_000,
    stackHead: 'at MainThread (App.tsx:1:1)',
    screen: 'Home',
    sessionId: 'session-abc-1234567890',
    stackFrames: [
      'Error: hung',
      'at MainThread (App.tsx:1:1)',
      'at Renderer (Renderer.tsx:42:7)',
    ],
    fingerprint: 'fp-1',
    kind: 'anr',
    ...overrides,
  };
}

const NOW = 1_770_000_000_000;

describe('ANRDetail', () => {
  test('renders the summary chips with duration + screen + session', () => {
    render(
      <ANRDetail
        instance={instance()}
        recurrence={[]}
        onBack={() => {}}
        now={NOW}
      />,
    );
    expect(screen.getByText('12 s')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    // Session id is truncated with an ellipsis but the unabridged
    // value is in the title attribute.
    expect(screen.getByTitle('session-abc-1234567890')).toBeInTheDocument();
  });

  test('renders every stack frame with the head highlighted', () => {
    const { container } = render(
      <ANRDetail
        instance={instance()}
        recurrence={[]}
        onBack={() => {}}
        now={NOW}
      />,
    );
    const frames = container.querySelectorAll('ol li');
    expect(frames.length).toBe(3);
    // Top "at " frame is the second item (after the Error header).
    expect(frames[1]?.className).toMatch(/stackFrameTop/);
  });

  test('shows native-ANR placeholder when stack is empty', () => {
    render(
      <ANRDetail
        instance={instance({ stackFrames: [], kind: 'native_anr' })}
        recurrence={[]}
        onBack={() => {}}
        now={NOW}
      />,
    );
    expect(screen.getByText(/No JS frames captured/i)).toBeInTheDocument();
    expect(screen.getByText(/Native ANR/)).toBeInTheDocument();
  });

  test('back button calls onBack', () => {
    const onBack = vi.fn();
    render(
      <ANRDetail
        instance={instance()}
        recurrence={[]}
        onBack={onBack}
        now={NOW}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Back to ANR list/));
    expect(onBack).toHaveBeenCalled();
  });

  test('renders recurrence list and clicking a different instance fires onSelectInstance', () => {
    const onSelect = vi.fn();
    const current = instance({ id: 'a', timestamp: NOW });
    const earlier = instance({ id: 'b', timestamp: NOW - 60_000, durationMs: 8_000 });
    render(
      <ANRDetail
        instance={current}
        recurrence={[current, earlier]}
        onBack={() => {}}
        onSelectInstance={onSelect}
        now={NOW}
      />,
    );
    expect(screen.getByText(/2 occurrences/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Open ANR from Home, 8.0 s/));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  test('shows the only-ANR notice when recurrence is empty', () => {
    render(
      <ANRDetail
        instance={instance()}
        recurrence={[]}
        onBack={() => {}}
        now={NOW}
      />,
    );
    expect(screen.getByText(/only ANR with this fingerprint/i)).toBeInTheDocument();
  });
});
