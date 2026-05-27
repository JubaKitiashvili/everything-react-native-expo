import { expect, test } from '@playwright/test';

/**
 * The realtime status pill must actually reach the connected ("Live") state —
 * proving the dashboard's WebSocket handshakes with the server, not merely
 * that a "Connecting…" placeholder rendered. The pill persists across SPA
 * navigation (the socket lives in the always-mounted AppShell).
 */
test.describe('Realtime status pill', () => {
  test('connects to the realtime channel and reads "Live"', async ({ page }) => {
    await page.goto('/');
    const pill = page.getByRole('status');
    // Reaches the open state (allow brief connecting before the handshake).
    await expect(pill).toHaveText(/Live/i, { timeout: 10_000 });
    await expect(pill).toHaveAttribute('aria-label', /Realtime: Live/i);
  });

  test('the status pill survives client-side navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText(/Live/i, { timeout: 10_000 });

    // Navigate within the SPA — the AppShell (and its socket) is not torn down,
    // so the pill stays connected without reconnect thrash.
    await page.getByRole('link', { name: /^Performance$/ }).click();
    await expect(page).toHaveURL(/\/performance$/);
    await expect(page.getByRole('status')).toHaveText(/Live/i);
  });
});
