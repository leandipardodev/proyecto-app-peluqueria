import { expect, type Page } from "@playwright/test";

export async function loginToDashboard(page: Page) {
  const email = process.env.E2E_LOGIN_EMAIL;
  const password = process.env.E2E_LOGIN_PASSWORD;

  if (!email || !password) {
    return { ok: false as const, reason: "missing_credentials" as const };
  }

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/contrasena|contraseña|password/i).fill(password);
  await page.getByRole("button", { name: /ingresar|entrar|iniciar/i }).click();
  await page.waitForURL(/\/dashboard(\/.*)?$/i, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard(\/.*)?$/i);

  return { ok: true as const };
}
