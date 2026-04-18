import { expect, test } from '@playwright/test';

test.describe('Bug Reports Inbox panel', () => {
  test('renders the inbox with the seeded bug report title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /^Bug Reports$/i })).toBeVisible();
    await expect(page.getByText(/Scroll jumps after refresh/i).first()).toBeVisible();
  });
});
