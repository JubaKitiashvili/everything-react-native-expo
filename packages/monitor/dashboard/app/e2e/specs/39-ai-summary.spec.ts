import { expect, test } from '@playwright/test';

/**
 * AI crash summary (Task 117.9) against the default login-free server, which
 * the e2e fixture configures with a stub AI provider (deterministic response —
 * no live LLM). The browser-WebLLM acceleration path is 🟡 (WebGPU, not
 * headlessly testable); this exercises the server fallback end-to-end.
 */
test.describe('AI crash summary', () => {
  test('Summarize with AI returns a summary into the detail pane', async ({ page }) => {
    await page.goto('/crashes');

    const list = page.getByRole('list', { name: /crash groups/i });
    await list.getByRole('button', { name: /TypeError: Cannot read property/i }).click();

    const summary = page.getByRole('region', { name: /ai summary/i });
    await expect(summary).toBeVisible();
    await summary.getByRole('button', { name: /summarize with ai/i }).click();

    // The stub provider's deterministic response renders.
    await expect(summary.getByText(/null dereference in LoginScreen/i)).toBeVisible();
  });
});
