import { expect, test } from '@playwright/test';

test.describe('Crash Explorer panel', () => {
  test('renders the Crash Explorer heading and the seeded fingerprint group', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Crash Explorer/i })).toBeVisible();
    await expect(
      page.getByText(/TypeError: Cannot read property 'id' of undefined/i).first(),
    ).toBeVisible();
  });
});
