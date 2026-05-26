import { expect, test } from '@playwright/test';

test.describe('Flamegraph panel', () => {
  test('renders the flamegraph heading with seeded profile frames', async ({ page }) => {
    await page.goto('/performance');
    await expect(page.getByRole('heading', { name: /flamegraph/i })).toBeVisible();
    // Root frame of the seeded profile spans the full width.
    await expect(page.getByText(/App\.render/i).first()).toBeVisible();
  });
});
