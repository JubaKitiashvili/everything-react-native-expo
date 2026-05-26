import { expect, test } from '@playwright/test';

test.describe('Network Waterfall panel', () => {
  test('renders the Network Waterfall heading', async ({ page }) => {
    await page.goto('/performance');
    await expect(page.getByRole('heading', { name: /Network Waterfall/i })).toBeVisible();
  });
});
