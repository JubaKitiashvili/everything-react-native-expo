import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG 2.1 AA audit (Task 117.84).
 *
 * For each top-level route we run axe-core with the WCAG 2.0/2.1 A + AA rule
 * tags and assert ZERO violations of impact `serious` or `critical`. Minor /
 * moderate / needs-review findings are intentionally NOT failed on (they are
 * logged instead) so cosmetic noise can't block the suite — but real,
 * high-impact barriers must be fixed at the source, never filtered away.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

interface RouteCase {
  path: string;
  /** A heading we wait for so the page has settled before scanning. */
  heading: RegExp;
}

const ROUTES: RouteCase[] = [
  { path: '/', heading: /live feed/i },
  { path: '/crashes', heading: /crash explorer/i },
  { path: '/anrs', heading: /anr inspector/i },
  { path: '/performance', heading: /^Performance$/ },
  { path: '/sessions', heading: /session replay/i },
  { path: '/quality', heading: /alerts console/i },
  { path: '/settings', heading: /^Settings$/ },
];

async function gotoAndSettle(page: Page, route: RouteCase): Promise<void> {
  await page.goto(route.path);
  // First heading match is enough to know the page mounted with data.
  await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
}

for (const route of ROUTES) {
  test(`a11y: ${route.path} has no serious/critical WCAG 2.1 AA violations`, async ({ page }, testInfo) => {
    await gotoAndSettle(page, route);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    // Surface moderate/minor findings for visibility without failing on them.
    const nonBlocking = results.violations.filter((v) => !BLOCKING_IMPACTS.has(v.impact ?? ''));
    if (nonBlocking.length > 0) {
      const summary = nonBlocking
        .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
        .join('\n');
      testInfo.annotations.push({
        type: 'a11y-non-blocking',
        description: `${route.path}\n${summary}`,
      });
      console.log(`[a11y][${route.path}] non-blocking findings:\n${summary}`);
    }

    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''));
    const detail = blocking
      .map((v) => {
        const targets = v.nodes
          .map((n) => `      - ${n.target.join(' ')}`)
          .join('\n');
        return `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.helpUrl}\n${targets}`;
      })
      .join('\n');

    expect(blocking, `Serious/critical WCAG violations on ${route.path}:\n${detail}`).toEqual([]);
  });
}
