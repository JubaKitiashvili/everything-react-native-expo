import { expect, test } from '@playwright/test';

/**
 * Selecting a session in the replay list must load that session's frames and
 * render the player. sess-ios-1 is the only seeded session with a captured
 * replay_frame (+ masked UI hierarchy), so selecting it flips the viewer from
 * the empty state to a real frame with playback controls.
 */
test.describe('Session selection → replay frame', () => {
  test('selecting sess-ios-1 renders its replay frame, masked hierarchy, and controls', async ({
    page,
  }) => {
    await page.goto('/sessions');

    const list = page.getByRole('list', { name: /sessions with replay/i });
    await list.getByRole('button', { name: /sess-ios-1/i }).click();

    const viewer = page.getByRole('region', { name: /replay viewer/i });
    // Empty state is gone; a real frame stage is present.
    await expect(viewer.getByText(/no replay frames captured/i)).toHaveCount(0);
    await expect(viewer.getByRole('img', { name: /session replay frame/i })).toBeVisible();

    // The captured UI hierarchy renders, with the secure field masked.
    await expect(viewer.getByText(/Your Feed/i)).toBeVisible();
    await expect(viewer.getByText(/1 masked/i)).toBeVisible();

    // Playback controls are interactive.
    await expect(viewer.getByRole('button', { name: /play replay/i })).toBeVisible();
    await expect(viewer.getByRole('slider', { name: /scrub through replay timeline/i })).toBeVisible();
  });
});
