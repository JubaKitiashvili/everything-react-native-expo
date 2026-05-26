import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventRow } from './EventRow';

const NOW = new Date('2026-04-18T12:00:00Z').getTime();

describe('EventRow', () => {
  test('renders timestamp, type pill, and message', () => {
    render(
      <EventRow
        timestamp={NOW - 60_000}
        type="crash"
        severity="critical"
        message="TypeError: cannot read property 'x' of undefined"
        now={NOW}
      />,
    );

    expect(screen.getByText('1m ago')).toBeInTheDocument();
    expect(screen.getByText('crash')).toBeInTheDocument();
    expect(
      screen.getByText("TypeError: cannot read property 'x' of undefined"),
    ).toBeInTheDocument();
  });

  test('fires onSelect when clicked and exposes aria-pressed for selection', async () => {
    const onSelect = vi.fn();
    render(
      <EventRow
        timestamp={NOW}
        type="network"
        severity="warning"
        message="GET /api/users 500"
        selected
        onSelect={onSelect}
        now={NOW}
      />,
    );

    const row = screen.getByRole('button');
    expect(row).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
