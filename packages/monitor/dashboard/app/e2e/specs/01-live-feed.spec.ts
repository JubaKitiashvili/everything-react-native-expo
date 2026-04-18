import { expect, test } from '@playwright/test';

test.describe('LiveFeed panel', () => {
  test('surfaces seeded crash event message in the live feed list', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /live feed/i })).toBeVisible();
    await expect(page.getByText(/TypeError/i).first()).toBeVisible();
  });
});
