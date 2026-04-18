import { expect, test } from '@playwright/test';

test.describe('Pattern Library panel', () => {
  test('renders the Pattern Library heading and pattern list', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Pattern Library/i })).toBeVisible();
  });
});
