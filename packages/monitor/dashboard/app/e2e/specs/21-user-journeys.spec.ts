import { expect, test } from '@playwright/test';

test.describe('User Journeys panel', () => {
  test('graphs real screen transitions and per-screen crash/ANR risk', async ({ page }) => {
    await page.goto('/sessions');
    await expect(page.getByRole('heading', { name: /user journeys/i })).toBeVisible();

    // The seed's nav breadcrumbs (HomeScreen → FeedScreen → ItemDetailScreen,
    // then back) produce concrete weighted transitions.
    const transitions = page.getByRole('region', { name: /top screen transitions/i });
    const homeToFeed = transitions.getByRole('listitem', { name: /HomeScreen to FeedScreen/i });
    await expect(homeToFeed).toBeVisible();
    await expect(homeToFeed).toContainText('1');

    // Per-screen risk is derived from crash/ANR events on each screen.
    const risk = page.getByRole('region', { name: /per-screen risk/i });
    // FeedScreen had 2 visits and 1 crash → flagged with a crash count.
    const feedRisk = risk.getByRole('listitem', { name: /FeedScreen screen/i });
    await expect(feedRisk).toContainText('2 visits');
    await expect(feedRisk).toContainText(/1 crash/i);
    // CheckoutScreen carries the seeded ANR.
    const checkoutRisk = risk.getByRole('listitem', { name: /CheckoutScreen screen/i });
    await expect(checkoutRisk).toContainText(/1 ANR/i);
  });
});
