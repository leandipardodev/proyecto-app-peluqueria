import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loginToDashboard } from "./helpers/auth";

// La version sale de package.json y no de `src/lib/app-version.ts` porque ese
// archivo importa `package.json` con un atributo de import que ESM no acepta.
const APP_VERSION = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version;

/**
 * El modal de novedades (`ReleaseNotesModal`) aparece en la primera carga de
 * cada version y es un overlay `role="dialog"` que intercepta TODOS los clics de
 * la pagina. Se lo marca como visto antes de que cargue, con la misma clave que
 * usa el componente. Sin esto, ningun test que toque algo puede pasar, y
 * cerrarlo a mano es una carrera: el modal se monta en un useEffect y puede
 * aparecer despues del primer chequeo.
 */
async function prepararPagina(page: Page): Promise<void> {
  await page.addInitScript((version) => {
    try {
      window.localStorage.setItem(`klip_release_notes_seen_${version}`, "1");
    } catch {
      /* sin localStorage no hay nada que hacer */
    }
  }, APP_VERSION);
}

/** Red de seguridad por si el modal llegara a aparecer igual. */
async function cerrarDialogos(page: Page): Promise<void> {
  for (let intento = 0; intento < 5; intento++) {
    const dialogo = page.getByRole("dialog");
    if ((await dialogo.count()) === 0) return;
    const cerrar = dialogo.getByRole("button", { name: /entendido|cerrar|close|✕|×/i }).first();
    if ((await cerrar.count()) > 0) await cerrar.click({ timeout: 5_000 }).catch(() => {});
    else await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
  }
}

/**
 * Caja / Finanzas.
 *
 * SOLO LECTURA: nada de esto escribe en la base. No se aprieta Pagar, ni Cerrar
 * caja, ni se confirma Calcular, asi que el local de pruebas queda como estaba.
 * Lo que se prueba es el comportamiento de la interfaz: el filtro que se
 * despliega por proximidad, el switch que cicla, los botones que se encienden
 * solos, el check que solo aparece al marcar y el Historial.
 */

/**
 * El slug se saca de la URL a la que deja el login (`/dashboard/<slug>`) en vez
 * de hardcodear "klip": asi el mismo spec corre contra cualquier local de
 * pruebas. Tampoco se entra por `/dashboard/finances`, que es una ruta legacy
 * que depende de la redireccion del middleware para caer en la pantalla correcta.
 */
async function gotoFinances(page: Page): Promise<boolean> {
  const auth = await loginToDashboard(page);
  if (!auth.ok) return false;

  // El login pasa por `/dashboard` antes de `/dashboard/<slug>`. Hay que
  // esperar la que YA tiene slug: si se lee el slug en `/dashboard` sale
  // undefined y el test se saltea sin avisar.
  await page.waitForURL(/\/dashboard\/[^/]+/i, { timeout: 30_000, waitUntil: "commit" });
  const slug = new URL(page.url()).pathname.split("/").filter(Boolean)[1];
  test.skip(!slug, "No se pudo deducir el slug del local desde la URL del login.");

  await page.goto(`/dashboard/${slug}/finances`);
  await cerrarDialogos(page);
  await expect(page.getByRole("heading", { name: /finanzas/i }).first()).toBeVisible({ timeout: 20_000 });
  // La pagina es un Server Component con un bundle grande: si se interactua antes
  // de que hidrate, el click y el fill se pierden en el piso y el test falla sin
  // que haya ningun bug. Con carga completa los tests son estables.
  await page.waitForLoadState("networkidle").catch(() => {});
  return true;
}

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
});

