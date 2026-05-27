import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end sidebar navigation: clicking each section link must change the
 * URL, flip the active (aria-current) link, and mount the destination page —
 * driven entirely through the SPA router (no full reloads). Complements
 * 00-routing, which only checks direct goto() of each route.
 */
const FLOW: Array<{ link: RegExp; url: RegExp; heading: RegExp }> = [
  { link: /^Crashes$/, url: /\/crashes$/, heading: /crash explorer/i },
  { link: /^ANRs$/, url: /\/anrs$/, heading: /anr inspector/i },
  { link: /^Performance$/, url: /\/performance$/, heading: /^Performance$/ },
  { link: /^Sessions$/, url: /\/sessions$/, heading: /session replay/i },
  { link: /^Quality$/, url: /\/quality$/, heading: /alerts console/i },
  { link: /^Settings$/, url: /\/settings$/, heading: /^Settings$/ },
  { link: /^Overview$/, url: /\/$/, heading: /live feed/i },
];

async function clickNav(page: Page, name: RegExp): Promise<void> {
  const nav = page.getByRole('navigation', { name: /primary navigation/i });
  await nav.getByRole('link', { name }).click();
}

test.describe('Sidebar navigation flow', () => {
  test('clicking each section navigates, marks it active, and renders the page', async ({
    page,
  }) => {
    await page.goto('/');

    for (const step of FLOW) {
      await clickNav(page, step.link);
      await expect(page).toHaveURL(step.url);
      // Destination page content rendered.
      await expect(page.getByRole('heading', { name: step.heading }).first()).toBeVisible();
      // Exactly the clicked link carries aria-current.
      await expect(
        page.getByRole('navigation', { name: /primary navigation/i }).getByRole('link', {
          name: step.link,
        }),
      ).toHaveAttribute('aria-current', 'page');
    }
  });
});
