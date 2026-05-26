import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timestamp } from './Timestamp';
import { formatRelative } from './formatTimestamp';

const NOW = new Date('2026-04-18T12:00:00Z').getTime();

describe('formatRelative', () => {
  test('"just now" for anything newer than 5 seconds', () => {
    expect(formatRelative(NOW - 500, NOW)).toBe('just now');
    expect(formatRelative(NOW - 4_999, NOW)).toBe('just now');
  });

  test('seconds, minutes, hours, days, weeks, months, years bucket boundaries', () => {
    expect(formatRelative(NOW - 30_000, NOW)).toBe('30s ago');
    expect(formatRelative(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(formatRelative(NOW - 3 * 3_600_000, NOW)).toBe('3h ago');
    expect(formatRelative(NOW - 2 * 86_400_000, NOW)).toBe('2d ago');
    expect(formatRelative(NOW - 10 * 86_400_000, NOW)).toBe('1w ago');
    expect(formatRelative(NOW - 60 * 86_400_000, NOW)).toBe('2mo ago');
    expect(formatRelative(NOW - 800 * 86_400_000, NOW)).toBe('2y ago');
  });

  test('future timestamps degrade gracefully', () => {
    expect(formatRelative(NOW + 30_000, NOW)).toBe('in a few seconds');
    expect(formatRelative(NOW + 2 * 3_600_000, NOW)).toBe('in 2h');
  });
});

describe('Timestamp component', () => {
  test('renders an ISO datetime attribute and the relative body by default', () => {
    render(<Timestamp ts={NOW - 120_000} now={NOW} />);
    const el = screen.getByText('2m ago');
    expect(el.tagName).toBe('TIME');
    expect(el).toHaveAttribute('datetime', new Date(NOW - 120_000).toISOString());
  });
});
