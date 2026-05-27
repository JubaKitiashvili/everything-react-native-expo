import { expect, test } from '@playwright/test';

test.describe('DORA panel', () => {
  test('renders all four metric cards with values derived from the seed', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /^DORA Metrics$/ })).toBeVisible();

    // Four labelled metric cards must all render.
    await expect(page.getByLabel(/MTTR metric card/i)).toBeVisible();
    const cfr = page.getByLabel(/Change Failure Rate metric card/i);
    const freq = page.getByLabel(/Deploy Frequency metric card/i);
    await expect(cfr).toBeVisible();
    await expect(freq).toBeVisible();
    await expect(page.getByLabel(/Lead Time.*metric card/i)).toBeVisible();

    // Derived values: the seed's single app/runtime version → "1 deploys",
    // and with no resolved crashes the change-failure rate is 0%.
    await expect(cfr).toContainText('0%');
    await expect(freq).toContainText(/deploys/i);
  });
});
