import { expect, test } from '@playwright/test';

test.describe('Suspense Stalls panel', () => {
  test('renders per-boundary rows with real timing + status from the seed', async ({ page }) => {
    await page.goto('/performance');
    await expect(page.getByRole('heading', { name: /suspense stalls/i })).toBeVisible();

    const table = page.getByRole('table', { name: /suspense stalls/i });
    await expect(table).toBeVisible();

    // Three seeded boundaries, each with a distinct outcome + timing.
    // CheckoutScreen: 5400 ms fallback, outcome=error → Errored (critical).
    const checkout = table.getByRole('row', { name: /CheckoutScreen/i });
    await expect(checkout).toContainText('5400 ms');
    await expect(checkout.getByText(/^Errored$/)).toBeVisible();

    // FeedScreen: 3200 ms fallback, resolved but slow → Slow (warning).
    const feed = table.getByRole('row', { name: /FeedScreen/i });
    await expect(feed).toContainText('3200 ms');
    await expect(feed.getByText(/^Slow$/)).toBeVisible();

    // ProfileCard: 180 ms fallback, depth 2, resolved fast → OK (success).
    const profile = table.getByRole('row', { name: /ProfileCard/i });
    await expect(profile).toContainText('180 ms');
    await expect(profile.getByText(/^OK$/)).toBeVisible();

    // Panel summary meta reflects the aggregate counts.
    await expect(page.getByText(/3 boundaries · 3 stalls/i)).toBeVisible();
  });
});
