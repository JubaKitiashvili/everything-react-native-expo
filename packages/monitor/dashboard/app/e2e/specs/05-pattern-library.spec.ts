import { expect, test } from '@playwright/test';

test.describe('Pattern Library panel', () => {
  test('lists the 20 built-in patterns and the "Learned only" filter empties it', async ({
    page,
  }) => {
    await page.goto('/quality');
    await expect(page.getByRole('heading', { name: /Pattern Library/i })).toBeVisible();

    // Summary reflects the real catalogue: 20 built-ins, none matched yet.
    await expect(page.getByText(/0\/0 matched above threshold · 20 total/i)).toBeVisible();

    const entries = page.getByRole('list', { name: /pattern library entries/i });
    await expect(entries).toBeVisible();
    await expect(entries.getByRole('listitem')).toHaveCount(20);
    await expect(entries.getByText(/Unhandled promise rejection/i)).toBeVisible();

    // Filtering to "Learned only" hides every built-in → empty state, since the
    // seed has no learned patterns. Proves the filter wires through to the list.
    await page.getByText(/learned only/i).click();
    await expect(page.getByText(/no patterns match the current filter/i)).toBeVisible();
    await expect(entries).toHaveCount(0);
  });
});
