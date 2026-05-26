import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DashboardSettings } from '@/shared/api/types';
import { resetUiStore, useUiStore } from '@/shared/store/uiStore';
import { Settings } from './Settings';

const SETTINGS: DashboardSettings = {
  retentionDays: 14,
  port: 3333,
  host: '127.0.0.1',
  wsTokenMasked: 'abc••••xyz',
  wsTokenSet: true,
  uptimeSeconds: 125,
};

describe('Settings panel', () => {
  beforeEach(() => resetUiStore());
  afterEach(() => resetUiStore());

  test('renders current retention, port, and WS token, and exposes theme options', () => {
    render(<Settings settings={SETTINGS} />);
    expect(screen.getByLabelText(/retention days/i)).toHaveValue(14);
    expect(screen.getByText('3333')).toBeInTheDocument();
    expect(screen.getByText('abc••••xyz')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();

    // Theme picker starts on the store default (system).
    const systemRadio = screen.getByRole('radio', { name: /system/i });
    expect(systemRadio).toBeChecked();
  });

  test('saving a new retention value calls onPatchSettings with normalised days', async () => {
    const onPatchSettings = vi.fn(async (patch: { retentionDays: number }) => ({
      ...SETTINGS,
      retentionDays: patch.retentionDays,
    }));
    render(<Settings settings={SETTINGS} onPatchSettings={onPatchSettings} />);

    const input = screen.getByLabelText(/retention days/i);
    await userEvent.clear(input);
    await userEvent.type(input, '30');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onPatchSettings).toHaveBeenCalledWith({ retentionDays: 30 });
    expect(await screen.findByText(/saved\. retention is now 30 days/i)).toBeInTheDocument();

    // Theme switch also persists — flips the zustand store.
    await userEvent.click(screen.getByRole('radio', { name: /^dark$/i }));
    expect(useUiStore.getState().theme).toBe('dark');
  });

  test('database reset requires confirmation and reports rows wiped on success', async () => {
    const onReset = vi.fn(async () => ({
      ok: true as const,
      deleted: { events: 120, sessions: 10, crash_groups: 4 },
    }));
    render(<Settings settings={SETTINGS} onReset={onReset} />);

    // First click only arms the confirm dialog — no API call yet.
    await userEvent.click(screen.getByRole('button', { name: /reset database/i }));
    expect(onReset).not.toHaveBeenCalled();
    const confirm = screen.getByRole('alertdialog', { name: /confirm reset/i });
    expect(confirm).toHaveTextContent(/really wipe every row/i);

    await userEvent.click(screen.getByRole('button', { name: /yes, wipe it all/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/reset complete\. wiped 134 rows across 3 tables/i),
    ).toBeInTheDocument();
  });
});
