import { expect, test } from '@playwright/test';

test.describe('Session Replay panel', () => {
  test('renders the Session Replay heading', async ({ page }) => {
    await page.goto('/sessions');
    await expect(page.getByRole('heading', { name: /Session Replay/i })).toBeVisible();
  });
});
