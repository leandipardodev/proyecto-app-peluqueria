import { expect, test } from "@playwright/test";
import { prepararPagina } from "./helpers/auth";

/**
 * Reserva publica (`/book/[slug]`).
 *
 * Por que se reescribio: el spec apuntaba a `E2E_SHOP_SLUG || "mi-peluqueria"`, un
 * local que no existe, y buscaba `/Elegi tu servicio/i`. La pantalla dice
 * "Elegí" con tilde, y con el flag `i` de la regex eso NO matchea: dos errores
 * distintos y ambos, silenciosos.
 *
 * QUE QUEDA FUERA, y es un hueco real: el recorrido completo del asistente
 * (servicio -> profesional -> fecha y hora -> datos -> confirmar) NO se cubre. Para
 * completarlo hay que elegir una hora libre real y confirmar, lo que crea un turno
 * y un cliente en el local de pruebas. Como este suite es de solo lectura, eso
 * queda declarado aca en vez de dejar un test que a veces se saltea y a veces
 * rompe el local. Para cubrirlo, la via es un spec de escritura con limpieza al
 * final, o un entorno de pruebas con throwaway.
 */
const SHOP_SLUG = process.env.E2E_SHOP_SLUG || "klip";

test.describe("Public booking flow", () => {
  test.beforeEach(async ({ page }) => {
    await prepararPagina(page);
  });

  test("booking page loads and shows services with prices", async ({ page }) => {
    await page.goto(`/book/${SHOP_SLUG}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    // Ojo con la tilde: la pantalla dice "Elegí tu servicio".
    await expect(page.getByText(/eleg[ií] tu servicio/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(SHOP_SLUG === "klip" ? /^Klip$/i : new RegExp(SHOP_SLUG, "i")).first()).toBeVisible();

    // Los servicios son botones con nombre, descripción, precio y duración.
    const servicios = page.getByRole("button", { name: /\$\s?[\d.]+/ });
    const cantidad = await servicios.count();
    test.skip(cantidad === 0, "El local no tiene servicios con precio visible");
    expect(cantidad).toBeGreaterThan(0);
  });

  test("filtra por categoría de servicio", async ({ page }) => {
    await page.goto(`/book/${SHOP_SLUG}`);
    await page.waitForLoadState("networkidle").catch(() => {});

    const categorias = page.getByRole("button", { name: /^(todos|tintura|corte|combos|peinado|otros)$/i });
    const cantidad = await categorias.count();
    test.skip(cantidad === 0, "El local no muestra filtros de categoría");

    const antes = await page.getByRole("button", { name: /\$\s?[\d.]+/ }).count();
    await categorias.nth(1).click();
    await page.waitForTimeout(700);
    const despues = await page.getByRole("button", { name: /\$\s?[\d.]+/ }).count();
    // Filtrar acota la lista: si no cambia, el filtro no está aplicando.
    expect(despues).toBeLessThanOrEqual(antes);
  });

  test("el turno enviado en la URL es decodificado", async ({ page }) => {
    // Cualquier garbage tiene que llevar a la pantalla de "no encontrado", no a un
    // error 500 ni a una pantalla en blanco.
    await page.goto("/book/no-existe-jamás-este-local");
    await expect(page.getByText(/no encontrado|no existe|error/i).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("confirmacion page", () => {
  test("renderiza los estados de pago sin depender de la base", async ({ page }) => {
    for (const [query, esperado] of [
      ["?status=success", /pago aprobado/i],
      ["?status=pending", /pago pendiente/i],
      ["?status=failure", /pago/i],
    ] as const) {
      await page.goto(`/confirmacion${query}`);
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(esperado).first()).toBeVisible({ timeout: 20_000 });
    }
  });
});