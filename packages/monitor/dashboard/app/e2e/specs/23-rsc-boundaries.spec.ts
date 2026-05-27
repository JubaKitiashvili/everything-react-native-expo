import { expect, test } from '@playwright/test';

/**
 * Asserts the RSC boundaries TABLE renders a real row for the seeded `/feed`
 * route with its aggregated values (server-render timing, payload size, cache
 * hit ratio) — not just that the heading appears.
 */
test.describe('RSC Boundaries panel', () => {
  test('renders the /feed boundary row with aggregated render / payload / cache values', async ({
    page,
  }) => {
    await page.goto('/performance');
    await expect(page.getByRole('heading', { name: /rsc boundaries/i })).toBeVisible();

    const table = page.getByRole('table', { name: /rsc boundaries/i });
    await expect(table).toBeVisible();

    // The seeded /feed boundary: 1 server-render (240 ms), payload 18,240 B
    // (→ 17.8 KB), cache hit (→ 100%). p95 ≥ 200 ms → status "Slow".
    const feed = table.getByRole('row', { name: '/feed' });
    await expect(feed).toBeVisible();
    await expect(feed).toContainText('240 ms');
    await expect(feed).toContainText('17.8 KB');
    await expect(feed).toContainText('100%');
  });
});
