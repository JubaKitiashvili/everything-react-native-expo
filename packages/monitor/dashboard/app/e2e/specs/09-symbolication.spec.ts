import { expect, test } from '@playwright/test';

test.describe('Symbolication panel', () => {
  test('renders the Symbolication heading with the seeded ProGuard artefact in history', async ({
    page,
  }) => {
    await page.goto('/crashes');
    await expect(page.getByRole('heading', { name: /^Symbolication$/ })).toBeVisible();
    await expect(page.getByText(/mapping\.txt/).first()).toBeVisible();
  });
});
