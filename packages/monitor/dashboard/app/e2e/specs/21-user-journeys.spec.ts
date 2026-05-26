import { expect, test } from '@playwright/test';

test.describe('User Journeys panel', () => {
  test('renders the journeys heading with a seeded screen transition', async ({ page }) => {
    await page.goto('/sessions');
    await expect(page.getByRole('heading', { name: /user journeys/i })).toBeVisible();
    // HomeScreen only appears in the journeys flow on this page.
    await expect(page.getByText(/HomeScreen/i).first()).toBeVisible();
  });
});
