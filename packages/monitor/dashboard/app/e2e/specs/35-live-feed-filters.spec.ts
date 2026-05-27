import { expect, test } from '@playwright/test';

/**
 * Live feed type-filter + search interactions. Asserts that toggling a type
 * filter and typing a search query actually re-filter the rendered event
 * list (including the empty state), not just that pills exist.
 */
test.describe('Live feed filtering + search', () => {
  test('toggling the crash type filter shows/hides the crash event', async ({ page }) => {
    await page.goto('/');
    const crashRow = page.getByText(/TypeError: Cannot read property 'id' of undefined/i);
    await expect(crashRow).toBeVisible();

    // Toggle the crash type off → the crash leaves the feed.
    await page.getByRole('button', { name: /toggle crash filter/i }).click();
    await expect(crashRow).toHaveCount(0);

    // Toggle it back on → the crash returns.
    await page.getByRole('button', { name: /toggle crash filter/i }).click();
    await expect(crashRow).toBeVisible();
  });

  test('search narrows the feed and an unmatched query shows the empty state', async ({ page }) => {
    await page.goto('/');
    const search = page.getByLabel(/search events/i);

    // Searching the crash message keeps the crash but drops the unrelated ANR.
    await search.fill('TypeError');
    await expect(
      page.getByText(/TypeError: Cannot read property 'id' of undefined/i),
    ).toBeVisible();
    await expect(page.getByText(/fp-anr-checkout/i)).toHaveCount(0);

    // A query that matches nothing surfaces the empty state.
    await search.fill('zzz-no-such-event-xyz');
    await expect(page.getByText(/no events match the current filters/i)).toBeVisible();
  });
});
