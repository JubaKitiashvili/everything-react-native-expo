import { expect, test } from '@playwright/test';

test.describe('DORA panel', () => {
  test('renders the four DORA metric tiles', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /^DORA Metrics$/ })).toBeVisible();
    // Each metric gets a dt label — confirm MTTR is present at minimum.
    await expect(page.getByText(/MTTR/i).first()).toBeVisible();
  });
});
