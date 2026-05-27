import { expect, test, type Page } from '@playwright/test';

/**
 * RBAC end-to-end (Task 117.18) against the SEPARATE enforcing-mode server
 * the fixture boots on PORT+1 (the main PORT server stays login-free for the
 * other specs). Bootstrapped users: owner@e2e.dev / member@e2e.dev /
 * viewer@e2e.dev (see start-server.mjs).
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4174);
const AUTH = `http://127.0.0.1:${PORT + 1}`;

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${AUTH}/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

test.describe('RBAC auth (enforcing server)', () => {
  test('an unauthenticated visit is redirected to the login form', async ({ page }) => {
    await page.goto(`${AUTH}/`);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('a deep link while unauthenticated lands on login, then returns after sign-in', async ({
    page,
  }) => {
    await page.goto(`${AUTH}/settings`);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel(/email/i).fill('owner@e2e.dev');
    await page.getByLabel(/password/i).fill('ownerpass1');
    await page.getByRole('button', { name: /sign in/i }).click();
    // Returns to the originally-requested /settings.
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: /^settings$/i })).toBeVisible();
  });

  test('wrong credentials show an inline error', async ({ page }) => {
    await signIn(page, 'owner@e2e.dev', 'WRONG-password');
    await expect(page.getByRole('alert')).toContainText(/invalid email or password/i);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('owner sees their identity chip + the owner-only Users panel', async ({ page }) => {
    await signIn(page, 'owner@e2e.dev', 'ownerpass1');
    await expect(page.getByText('owner@e2e.dev')).toBeVisible();
    await expect(page.getByText('Owner', { exact: true })).toBeVisible();
    await page.goto(`${AUTH}/settings`);
    await expect(page.getByRole('heading', { name: /users & access/i })).toBeVisible();
  });

  test('viewer does NOT see the owner-only Users panel', async ({ page }) => {
    await signIn(page, 'viewer@e2e.dev', 'viewerpass1');
    await expect(page.getByText('viewer@e2e.dev')).toBeVisible();
    await page.goto(`${AUTH}/settings`);
    // The normal settings panels render…
    await expect(page.getByRole('heading', { name: /consent & privacy/i })).toBeVisible();
    // …but the owner-gated Users panel is absent.
    await expect(page.getByRole('heading', { name: /users & access/i })).toHaveCount(0);
  });

  test('sign out returns to the login form', async ({ page }) => {
    await signIn(page, 'owner@e2e.dev', 'ownerpass1');
    await expect(page.getByText('owner@e2e.dev')).toBeVisible();
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });
});
