import { expect, test } from "@playwright/test";
import { loginToDashboard, slugDelLocal, prepararPagina, cerrarDialogos } from "./helpers/auth";

/**
 * Smoke de la agenda.
 *
 * Solo cubre lo que se pudo verificar contra el local real. Antes este archivo
 * apuntaba a `/dashboard/appointments`, ruta que ya no tiene `page.tsx` (cae al
 * Inicio) y buscaba un botón "Nuevo turno" con texto; el botón real es un ícono
 * SIN nombre accesible, asi que no hay forma de armar un test honesto, de acá.
 * Ese queda como hueco declarado, no como un test que miente.
 */
test.describe("Critical smoke", () => {
  test("landing and login pages load", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Klip/i);

    await page.goto("/login");
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });

  test("dashboard shell loads for authenticated user", async ({ page }) => {
    await prepararPagina(page);
    const auth = await loginToDashboard(page);
    test.skip(!auth.ok, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run authenticated flow.");

    // Lo que prueba que el Inicio renderizo con datos: las cards de KPI.
    // Antes se buscaba un heading "Inicio", pero Inicio es un item del menu, no
    // un heading. Los items del menu tampoco son <a>: navegan con router.push,
    // asi que tampoco sirven como locator de link.
    await expect(page.getByText(/turnos hoy/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^rendimiento$/i).first()).toBeVisible();
    await expect(page.getByRole("searchbox").first()).toBeVisible();
  });

  test("el calendario renderiza los turnos del período", async ({ page }) => {
    await prepararPagina(page);
    const auth = await loginToDashboard(page);
    test.skip(!auth.ok, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run authenticated flow.");

    const slug = await slugDelLocal(page);
    test.skip(!slug, "No se pudo deducir el slug del local.");

    await page.goto(`/dashboard/${slug}/calendar`);
    await cerrarDialogos(page);
    await expect(page.getByRole("heading", { name: /calendario/i }).first()).toBeVisible({ timeout: 30_000 });

    // El bloque "Próximos turnos" vive en el calendario (antes se buscaba en
    // /dashboard/appointments, que ya no existe).
    await expect(page.getByRole("heading", { name: /pr[oó]ximos turnos/i }).first()).toBeVisible();

    // Los turnos cargan por fetch: contar antes de que terminen da 0 y el test se
    // saltea al azar.
    await page.waitForLoadState("networkidle").catch(() => {});

    // Cada turno es un boton con cliente, hora y servicio: es el locator estable.
    const turnos = page.getByRole("button", { name: /\d{1,2}:\d{2}/ });
    const cantidad = await turnos.count();
    test.skip(cantidad === 0, "El local no tiene turnos en el período visible");
    await expect(turnos.first()).toContainText(/\d{1,2}:\d{2}/);
  });

  test("el filtro por profesional del calendario acota los turnos", async ({ page }) => {
    await prepararPagina(page);
    const auth = await loginToDashboard(page);
    test.skip(!auth.ok, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run authenticated flow.");

    const slug = await slugDelLocal(page);
    test.skip(!slug, "No se pudo deducir el slug del local.");

    await page.goto(`/dashboard/${slug}/calendar`);
    await cerrarDialogos(page);

    const turnos = page.getByRole("button", { name: /\d{1,2}:\d{2}/ });
    await expect(turnos.first()).toBeVisible({ timeout: 30_000 });
    const antes = await turnos.count();

    // Los chips de profesional son botones con el nombre del profesional.
    const chips = page.getByRole("button", { name: /^(lean|luchin|mefis|pable)$/i });
    const cantidadChips = await chips.count();
    test.skip(cantidadChips === 0, "El local no tiene profesionales con filtro visible");

    const primerChip = chips.first();
    await primerChip.click();

    // Al filtrar por un profesional solo quedan sus turnos: el total baja.
    await expect(turnos.first()).toBeVisible({ timeout: 20_000 });
    const despues = await turnos.count();
    expect(despues).toBeLessThan(antes);
  });
});