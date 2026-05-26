import { expect, test } from '@playwright/test';

test.describe('User-centric view', () => {
  test('renders a user drill-down at /users/:id with KPI tiles', async ({ page }) => {
    await page.goto('/users/user_ab12');
    await expect(page.getByText(/user_ab12/i).first()).toBeVisible();
    // KPI tiles for the user (sessions / events / crashes / ANRs).
    await expect(page.getByText(/sessions/i).first()).toBeVisible();
    await expect(page.getByText(/crashes/i).first()).toBeVisible();
  });
});
