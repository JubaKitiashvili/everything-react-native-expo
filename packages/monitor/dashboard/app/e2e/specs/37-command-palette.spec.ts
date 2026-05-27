import { expect, test, type Page } from '@playwright/test';

/**
 * Cmd/Ctrl-K global command palette (Task 117.14) against the default
 * login-free server. Verifies the shortcut opens it, search filters real
 * seeded data, and selecting a result navigates.
 */

/** Open the palette: wait for the app shell to mount (so the global keydown
 *  listener is attached) before firing the shortcut. */
async function openPalette(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: /command palette/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Command palette', () => {
  test('Cmd-K opens it and jumps to a page', async ({ page }) => {
    const dialog = await openPalette(page);
    // The palette input is identified by its unique placeholder (the overview
    // page has its own "Search" box, so aria-label alone is ambiguous).
    await dialog.getByPlaceholder(/Search crashes/i).fill('performance');
    await dialog.getByRole('option', { name: /Performance/i }).first().click();
    await expect(page).toHaveURL(/\/performance$/);
    await expect(dialog).toHaveCount(0); // closed on select
  });

  test('searches seeded sessions and opens the session detail', async ({ page }) => {
    const dialog = await openPalette(page);
    await dialog.getByPlaceholder(/Search crashes/i).fill('sess-');
    const option = dialog.getByRole('option').first();
    await expect(option).toBeVisible();
    await option.click();
    await expect(page).toHaveURL(/\/sessions\//);
  });

  test('Escape dismisses the palette', async ({ page }) => {
    const dialog = await openPalette(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
