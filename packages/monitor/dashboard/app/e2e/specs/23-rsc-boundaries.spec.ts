import { expect, test } from '@playwright/test';

test.describe('RSC Boundaries panel', () => {
  test('renders the RSC boundaries heading with the seeded /feed route', async ({ page }) => {
    await page.goto('/performance');
    await expect(page.getByRole('heading', { name: /rsc boundaries/i })).toBeVisible();
    // Seeded RSC events are keyed to the /feed route.
    await expect(page.getByText('/feed').first()).toBeVisible();
  });
});
