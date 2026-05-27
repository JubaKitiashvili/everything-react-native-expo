import { expect, test } from '@playwright/test';

/**
 * Bidirectional bug-report reply thread (Task 117.20) against the default
 * login-free server (synthetic Owner satisfies the Member reply gate). The
 * seed includes one report ("Scroll jumps after refresh"); an operator posts
 * a reply and sees it appear in the conversation.
 */
test.describe('Bug-report reply thread', () => {
  test('operator posts a reply and it appears in the thread', async ({ page }) => {
    await page.goto('/quality');

    // The seeded report auto-selects → its detail + reply thread render.
    await expect(page.getByRole('heading', { name: /scroll jumps after refresh/i })).toBeVisible();

    const thread = page.getByRole('region', { name: /reply thread/i });
    await expect(thread).toBeVisible();

    const composer = thread.getByLabel('Reply body');
    await expect(composer).toBeVisible();
    const message = `Looking into it ${Date.now()}`;
    await composer.fill(message);
    await thread.getByRole('button', { name: /^reply$/i }).click();

    // The new operator reply shows in the conversation.
    await expect(thread.getByText(message)).toBeVisible();
  });
});
