import { expect, test } from '@playwright/test';

/**
 * Device Switcher selection: the most-recent device (Pixel 9) is selected by
 * default; choosing the iPhone card must flip the pressed state across cards
 * and surface the iPhone's real fingerprint metadata.
 */
test.describe('Device Switcher selection', () => {
  test('selecting a device flips the pressed state and shows its fingerprint', async ({ page }) => {
    await page.goto('/sessions');
    await expect(page.getByRole('heading', { name: /device switcher/i })).toBeVisible();

    const pixel = page.getByRole('article', { name: /device pixel 9 card/i });
    const iphone = page.getByRole('article', { name: /device iphone 16 pro card/i });
    const pixelHead = pixel.getByRole('button').first();
    const iphoneHead = iphone.getByRole('button').first();

    // Default selection lands on the most-recent device.
    await expect(pixelHead).toHaveAttribute('aria-pressed', 'true');
    await expect(iphoneHead).toHaveAttribute('aria-pressed', 'false');

    // Select the iPhone — selection moves, and its fingerprint is shown.
    await iphoneHead.click();
    await expect(iphoneHead).toHaveAttribute('aria-pressed', 'true');
    await expect(pixelHead).toHaveAttribute('aria-pressed', 'false');
    await expect(iphone).toContainText('ios|iphone 16 pro|18.4|1.2.0');
    await expect(iphone.getByText(/×1 crash/i)).toBeVisible();
  });
});
