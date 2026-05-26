import { expect, test } from '@playwright/test';

test.describe('Alerts Console panel', () => {
  test('renders the Alerts Console with the seeded Crash spike rule', async ({ page }) => {
    await page.goto('/quality');
    await expect(page.getByRole('heading', { name: /Alerts Console/i })).toBeVisible();
    await expect(page.getByText(/Crash spike/).first()).toBeVisible();
  });
});
