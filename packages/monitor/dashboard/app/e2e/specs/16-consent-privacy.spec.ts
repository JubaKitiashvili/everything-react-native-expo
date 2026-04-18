import { expect, test } from '@playwright/test';

test.describe('Consent & Privacy panel', () => {
  test('DSAR lookup surfaces the seeded user_ab12 summary', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Consent & Privacy/i })).toBeVisible();
    await page.getByLabel(/user id/i).fill('user_ab12');
    await page.getByRole('button', { name: /look up/i }).click();
    await expect(page.getByLabel(/consent card for user_ab12/i)).toBeVisible();
  });
});
