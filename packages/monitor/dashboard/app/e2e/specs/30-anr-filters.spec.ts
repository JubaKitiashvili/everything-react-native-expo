import { expect, test } from '@playwright/test';

/**
 * The ANR list's duration filter must actually narrow the table and surface a
 * clean empty state when nothing matches. The seed has one ANR at 9.4 s, which
 * lands in the 5–10 s bucket and outside the ≥ 20 s bucket.
 */
test.describe('ANR Inspector filters', () => {
  test('duration filter narrows the list and shows an empty state when nothing matches', async ({
    page,
  }) => {
    await page.goto('/anrs');
    await expect(page.getByRole('heading', { name: /anr inspector/i })).toBeVisible();

    const durationFilter = page.getByLabel(/filter by duration/i);

    // Filtering to ≥ 20 s excludes the 9.4 s ANR → empty state, count "0 of 1".
    await durationFilter.selectOption({ label: '≥ 20 s' });
    await expect(page.getByText(/no anrs match the current filters/i)).toBeVisible();
    await expect(page.getByText(/0 of 1/)).toBeVisible();

    // Filtering to 5–10 s includes it → the CheckoutScreen row reappears.
    await durationFilter.selectOption({ label: '5–10 s' });
    await expect(page.getByText(/1 of 1/)).toBeVisible();
    const table = page.getByRole('table', { name: /anr list table/i });
    await expect(table.getByText(/CheckoutScreen/i)).toBeVisible();
    await expect(table.getByText(/9\.4 s/)).toBeVisible();
  });
});
