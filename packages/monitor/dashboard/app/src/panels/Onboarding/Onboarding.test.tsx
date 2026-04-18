import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Onboarding } from './Onboarding';
import type { DemoSeedResult } from '../../shared/api/types';

describe('Onboarding panel', () => {
  test('renders the Install SDK + Generate sample events cells when sessionCount is 0', () => {
    render(<Onboarding sessionCount={0} />);
    expect(screen.getByRole('heading', { name: /Welcome to ERNE Monitor/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /install sdk quickstart/i })).toBeInTheDocument();
    expect(screen.getByText(/npm install @erne\/monitor/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate sample events/i })).toBeInTheDocument();
  });

  test('collapses entirely once at least one session has been ingested', () => {
    const { container } = render(<Onboarding sessionCount={1} />);
    // Panel renders nothing — `container` should have no children.
    expect(container.firstChild).toBeNull();
  });

  test('clicking Generate calls onGenerateSampleData and surfaces the seeded counts', async () => {
    const seed: DemoSeedResult = {
      ok: true,
      seeded: {
        sessions: 2,
        events: 5,
        crashGroups: 1,
        bugReports: 1,
        alertRules: 1,
        symbolFiles: 0,
      },
    };
    const onGenerateSampleData = vi.fn(async () => seed);

    render(<Onboarding sessionCount={0} onGenerateSampleData={onGenerateSampleData} />);

    await userEvent.click(screen.getByRole('button', { name: /generate sample events/i }));
    expect(onGenerateSampleData).toHaveBeenCalledTimes(1);
    // Readback line is deterministic — no timestamps.
    expect(
      await screen.findByText(/seeded 2 sessions, 5 events, 1 crash group, 1 bug report\./i),
    ).toBeInTheDocument();
  });
});
