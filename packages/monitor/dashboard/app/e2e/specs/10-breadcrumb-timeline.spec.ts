import { expect, test } from '@playwright/test';

test.describe('Breadcrumb Timeline panel', () => {
  test('renders the Breadcrumb Timeline heading', async ({ page }) => {
    await page.goto('/crashes');
    await expect(page.getByRole('heading', { name: /Breadcrumb Timeline/i })).toBeVisible();
  });
});
