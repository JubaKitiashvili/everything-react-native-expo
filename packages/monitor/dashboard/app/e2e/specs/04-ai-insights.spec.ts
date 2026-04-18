import { expect, test } from '@playwright/test';

test.describe('AI Insights panel', () => {
  test('renders the AI Insights heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /AI Insights/i })).toBeVisible();
  });
});
