import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const baseUrl = process.env.PERF_BASE_URL || "http://127.0.0.1:3000";
const email = process.env.E2E_LOGIN_EMAIL;
const password = process.env.E2E_LOGIN_PASSWORD;
const outDir = process.env.PERF_REPORT_DIR || "./.perf-reports-auth";

const routes = (process.env.PERF_AUTH_ROUTES || "/dashboard,/dashboard/calendar,/dashboard/business")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const budget = {
  minScore: Number(process.env.PERF_AUTH_MIN_SCORE || 0.25),
  maxLcp: Number(process.env.PERF_AUTH_MAX_LCP || 14000),
  maxCls: Number(process.env.PERF_AUTH_MAX_CLS || 0.15),
  maxTbt: Number(process.env.PERF_AUTH_MAX_TBT || 7000),
};

async function loginAndGetCookieHeader() {
  if (!email || !password) {
    throw new Error("Missing E2E_LOGIN_EMAIL or E2E_LOGIN_PASSWORD for authenticated performance checks");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/contrasena|contraseña|password/i).fill(password);
  await page.getByRole("button", { name: /ingresar|entrar|iniciar/i }).click();
  await page.waitForURL(/\/dashboard(\/.*)?$/i, { timeout: 30_000 });

  const cookies = await context.cookies();
  await browser.close();

  const url = new URL(baseUrl);
  const host = url.hostname;
  const cookieHeader = cookies
    .filter((cookie) => cookie.domain === host || cookie.domain === `.${host}`)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  if (!cookieHeader) {
    throw new Error("Could not build auth cookie header after login");
  }

  return cookieHeader;
}

async function run() {
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }

  const cookieHeader = await loginAndGetCookieHeader();
  const failures = [];

  for (const route of routes) {
    const safeName = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const reportPath = join(outDir, `${safeName}.json`);
    const headersPath = join(outDir, `${safeName}.headers.json`);
    const url = `${baseUrl}${route}`;

    await writeFile(headersPath, JSON.stringify({ Cookie: cookieHeader }), "utf8");

    execSync(
      `npx lighthouse "${url}" --quiet --chrome-flags="--headless --no-sandbox" --only-categories=performance --disable-storage-reset --extra-headers-path "${headersPath}" --output=json --output-path "${reportPath}"`,
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

    console.log(`[perf-auth] ${route} score=${Math.round(score * 100)} LCP=${Math.round(lcp)} CLS=${cls.toFixed(3)} TBT=${Math.round(tbt)}`);
  }

  if (failures.length > 0) {
    console.error("\nAuthenticated performance budget failed:");
    for (const item of failures) console.error(`- ${item}`);
    process.exit(1);
  }

  console.log("\nAuthenticated performance budget passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
