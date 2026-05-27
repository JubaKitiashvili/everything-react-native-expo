import { expect, test } from '@playwright/test';

test.describe('Alerts Console panel', () => {
  test('renders the seeded rule config and the fired alert with its metric value', async ({
    page,
  }) => {
    await page.goto('/quality');
    await expect(page.getByRole('heading', { name: /Alerts Console/i })).toBeVisible();

    // The seeded "Crash spike" rule: crash_count ≥ 10 over a 5 min window,
    // delivered to slack, 10 min cooldown — all derived from the stored rule.
    const console_ = page.getByText(/Crash spike/).first();
    await expect(console_).toBeVisible();
    await expect(page.getByText(/crash_count/i).first()).toBeVisible();
    await expect(page.getByText(/≥\s*10/).first()).toBeVisible();
    await expect(page.getByText(/in 5 min/i).first()).toBeVisible();
    await expect(page.getByText(/slack/i).first()).toBeVisible();

    // The seeded firing renders with its critical severity + metric value 14.
    await expect(page.getByText(/metric value 14/i)).toBeVisible();
  });
});