async function skipIfNoAuth(page: Page): Promise<boolean> {
  const ok = await gotoFinances(page);
  test.skip(!ok, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run authenticated flow.");
  return ok;
}

test.describe("Caja · filtro de período", () => {
  test("el chip dice el período y se despliega con el mouse", async ({ page }) => {
    await skipIfNoAuth(page);

    // Plegado: una sola palabra de período mas las fechas.
    const chip = page.getByRole("button", { name: /filtrar|hoy|semana|octubre|septiembre|noviembre|diciembre|enero|febrero|marzo|abril|mayo|junio|agosto/i }).first();
    await expect(chip).toBeVisible();

    // "Período" solo existe cuando el panel esta abierto.
    await expect(page.getByText(/^Período$/)).toHaveCount(0);

    await chip.hover();
    await expect(page.getByText(/^Período$/)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Día", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Semana", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mes", exact: true })).toBeVisible();

    // Al alejar el mouse se pliega.
    await page.mouse.move(5, 5);
    await expect(page.getByText(/^Período$/)).toHaveCount(0, { timeout: 5_000 });
  });

  test("cambiar el período cambia los KPI de la página", async ({ page }) => {
    await skipIfNoAuth(page);

    const ingresos = page.locator("p", { hasText: /^Ingresos$/i }).first();
    const balance = page.locator("p", { hasText: /^Balance$/i }).first();
    await expect(ingresos).toBeVisible();
    await expect(balance).toBeVisible();

    const chip = page.getByRole("button", { name: /filtrar|hoy|semana|octubre|septiembre|noviembre|diciembre|enero|febrero|marzo|abril|mayo|junio|agosto/i }).first();
    await chip.hover();
    await page.getByRole("button", { name: "Semana", exact: true }).click();

    // El panel NO se cierra solo al elegir: sigue abierto porque el mouse sigue
    // encima y el filtro es por proximidad. Se cierra al alejar el puntero.
    await page.mouse.move(5, 5);
    await expect(page.getByText(/^Período$/)).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByRole("button", { name: /esta semana/i })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Caja · agregar movimiento", () => {
  test("el switch cicla Ingreso, Gasto y Retiro con un toque", async ({ page }) => {
    await skipIfNoAuth(page);

    const sw = page.getByRole("button", { name: /tipo de movimiento/i });
    await expect(sw).toBeVisible();

    // El aria-label dice cuál está activo: se cicla con un toque por paso.
    await expect(sw).toHaveAttribute("aria-label", /Ingreso/);
    await sw.click();
    await expect(sw).toHaveAttribute("aria-label", /Gasto/);
    await sw.click();
    await expect(sw).toHaveAttribute("aria-label", /Retiro/);
    await sw.click();
    await expect(sw).toHaveAttribute("aria-label", /Ingreso/);
  });

  test("Agregar y Cerrar caja arrancan apagados y se encienden al completar", async ({ page }) => {
    await skipIfNoAuth(page);

    const agregar = page.getByRole("button", { name: "Agregar", exact: true });
    const categoria = page.getByPlaceholder("Categoria");
    const monto = page.getByPlaceholder("Monto");

    // Apagados: sin categoría ni monto no hay nada que guardar.
    await expect(agregar).toBeDisabled();

    // `fill` sobre un input controlado de React a veces no llega al estado en el
    // mismo tick. `toHaveValue` DESPUES de escribir separa las dos causas: si el
    // input tiene el valor y el boton sigue apagado, el bug es de la app; si no
    // lo tiene, es del test.
    await categoria.fill("Insumos");
    await expect(categoria).toHaveValue("Insumos");
    await expect(agregar).toBeDisabled();

    await monto.fill("0");
    await expect(monto).toHaveValue("0");
    await expect(agregar).toBeDisabled();

    await monto.clear();
    await monto.pressSequentially("1500");
    await expect(monto).toHaveValue("1500");
    await expect(agregar).toBeEnabled();

    // Volver a vaciar los apaga de nuevo.
    await categoria.fill("");
    await expect(categoria).toHaveValue("");
    await expect(agregar).toBeDisabled();

    const cerrar = page.getByRole("button", { name: /cerrar caja/i });
    if (await cerrar.count()) {
      await expect(cerrar).toBeDisabled();
      await page.getByPlaceholder("Efectivo contado al cierre").fill("80000");
      await expect(cerrar).toBeEnabled();
    }
  });
});

test.describe("Caja · equipo y pagos", () => {
  test("el check solo aparece al marcar y Calcular aparece con alguien marcado", async ({ page }) => {
    await skipIfNoAuth(page);

    const tabla = page.locator("table").first();
    test.skip((await tabla.count()) === 0, "El local no tiene equipo para marcar");

    const filas = tabla.locator("tbody tr");
    const total = await filas.count();
    test.skip(total === 0, "El local no tiene filas de equipo");

    // Sin marcar: ni check visible ni botón Calcular.
    await expect(page.getByRole("button", { name: /^Calcular/ })).toHaveCount(0);

    const fila = filas.first();
    await expect(fila.locator("svg")).toHaveCount(0);

    // Marcar dibuja el trazo del check y hace aparecer Calcular.
    await fila.click();
    await expect(fila.locator("svg")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Calcular/ })).toBeVisible();

    // Desmarcar lo saca de nuevo.
    await fila.click();
    await expect(fila.locator("svg")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Calcular/ })).toHaveCount(0);
  });

  test("el Historial abre y muestra el detalle turno a turno", async ({ page }) => {
    await skipIfNoAuth(page);

    const historial = page.getByRole("button", { name: /historial/i });
    test.skip((await historial.count()) === 0, "Sin botón Historial (rol sin permisos)");

    await historial.click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal.getByText(/historial de pagos/i)).toBeVisible();

    const liquidaciones = modal.locator("li");
    const vacio = modal.getByText(/todavia no liquidaste a nadie/i);
    // El modal abre antes de que responda la consulta del historial: hay que
    // esperar a UNA de las dos salidas, o se cuenta 0 sobre una lista que todavia
    // no cargo y el test se saltea solo.
    await expect(liquidaciones.first().or(vacio).first()).toBeVisible({ timeout: 20_000 });

    const total = await liquidaciones.count();
    test.skip(total === 0, "El local todavía no tiene liquidaciones");

    // La primera trae su detalle de turnos al abrirla.
    const fila = liquidaciones.first();
    const boton = fila.locator("button").first();
    await boton.click();

    // O bien la lista de turnos, o bien el aviso de que no tiene.
    await expect(fila.getByText(/Corte|Alisado|Tintura|Fade|Ondas|Servicio|\$/i).first()).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
  });
});

test.describe("Caja · modo oscuro y móvil", () => {
  test("no se rompe en 375px ni en dark mode", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await skipIfNoAuth(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(page.getByRole("heading", { name: /finanzas/i }).first()).toBeVisible({ timeout: 20_000 });

    // Nada debe desbordar horizontalmente en un viewport angosto.
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(desborde).toBeLessThanOrEqual(2);
  });
});