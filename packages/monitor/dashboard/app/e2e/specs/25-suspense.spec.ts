import { expect, test } from '@playwright/test';

test.describe('Suspense Stalls panel', () => {
  test('renders the suspense panel with a seeded stall boundary', async ({ page }) => {
    await page.goto('/performance');
    await expect(page.getByRole('heading', { name: /suspense stalls/i })).toBeVisible();
    // Seeded suspense boundary.
    await expect(page.getByText('CheckoutScreen').first()).toBeVisible();
  });
});
