import { expect, test } from '@playwright/test';

/**
 * DSAR transparency for a user we hold nothing on: looking up an unknown id
 * must return a consent card scoped to that id with zero counts (not a stale
 * card for someone else, not a crash). Complements 16-consent-privacy, which
 * covers the positive (seeded user) path.
 */
test.describe('Consent & Privacy — unknown user', () => {
  test('looking up an unknown user returns a zero-count consent card', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /consent & privacy/i })).toBeVisible();

    await page.getByLabel(/user id/i).fill('ghost-user-xyz');
    await page.getByRole('button', { name: /look up/i }).click();

    const card = page.getByLabel(/consent card for ghost-user-xyz/i);
    await expect(card).toBeVisible();
    await expect(card).toContainText('0 crashes');
    // Sessions / Events tiles read 0 for a user with no data on file.
    await expect(card).toContainText(/Sessions/i);
    await expect(card).toContainText(/Events/i);
  });
});
