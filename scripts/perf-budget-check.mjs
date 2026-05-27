import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const baseUrl = process.env.PERF_BASE_URL || "http://127.0.0.1:3000";
const routes = (process.env.PERF_ROUTES || "/,/login,/register")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const budget = {
  minScore: Number(process.env.PERF_MIN_SCORE || 0.35),
  maxLcp: Number(process.env.PERF_MAX_LCP || 12000),
  maxCls: Number(process.env.PERF_MAX_CLS || 0.1),
  maxTbt: Number(process.env.PERF_MAX_TBT || 5000),
};

const outDir = process.env.PERF_REPORT_DIR || "./.perf-reports";

async function run() {
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }

  const failures = [];

  for (const route of routes) {
    const safeName = route === "/" ? "home" : route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const reportPath = join(outDir, `${safeName}.json`);
    const url = `${baseUrl}${route}`;

    execSync(
      `npx lighthouse "${url}" --quiet --chrome-flags="--headless --no-sandbox" --only-categories=performance --output=json --output-path "${reportPath}"`,
      { stdio: "inherit" }
    );

    const parsed = JSON.parse(await readFile(reportPath, "utf8"));

    if (parsed.runtimeError) {
      failures.push(`${route}: runtimeError ${parsed.runtimeError.code}`);
      continue;
    }

    const score = Number(parsed?.categories?.performance?.score || 0);
    const lcp = Number(parsed?.audits?.["largest-contentful-paint"]?.numericValue || 0);
    const cls = Number(parsed?.audits?.["cumulative-layout-shift"]?.numericValue || 0);
    const tbt = Number(parsed?.audits?.["total-blocking-time"]?.numericValue || 0);

    if (score < budget.minScore) failures.push(`${route}: performance score ${score.toFixed(2)} < ${budget.minScore}`);
    if (lcp > budget.maxLcp) failures.push(`${route}: LCP ${Math.round(lcp)} > ${budget.maxLcp}`);
    if (cls > budget.maxCls) failures.push(`${route}: CLS ${cls.toFixed(3)} > ${budget.maxCls}`);
    if (tbt > budget.maxTbt) failures.push(`${route}: TBT ${Math.round(tbt)} > ${budget.maxTbt}`);

    console.log(`[perf] ${route} score=${Math.round(score * 100)} LCP=${Math.round(lcp)} CLS=${cls.toFixed(3)} TBT=${Math.round(tbt)}`);
  }

  if (failures.length > 0) {
    console.error("\nPerformance budget failed:");
    for (const item of failures) console.error(`- ${item}`);
    process.exit(1);
  }

  console.log("\nPerformance budget passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
