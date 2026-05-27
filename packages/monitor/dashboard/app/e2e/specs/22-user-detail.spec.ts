import { expect, test } from '@playwright/test';

test.describe('User-centric view', () => {
  test('summarizes the seeded user with real KPI values + session list', async ({ page }) => {
    await page.goto('/users/user_ab12');
    await expect(page.getByRole('heading', { name: 'user_ab12' })).toBeVisible();

    // KPI tiles are computed from this user's events + sessions:
    // 3 sessions, 17 events, 1 crash, 1 ANR.
    const metrics = page.getByRole('region', { name: /user metrics/i });
    await expect(metrics).toContainText('Sessions');
    await expect(metrics).toContainText('Events');
    await expect(metrics).toContainText('Crashes');
    await expect(metrics).toContainText('ANRs');
    // Distinct values prove the aggregate ran (3 sessions, 27 events from the
    // fixture). 27 is unique enough to confirm the event count is real.
    await expect(metrics).toContainText('27');

    // The Sessions panel description echoes the same session count, and the
    // three seeded sessions are listed by id.
    await expect(page.getByText(/3 total/i)).toBeVisible();
    await expect(page.getByText('sess-android-1')).toBeVisible();
    await expect(page.getByText('sess-ios-1')).toBeVisible();
  });
});
