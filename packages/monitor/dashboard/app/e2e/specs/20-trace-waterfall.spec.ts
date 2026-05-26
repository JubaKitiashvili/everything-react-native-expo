import { expect, test } from '@playwright/test';

test.describe('Trace Waterfall panel', () => {
  test('renders the trace waterfall heading with the seeded root span', async ({ page }) => {
    await page.goto('/performance');
    await expect(page.getByRole('heading', { name: /trace waterfall/i })).toBeVisible();
    // Seeded trace's root span.
    await expect(page.getByText(/AppStartup/).first()).toBeVisible();
  });
});
