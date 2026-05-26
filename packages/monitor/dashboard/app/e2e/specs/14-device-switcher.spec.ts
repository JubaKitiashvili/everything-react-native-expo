import { expect, test } from '@playwright/test';

test.describe('Device Switcher panel', () => {
  test('renders both seeded devices (iPhone 16 Pro + Pixel 9)', async ({ page }) => {
    await page.goto('/sessions');
    await expect(page.getByRole('heading', { name: /Device Switcher/i })).toBeVisible();
    await expect(page.getByLabel(/device iPhone 16 Pro card/i)).toBeVisible();
    await expect(page.getByLabel(/device Pixel 9 card/i)).toBeVisible();
  });
});
