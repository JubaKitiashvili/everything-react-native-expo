import { expect, test } from '@playwright/test';

test.describe('Copy as AI context (crash detail)', () => {
  test('the copy-as-AI-context button renders on a selected crash group', async ({ page }) => {
    await page.goto('/crashes');
    // CrashExplorer auto-selects the first seeded group, so the detail
    // pane — and its copy button — render.
    await expect(page.getByRole('heading', { name: /crash explorer/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /copy as ai context/i })).toBeVisible();
  });
});
