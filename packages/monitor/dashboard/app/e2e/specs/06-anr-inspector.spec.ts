import { expect, test } from '@playwright/test';

test.describe('ANR Inspector panel', () => {
  test('renders the ANR Inspector heading with the seeded ANR stack head', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /ANR Inspector/i })).toBeVisible();
    await expect(page.getByText(/CheckoutScreen/i).first()).toBeVisible();
  });
});
