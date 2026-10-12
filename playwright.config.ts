import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Siempre 1 worker, tambien en local. Los specs entran con la MISMA cuenta y
  // pegan al mismo dev server: con 4 workers en paralelo los logins se pisan y
  // los tests fallan por timeout sin que haya ningun bug. Ademas el CI ya
  // corria en 1, asi que local y remoto son identicos.
  workers: 1,
  // Ademas del reporte humano, uno JSON: `scripts/check-e2e-report.mjs` lo lee
  // para fallar si los tests se saltearon todos. Con solo el reporte HTML, un
  // E2E enteramente skipeado salia con codigo 0 y el gate quedaba en verde.
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never" }],
        ["json", { outputFile: ".playwright-report.json" }],
      ]
    : [["list"], ["html", { open: "never" }], ["json", { outputFile: ".playwright-report.json" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
