import { expect, test } from '@playwright/test';

test.describe('Breadcrumb Timeline panel', () => {
  test('freezes the selected crash trail and lists its captured breadcrumbs', async ({ page }) => {
    await page.goto('/crashes');
    await expect(page.getByRole('heading', { name: /Breadcrumb Timeline/i })).toBeVisible();

    // Select the TypeError crash, whose event froze a breadcrumb trail at
    // crash time. (The default-selected ANR group has none.)
    await page.getByRole('button', { name: /TypeError: Cannot read property/i }).click();

    const trail = page.getByRole('list', { name: /breadcrumb trail/i });
    await expect(trail).toBeVisible();
    await expect(trail.getByText(/Navigated to \/feed/i)).toBeVisible();
    await expect(trail.getByText(/Tapped feed item/i)).toBeVisible();
    await expect(trail.getByText(/GET \/v2\/feed → 200/i)).toBeVisible();
    // Three crumbs frozen on this crash event.
    await expect(trail.getByRole('listitem')).toHaveCount(3);
  });
});
