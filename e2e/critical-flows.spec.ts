import { expect, test } from "@playwright/test";
import { loginToDashboard } from "./helpers/auth";

test.describe("Critical smoke", () => {
  test("landing and login pages load", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Klip/i);

    await page.goto("/login");
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });

  test("dashboard shell loads for authenticated user", async ({ page }) => {
    const auth = await loginToDashboard(page);
    test.skip(!auth.ok, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run authenticated flow.");
    await expect(page.getByText(/plan|dashboard|resumen/i).first()).toBeVisible();
  });

  test("can open manual appointment modal", async ({ page }) => {
    const auth = await loginToDashboard(page);
    test.skip(!auth.ok, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run authenticated flow.");

    await page.goto("/dashboard/appointments");
    await page.getByRole("button", { name: /nuevo turno/i }).click();
    await expect(page.getByRole("heading", { name: /nuevo turno/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /crear turno/i })).toBeVisible();
  });

  test("appointments list shows payment action area", async ({ page }) => {
    const auth = await loginToDashboard(page);
    test.skip(!auth.ok, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run authenticated flow.");

    await page.goto("/dashboard/appointments");
    await expect(page.getByText(/proximos turnos/i)).toBeVisible();
    await expect(page.locator("table, [class*='space-y-3']").first()).toBeVisible();
  });

  test("can create appointment when required data exists", async ({ page }) => {
    const auth = await loginToDashboard(page);
    test.skip(!auth.ok, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run authenticated flow.");

    await page.goto("/dashboard/appointments");
    await page.getByRole("button", { name: /nuevo turno/i }).click();
    await expect(page.getByRole("heading", { name: /nuevo turno/i })).toBeVisible();

    const selectButtons = page.locator("form#appointment-form button").filter({ hasText: /seleccionar cliente|asignar staff|seleccionar servicio/i });
    const selectCount = await selectButtons.count();
    test.skip(selectCount < 3, "No se encontraron selects esperados del formulario");

    const customerSelect = selectButtons.nth(0);
    await customerSelect.click();
    const customerOptions = page.locator("div.absolute.z-50.mt-1\.5.w-full button");
    const customerOptionCount = await customerOptions.count();
    test.skip(customerOptionCount === 0, "No hay clientes para crear turno en E2E");
    await customerOptions.first().click();

    const serviceSelect = selectButtons.nth(2);
    await serviceSelect.click();
    const serviceOptions = page.locator("div.absolute.z-50.mt-1\.5.w-full button");
    const serviceOptionCount = await serviceOptions.count();
    test.skip(serviceOptionCount === 0, "No hay servicios para crear turno en E2E");
    await serviceOptions.first().click();

    await page.getByLabel(/fecha/i).fill("2030-01-15");
    await page.getByLabel(/hora inicio/i).fill("10:00");

    await page.getByRole("button", { name: /crear turno/i }).click();
    await expect(page.getByRole("heading", { name: /nuevo turno/i })).toBeHidden({ timeout: 15_000 });
  });

  test("can trigger payment link generation flow", async ({ page }) => {
    const auth = await loginToDashboard(page);
    test.skip(!auth.ok, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run authenticated flow.");

    await page.goto("/dashboard/appointments");

    const cobrarButtons = page.getByRole("button", { name: /cobrar/i });
    const cobrarCount = await cobrarButtons.count();
    test.skip(cobrarCount === 0, "No hay turnos impagos con accion Cobrar disponible para este usuario.");

    await cobrarButtons.first().click();

    await Promise.race([
      expect(page.getByRole("button", { name: /generando/i }).first()).toBeVisible({ timeout: 10_000 }),
      expect(page.getByRole("link", { name: /link/i }).first()).toBeVisible({ timeout: 10_000 }),
    ]);

    await expect(page.getByRole("link", { name: /link/i }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("can change appointment status from calendar detail", async ({ page }) => {
    const auth = await loginToDashboard(page);
    test.skip(!auth.ok, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run authenticated flow.");

    await page.goto("/dashboard/calendar");

    const appointmentPill = page.locator("div.group.cursor-pointer").first();
    const pillCount = await page.locator("div.group.cursor-pointer").count();
    test.skip(pillCount === 0, "No hay turnos visibles en calendario para validar cambio de estado.");

    await appointmentPill.click();
    await expect(page.getByRole("heading", { name: /detalle del turno/i })).toBeVisible();

    const primaryStatusAction = page.getByRole("button", { name: /confirmar|completar/i }).first();
    const actionCount = await page.getByRole("button", { name: /confirmar|completar/i }).count();
    test.skip(actionCount === 0, "El turno elegido ya no tiene transicion de estado disponible.");

    await primaryStatusAction.click();
    await expect(page.getByText(/confirmado|completado/i).first()).toBeVisible({ timeout: 12_000 });
  });
});
