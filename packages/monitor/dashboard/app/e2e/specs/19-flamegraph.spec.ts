import { expect, test } from '@playwright/test';

test.describe('Flamegraph panel', () => {
  test('folds the seeded Hermes profile into weighted frames', async ({ page }) => {
    await page.goto('/performance');
    await expect(page.getByRole('heading', { name: /flamegraph/i })).toBeVisible();

    // The flame canvas is a role="img" with an accessible name.
    const canvas = page.getByRole('img', { name: /flamegraph frames/i });
    await expect(canvas).toBeVisible();

    // Folded weights are computed from the seeded samples (42/30/12/8 = 92 total).
    // Each frame's title carries its absolute weight + % of total — asserting
    // these proves the fold actually ran, not just that a label rendered.
    const feedScreen = canvas.locator('div[title^="FeedScreen.render"]');
    await expect(feedScreen).toHaveAttribute('title', /FeedScreen\.render — 84 \(91\.3%\)/);

    const feedList = canvas.locator('div[title^="FeedList.render"]');
    await expect(feedList).toHaveAttribute('title', /FeedList\.render — 72 \(78\.3%\)/);

    // Deepest seeded frame is present too.
    await expect(canvas.locator('div[title^="FeedItem.render"]')).toBeVisible();
  });
});
