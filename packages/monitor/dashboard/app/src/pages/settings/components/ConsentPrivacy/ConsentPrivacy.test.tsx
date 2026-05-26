import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserDataExport, UserDataSummary } from '@/shared/api/types';
import { ConsentPrivacy } from './ConsentPrivacy';

const NOW = 1_770_000_000_000;

function makeSummary(partial: Partial<UserDataSummary> = {}): UserDataSummary {
  return {
    userId: partial.userId ?? 'user_abc123',
    sessionCount: partial.sessionCount ?? 3,
    eventCount: partial.eventCount ?? 42,
    crashCount: partial.crashCount ?? 2,
    firstSeen: partial.firstSeen ?? NOW - 86_400_000,
    lastSeen: partial.lastSeen ?? NOW - 60_000,
    eventTypes: partial.eventTypes ?? [
      { type: 'custom', count: 30 },
      { type: 'crash', count: 2 },
      { type: 'navigation', count: 10 },
    ],
  };
}

describe('ConsentPrivacy panel', () => {
  test('look-up surfaces session/event counts and category breakdown', async () => {
    const onLookup = vi.fn(async () => makeSummary());
    render(<ConsentPrivacy onLookup={onLookup} now={NOW} />);

    // Empty lookup is a no-op — button fires onLookup only when id is non-empty.
    await userEvent.click(screen.getByRole('button', { name: /look up/i }));
    expect(onLookup).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/user id/i), 'user_abc123');
    await userEvent.click(screen.getByRole('button', { name: /look up/i }));
    expect(onLookup).toHaveBeenCalledWith('user_abc123');

    const card = await screen.findByLabelText(/consent card for user_abc123/i);
    expect(card).toHaveTextContent('3');
    expect(card).toHaveTextContent('42');
    expect(card).toHaveTextContent('2 crashes');
    expect(card).toHaveTextContent('navigation');
  });

  test('export button streams JSON into the injected downloader with a user-scoped filename', async () => {
    const onExport = vi.fn<(id: string) => Promise<UserDataExport>>(async (userId) => ({
      userId,
      sessions: [],
      events: [
        {
          id: 'e1',
          type: 'custom',
          severity: 'info',
          sessionId: 's1',
          timestamp: NOW,
          receivedAt: NOW + 10,
          payload: { greeting: 'hi' },
          userId,
        },
      ],
      exportedAt: NOW,
    }));
    const downloader = vi.fn();
    render(
      <ConsentPrivacy
        onLookup={async () => makeSummary()}
        onExport={onExport}
        downloader={downloader}
        now={NOW}
      />,
    );

    await userEvent.type(screen.getByLabelText(/user id/i), 'user_abc123');
    await userEvent.click(screen.getByRole('button', { name: /look up/i }));
    await screen.findByLabelText(/consent card for user_abc123/i);

    await userEvent.click(screen.getByRole('button', { name: /export user data/i }));
    expect(onExport).toHaveBeenCalledWith('user_abc123');
    expect(downloader).toHaveBeenCalledTimes(1);
    const [filename, body] = downloader.mock.calls[0]!;
    expect(filename).toBe('erne-monitor-user_abc123.json');
    expect(JSON.parse(body as string).events).toHaveLength(1);
    expect(screen.getByText(/exported 1 events/i)).toBeInTheDocument();
  });

  test('delete flow requires explicit confirmation before firing onDelete', async () => {
    const onDelete = vi.fn(async () => ({ deletedEvents: 42 }));
    render(
      <ConsentPrivacy
        onLookup={async () => makeSummary()}
        onDelete={onDelete}
        downloader={vi.fn()}
        now={NOW}
      />,
    );

    await userEvent.type(screen.getByLabelText(/user id/i), 'user_abc123');
    await userEvent.click(screen.getByRole('button', { name: /look up/i }));
    await screen.findByLabelText(/consent card for user_abc123/i);

    // First click arms the confirmation — no API call yet.
    await userEvent.click(screen.getByRole('button', { name: /^delete user data$/i }));
    expect(onDelete).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', { name: /confirm delete/i });
    expect(dialog).toHaveTextContent(/delete all data for user_abc123/i);

    // Cancel still wired correctly.
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onDelete).not.toHaveBeenCalled();

    // Arm again, then confirm → single onDelete call with the active userId.
    await userEvent.click(screen.getByRole('button', { name: /^delete user data$/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('user_abc123');

    // Post-delete feedback + card clears.
    expect(await screen.findByText(/deleted 42 events/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/consent card for user_abc123/i)).toBeNull();
  });
});
