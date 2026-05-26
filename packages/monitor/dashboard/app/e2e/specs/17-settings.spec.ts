import { expect, test } from '@playwright/test';

test.describe('Settings panel', () => {
  test('renders current retention (30 from the seed) and theme options', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /^Settings$/ })).toBeVisible();
    // Seed sets retention_days = 30.
    await expect(page.getByLabel(/retention days/i)).toHaveValue('30');
    // Three theme radios must be on the page.
    await expect(page.getByRole('radio', { name: /^dark$/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: /^light$/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: /^system$/i })).toBeVisible();
  });
});
