import { expect, test } from '@playwright/test';

/**
 * Symbolication round-trip: resolving an obfuscated symbol against the seeded
 * ProGuard mapping must return the deobfuscated frame. The seed maps
 * `com.example.app.MainActivity -> a.b.c` with `onCreate(...) -> e`, so the
 * default symbol `a.b.c.e` should resolve to the real method. Complements
 * 09-symbolication, which only checks the artefact appears in history.
 */
test.describe('Symbolication — resolve frame', () => {
  test('resolves a seeded ProGuard symbol to its deobfuscated frame', async ({ page }) => {
    await page.goto('/crashes');

    const resolver = page.getByRole('region', { name: /frame resolver/i });
    await expect(resolver).toBeVisible();

    // The artefact picker defaults to the seeded android mapping; the symbol
    // input defaults to a.b.c.e (class a.b.c + method e).
    await resolver.getByRole('button', { name: /^resolve$/i }).click();

    const result = page.getByLabel(/resolve result/i);
    await expect(result).toBeVisible();
    await expect(result.getByText(/^Resolved$/)).toBeVisible();
    await expect(result).toContainText('com.example.app.MainActivity.onCreate(android.os.Bundle)');
  });
});
