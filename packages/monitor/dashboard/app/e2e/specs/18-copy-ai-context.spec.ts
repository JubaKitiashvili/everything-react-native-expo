import { expect, test } from '@playwright/test';

test.describe('Copy as AI context (crash detail)', () => {
  test('copies a Claude-ready block with the crash message + stack to the clipboard', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/crashes');
    await expect(page.getByRole('heading', { name: /crash explorer/i })).toBeVisible();

    // Select the crash group that actually carries a stack (fp-feed-root).
    // The explorer auto-selects the first group (the ANR) which has no stack,
    // so we click the TypeError row to drive the detail pane to a real crash.
    await page.getByRole('button', { name: /TypeError: Cannot read property/i }).click();

    const detail = page.getByRole('region', { name: /crash group detail/i });
    await expect(detail.getByText(/FeedScreen\.renderItem/i)).toBeVisible();

    const copyButton = page.getByRole('button', { name: /copy as ai context/i });
    await copyButton.click();

    // The button gives "Copied" feedback synchronously after the write.
    await expect(page.getByRole('button', { name: /^copied$/i })).toBeVisible();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    // Must contain the crash message…
    expect(clipboard).toContain("TypeError: Cannot read property 'id' of undefined");
    // …the fingerprint…
    expect(clipboard).toContain('Fingerprint: fp-feed-root');
    // …and the real stack frame from the latest event's payload.
    expect(clipboard).toContain('FeedScreen.renderItem (FeedScreen.tsx:42)');
  });
});
