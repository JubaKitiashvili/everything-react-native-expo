import { expect, test } from '@playwright/test';

const NAV = ['Overview', 'Crashes', 'ANRs', 'Performance', 'Sessions', 'Quality', 'Settings'];

test.describe('App shell + routing', () => {
  test('sidebar renders all 7 sections, Overview active at /', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: /primary navigation/i });
    for (const name of NAV) {
      await expect(nav.getByRole('link', { name })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('clicking a sidebar link navigates and updates the active link', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Crashes' }).click();
    await expect(page).toHaveURL(/\/crashes$/);
    await expect(page.getByRole('heading', { name: /crash explorer/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Crashes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('deep-link refresh on /crashes/:fingerprint resolves via SPA fallback', async ({ page }) => {
    // Full page load straight to a nested route — the server must serve
    // index.html (not 404) and the client router must mount the page.
    await page.goto('/crashes/fp-anything');
    await expect(page.getByRole('heading', { name: /crash explorer/i })).toBeVisible();
  });

  test('each top-level route resolves to its page', async ({ page }) => {
    const checks: [string, RegExp][] = [
      ['/anrs', /anr inspector/i],
      ['/performance', /^Performance$/],
      ['/sessions', /session replay/i],
      ['/quality', /alerts console/i],
      ['/settings', /^Settings$/],
    ];
    for (const [path, heading] of checks) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  test('unknown route redirects to Overview', async ({ page }) => {
    await page.goto('/totally-unknown-route');
    await expect(page.getByRole('heading', { name: /live feed/i })).toBeVisible();
  });

  test('realtime status pill connects', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toContainText(/live|connecting/i);
  });
});
