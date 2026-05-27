import { expect, test } from '@playwright/test';

/**
 * Full-page loads straight to nested/param routes. The server must serve
 * index.html for unknown paths (SPA fallback) and the client router must
 * resolve the param route and render real data — not 404, not a blank shell.
 */
test.describe('Deep-link refresh on nested routes', () => {
  test('/anrs/:id resolves to the ANR inspector', async ({ page }) => {
    await page.goto('/anrs/evt-anr-1');
    await expect(page.getByRole('heading', { name: /anr inspector/i })).toBeVisible();
    // The inspector still surfaces the seeded ANR even when deep-linked.
    await expect(page.getByText(/CheckoutScreen/i).first()).toBeVisible();
  });

  test('/sessions/:id resolves to the sessions page with the session list', async ({ page }) => {
    await page.goto('/sessions/sess-ios-1');
    await expect(page.getByRole('heading', { name: /session replay/i })).toBeVisible();
    await expect(
      page.getByRole('list', { name: /sessions with replay/i }).getByText('sess-ios-1'),
    ).toBeVisible();
  });

  test('/users/:id resolves to the user drill-down with real KPIs', async ({ page }) => {
    await page.goto('/users/user_ab12');
    await expect(page.getByRole('heading', { name: 'user_ab12' })).toBeVisible();
    const metrics = page.getByRole('region', { name: /user metrics/i });
    await expect(metrics).toContainText('Sessions');
    await expect(metrics).toContainText('3');
  });

  test('/crashes/:fingerprint deep link mounts the crash explorer', async ({ page }) => {
    await page.goto('/crashes/fp-feed-root');
    await expect(page.getByRole('heading', { name: /crash explorer/i })).toBeVisible();
    await expect(
      page.getByText(/TypeError: Cannot read property 'id' of undefined/i).first(),
    ).toBeVisible();
  });
});
