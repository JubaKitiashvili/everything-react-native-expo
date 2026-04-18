import { expect, test } from '@playwright/test';

test.describe('Performance panel', () => {
  test('renders the performance heading with seeded startup / TTI values', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /^Performance$/ })).toBeVisible();
    // Seed includes a tti phase=cold event — section title must render.
    await expect(page.getByText(/startup/i).first()).toBeVisible();
  });
});
