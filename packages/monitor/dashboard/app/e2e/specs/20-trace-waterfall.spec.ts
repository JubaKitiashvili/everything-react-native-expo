import { expect, test } from '@playwright/test';

test.describe('Trace Waterfall panel', () => {
  test('renders the seeded span tree and reveals span detail on selection', async ({ page }) => {
    await page.goto('/performance');
    await expect(page.getByRole('heading', { name: /trace waterfall/i })).toBeVisible();

    // Trace meta summarises the seeded AppStartup trace: 5 spans, 1.24 s total.
    await expect(page.getByText(/5 spans · 1\.24 s/i)).toBeVisible();

    // Child spans render with their real durations.
    await expect(page.getByText(/JS bundle eval/i)).toBeVisible();
    await expect(page.getByText(/GET \/v2\/feed/i)).toBeVisible();

    // Selecting the fetch span surfaces its detail with the real url + status
    // attributes captured on the span — not a static heading.
    await page.getByRole('button', { name: 'GET /v2/feed', exact: true }).click();
    const detail = page.getByLabel(/span detail/i);
    await expect(detail).toContainText('420 ms');
    await expect(detail).toContainText('https://api.example.com/v2/feed');
    await expect(detail).toContainText('200');
  });
});
