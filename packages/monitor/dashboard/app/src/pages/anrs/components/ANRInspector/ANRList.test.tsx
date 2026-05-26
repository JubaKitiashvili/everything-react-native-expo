// Task 117.22 — ANRList component tests.

import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ANRList } from './ANRList';
import type { AnrInstance } from './aggregate';

function instance(overrides: Partial<AnrInstance> = {}): AnrInstance {
  return {
    id: 'a',
    timestamp: 1_000,
    durationMs: 6_000,
    stackHead: 'at MainThread (App.tsx:1:1)',
    screen: 'Home',
    sessionId: 's1',
    stackFrames: ['Error: hung', 'at MainThread (App.tsx:1:1)'],
    fingerprint: 'fp-1',
    kind: 'anr',
    ...overrides,
  };
}

const NOW = 1_770_000_000_000;

describe('ANRList', () => {
  test('renders the empty state when no instances exist', () => {
    render(<ANRList instances={[]} onSelect={() => {}} now={NOW} />);
    expect(screen.getByText(/no ANRs match/i)).toBeInTheDocument();
  });

  test('shows all instances by default with a count summary', () => {
    const items = [
      instance({ id: 'a', timestamp: NOW - 10_000, durationMs: 6_000, screen: 'Home' }),
      instance({ id: 'b', timestamp: NOW - 5_000, durationMs: 12_000, screen: 'Settings' }),
    ];
    render(<ANRList instances={items} onSelect={() => {}} now={NOW} />);
    expect(screen.getByText(/2 of 2/)).toBeInTheDocument();
    const table = screen.getByLabelText(/ANR list table/);
    expect(table).toHaveTextContent('Home');
    expect(table).toHaveTextContent('Settings');
  });

  test('clicking a row triggers onSelect with the instance id', () => {
    const onSelect = vi.fn();
    const items = [instance({ id: 'a', timestamp: NOW, durationMs: 6_000 })];
    render(<ANRList instances={items} onSelect={onSelect} now={NOW} />);
    const button = screen.getByLabelText(/Open ANR from Home/);
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  test('screen filter narrows the list', () => {
    const items = [
      instance({ id: 'a', timestamp: NOW - 10_000, durationMs: 6_000, screen: 'Home' }),
      instance({ id: 'b', timestamp: NOW - 5_000, durationMs: 12_000, screen: 'Settings' }),
    ];
    render(<ANRList instances={items} onSelect={() => {}} now={NOW} />);
    const select = screen.getByLabelText(/Filter by screen/);
    fireEvent.change(select, { target: { value: 'Settings' } });
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
    // Scope to the table body so the dropdown's <option>Home</option>
    // doesn't trigger a false positive.
    const tbody = screen.getByLabelText(/ANR list table/).querySelector('tbody');
    expect(tbody?.textContent).not.toContain('Home');
  });

  test('duration filter narrows the list', () => {
    const items = [
      instance({ id: 'a', timestamp: NOW - 10_000, durationMs: 4_000, screen: 'Home' }),
      instance({ id: 'b', timestamp: NOW - 5_000, durationMs: 12_000, screen: 'Settings' }),
    ];
    render(<ANRList instances={items} onSelect={() => {}} now={NOW} />);
    const select = screen.getByLabelText(/Filter by duration/);
    fireEvent.change(select, { target: { value: '10to20' } });
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
  });

  test('sort by duration reorders rows', () => {
    const items = [
      instance({ id: 'a', timestamp: NOW - 10_000, durationMs: 4_000, screen: 'Short' }),
      instance({ id: 'b', timestamp: NOW - 5_000, durationMs: 18_000, screen: 'Long' }),
    ];
    const { container } = render(<ANRList instances={items} onSelect={() => {}} now={NOW} />);
    // Click the Duration header.
    fireEvent.click(screen.getByRole('button', { name: /Duration/ }));
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('Long');
    expect(rows[1]?.textContent).toContain('Short');
  });

  test('unknown screen filter shows only screen-less ANRs', () => {
    const items = [
      instance({ id: 'a', timestamp: NOW - 10_000, durationMs: 6_000, screen: 'Home' }),
      instance({ id: 'b', timestamp: NOW - 5_000, durationMs: 12_000, screen: null }),
    ];
    render(<ANRList instances={items} onSelect={() => {}} now={NOW} />);
    const select = screen.getByLabelText(/Filter by screen/);
    fireEvent.change(select, { target: { value: '<unknown>' } });
    expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
    const tbody = screen.getByLabelText(/ANR list table/).querySelector('tbody');
    expect(tbody?.textContent).not.toContain('Home');
  });
});
