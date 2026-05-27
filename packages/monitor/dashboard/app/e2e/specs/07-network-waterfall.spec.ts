import { expect, test } from '@playwright/test';

test.describe('Network Waterfall panel', () => {
  test('renders the seeded request for the active session and filters by severity', async ({
    page,
  }) => {
    await page.goto('/performance');
    await expect(page.getByRole('heading', { name: /Network Waterfall/i })).toBeVisible();

    // The panel is session-scoped and auto-selects the most-recent session
    // (sess-android-1), which carries a failed POST /v2/checkout (500, 1.28 s).
    const list = page.getByRole('list', { name: /network requests/i });
    const row = list.getByRole('button', { expanded: false }).first();
    await expect(row).toContainText('POST');
    await expect(row).toContainText('500');
    await expect(row).toContainText('api.example.com');
    await expect(row).toContainText('/v2/checkout');
    await expect(row).toContainText('1.28 s');

    // Expanding the row reveals its detail (real interaction, not a heading).
    await row.click();
    await expect(list.getByRole('button', { expanded: true })).toBeVisible();

    // Severity filter: the one request is an error, so "ok" empties the list.
    await page.getByRole('button', { name: /filter to ok/i }).click();
    await expect(page.getByText(/no requests match the current filter/i)).toBeVisible();

    // …and "errors" brings it back.
    await page.getByRole('button', { name: /filter to errors/i }).click();
    await expect(page.getByRole('list', { name: /network requests/i })).toContainText('/v2/checkout');
  });
});
