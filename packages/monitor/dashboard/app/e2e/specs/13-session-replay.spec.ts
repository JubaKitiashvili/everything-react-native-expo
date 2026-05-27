import { expect, test } from '@playwright/test';

test.describe('Session Replay panel', () => {
  test('lists every seeded session and auto-selects the most recent one', async ({ page }) => {
    await page.goto('/sessions');
    await expect(page.getByRole('heading', { name: /Session Replay/i })).toBeVisible();

    // All three seeded sessions appear in the replay session list.
    const list = page.getByRole('list', { name: /sessions with replay/i });
    await expect(list).toBeVisible();
    await expect(list.getByRole('button')).toHaveCount(3);
    await expect(list.getByText('sess-android-1')).toBeVisible();
    await expect(list.getByText('sess-ios-1')).toBeVisible();
    await expect(list.getByText('sess-ios-2')).toBeVisible();

    // The most-recent session (sess-android-1) auto-selects but has no replay
    // frames, so the viewer shows its empty state — a real, derived outcome.
    const selected = list.getByRole('button', { pressed: true });
    await expect(selected).toContainText('sess-android-1');
    const viewer = page.getByRole('region', { name: /replay viewer/i });
    await expect(viewer.getByText(/no replay frames captured/i)).toBeVisible();
  });
});
