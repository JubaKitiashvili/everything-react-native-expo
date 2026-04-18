import { expect, test } from '@playwright/test';

test.describe('Replay Masker panel', () => {
  test('renders the demo hierarchy with some nodes already masked', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Replay Masker/i })).toBeVisible();
    const tree = page.getByRole('list', { name: /hierarchy preview/i });
    await expect(tree).toBeVisible();
    // cvv field is masked by default (secureTextEntry + nativeID match).
    await expect(tree.locator('[data-node-id="cvv"]')).toHaveAttribute('data-masked', 'true');
  });
});
