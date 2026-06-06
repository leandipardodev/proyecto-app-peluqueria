import { test, type BrowserContext, type Page } from "@playwright/test";
import { loginToDashboard } from "./helpers/auth";

interface PageMetric {
  page: string;
  user: number;
  ttfb: number;
  fcp: number;
  loadTime: number;
}

const ROUNDS = 3;
const CONCURRENCY = 5;

const PAGES = [
  "/dashboard",
  "/dashboard/calendar",
  "/dashboard/appointments",
  "/dashboard/finances",
];

async function measure(page: Page, url: string, user: number, pageName: string): Promise<PageMetric> {
  const start = Date.now();
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  const loadTime = Date.now() - start;

  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((p) => p.name === "first-contentful-paint");
    return {
      ttfb: nav ? nav.responseStart - nav.requestStart : -1,
      fcp: fcp ? fcp.startTime : -1,
    };
  });

  return { page: pageName, user, ttfb: perf.ttfb, fcp: perf.fcp, loadTime };
}

function report(label: string, metrics: PageMetric[]): void {
  const times = metrics.map((m) => m.loadTime).sort((a, b) => a - b);
  const ttfb = metrics.map((m) => m.ttfb);
  const fcp = metrics.map((m) => m.fcp);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];
  const min = times[0];
  const max = times[times.length - 1];
  const avgTtfb = ttfb.reduce((a, b) => a + b, 0) / ttfb.length;
  const avgFcp = fcp.filter((v) => v > 0).reduce((a, b) => a + b, 0) / fcp.filter((v) => v > 0).length;

  console.log(`  ${label}`);
  console.log(`    Avg: ${avg.toFixed(0)}ms  P95: ${p95}ms  Min: ${min}ms  Max: ${max}ms`);
  console.log(`    TTFB avg: ${avgTtfb.toFixed(0)}ms  FCP avg: ${avgFcp.toFixed(0)}ms`);
}

async function createAuthenticatedPages(browser: any): Promise<{ ctx: BrowserContext; page: Page; index: number }[]> {
  const contexts: { ctx: BrowserContext; page: Page; index: number }[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const auth = await loginToDashboard(page);
    if (!auth.ok) {
      console.log(`  Auth failed for user session ${i}, skipping remaining.`);
      await ctx.close();
      break;
    }
    contexts.push({ ctx, page, index: i });
  }
  return contexts;
}

test.describe("Stress test", () => {
  test("concurrent page load under simulated multi-user stress", async ({ browser }) => {
    const email = process.env.E2E_LOGIN_EMAIL;
    const password = process.env.E2E_LOGIN_PASSWORD;
    test.skip(!email || !password, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD");

    console.log(`\nStress test: ${CONCURRENCY} concurrent users x ${ROUNDS} rounds x ${PAGES.length} pages`);

    const allMetrics: PageMetric[] = [];

    for (let round = 0; round < ROUNDS; round++) {
      const contexts = await createAuthenticatedPages(browser);
      if (contexts.length === 0) {
        console.log("  No authenticated sessions available, aborting.");
        break;
      }

      console.log(`\n--- Round ${round + 1}/${ROUNDS} (${contexts.length} users) ---`);

      for (const pageName of PAGES) {
        const roundMetrics = await Promise.all(
          contexts.map(({ page, index }) => measure(page, pageName, index, pageName))
        );
        allMetrics.push(...roundMetrics);
        report(pageName, roundMetrics);
      }

      for (const { ctx } of contexts) {
        await ctx.close();
      }
    }

    console.log(`\n\n=== AGGREGATE (${ROUNDS} rounds) ===`);
    const pageGroups = [...new Set(allMetrics.map((m) => m.page))];
    for (const pg of pageGroups) {
      const group = allMetrics.filter((m) => m.page === pg);
      report(pg, group);
    }

    const all = allMetrics.map((m) => m.loadTime).sort((a, b) => a - b);
    const allAvg = all.reduce((a, b) => a + b, 0) / all.length;
    const allP95 = all[Math.floor(all.length * 0.95)];
    console.log(`  ALL PAGES`);
    console.log(`    Avg: ${allAvg.toFixed(0)}ms  P95: ${allP95}ms  Min: ${all[0]}ms  Max: ${all[all.length - 1]}ms`);
  });
});
