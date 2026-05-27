import { expect, test } from '@playwright/test';

/**
 * Master→detail selection in the Crash Explorer: clicking a group in the list
 * must drive the detail pane (message, metadata, stack) and the pressed state,
 * and switching groups must swap the detail — proving real wiring, not a
 * statically-rendered first group.
 */
test.describe('Crash Explorer master→detail', () => {
  test('selecting a group updates the detail pane, stack, and pressed state', async ({ page }) => {
    await page.goto('/crashes');

    const list = page.getByRole('list', { name: /crash groups/i });
    const detail = page.getByRole('region', { name: /crash group detail/i });

    // Select the crash group with a stack.
    const typeErrorRow = list.getByRole('button', { name: /TypeError: Cannot read property/i });
    await typeErrorRow.click();
    await expect(typeErrorRow).toHaveAttribute('aria-pressed', 'true');

    // Detail reflects that group: message, top screen, and resolved stack frames.
    await expect(detail).toContainText("TypeError: Cannot read property 'id' of undefined");
    await expect(detail).toContainText('FeedScreen');
    await expect(detail.getByText(/FeedScreen\.renderItem/i)).toBeVisible();
    await expect(detail.getByText(/FeedScreen\.tsx/i).first()).toBeVisible();

    // Switch to the ANR group — detail swaps and the previous row is no longer
    // pressed. The ANR has no stack, so the empty-stack copy appears.
    const anrRow = list.getByRole('button', { name: /ANR on CheckoutScreen\.flush/i });
    await anrRow.click();
    await expect(anrRow).toHaveAttribute('aria-pressed', 'true');
    await expect(typeErrorRow).toHaveAttribute('aria-pressed', 'false');
    await expect(detail).toContainText('ANR on CheckoutScreen.flush()');
    await expect(detail.getByText(/no stack captured for this crash/i)).toBeVisible();
  });
});
