import { expect, test } from '@playwright/test';

test.describe('Performance panel', () => {
  test('renders real seeded FPS / CPU+memory / Fabric / startup values (not just headings)', async ({
    page,
  }) => {
    await page.goto('/performance');
    await expect(page.getByRole('heading', { name: /^Performance$/ })).toBeVisible();

    // FPS chart: the seed has 3 dual_thread_fps samples, so the legend reports
    // the computed averages — proving the chart actually consumed the data.
    const fps = page.getByRole('region', { name: /dual-thread fps/i });
    await expect(fps.getByText(/JS \d+(\.\d+)? fps/)).toBeVisible();
    await expect(fps.getByText(/UI \d+(\.\d+)? fps/)).toBeVisible();
    // The "not enough samples" empty state must NOT be present.
    await expect(fps.getByText(/not enough fps samples/i)).toHaveCount(0);

    // CPU + memory: last seeded native_metrics sample is cpu 27%, mem 312 MB.
    const resource = page.getByRole('region', { name: /cpu and memory/i });
    await expect(resource.getByText(/Memory 312\.0 MB/)).toBeVisible();
    await expect(resource.getByText(/CPU 27\.0%/)).toBeVisible();

    // Fabric histogram: 3 seeded commits (4ms, 12ms, 42ms) → "3 commits in window".
    const fabric = page.getByRole('region', { name: /fabric commit latency/i });
    await expect(fabric.getByText(/3 commits in window/i)).toBeVisible();

    // Startup waterfall: one cold start at 820 ms with named phases.
    const startup = page.getByRole('region', { name: /startup waterfall/i });
    await expect(startup.getByText(/cold start/i)).toBeVisible();
    await expect(startup.getByText(/820 ms/)).toBeVisible();
  });
});
