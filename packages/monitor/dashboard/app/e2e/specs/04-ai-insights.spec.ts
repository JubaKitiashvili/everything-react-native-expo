import { expect, test } from '@playwright/test';

test.describe('AI Insights panel', () => {
  test('derives agent-fix-success counts from the two seeded crash groups', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /AI Insights/i })).toBeVisible();

    // Two seeded crash groups: fp-feed-root has an aiSuggestion (suggested but
    // unresolved → "still open"), fp-anr-checkout has none ("without
    // suggestion"). Neither is resolved, so the breakdown is fully derived data.
    const success = page.getByRole('region', { name: /agent fix success/i });
    await expect(success).toContainText('0 resolved');
    await expect(success).toContainText('1 still open');
    await expect(success).toContainText('1 without suggestion');

    // MTTR card splits agent vs human; with no resolved crashes both read
    // 0 samples — a concrete derived value, not just a heading.
    const mttr = page.getByRole('region', { name: /mean time to resolution/i });
    await expect(mttr.getByText(/agent/i).first()).toBeVisible();
    await expect(mttr.getByText(/0 samples/).first()).toBeVisible();
  });
});
