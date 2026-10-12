import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { prepararPagina, loginToDashboard } from "./helpers/auth";

dotenv.config({ path: ".env.local" });

/**
 * Reserva publica COMPLETA: servicio -> profesional -> fecha y hora -> (datos) ->
 * confirmar. Es el camino de conversion del producto y estaba sin cubrir.
 *
 * POR QUE VA AUTENTICADO
 * ----------------------
 * `createPublicAppointment` tiene regla anti-abuso: si el MISMO IP ya completo
 * una reserva sin login, la siguiente devuelve `login_required`
 * (`completedBookingCache`, un LRU EN MEMORIA del proceso con TTL de 24 horas).
 * O sea que el camino de invitado no es repetible ni en un test: la segunda
 * corrida falla siempre. Un cliente con cuenta no entra por esa regla, asi que el
 * recorrido autenticado es el que se puede verificar de verdad y estable.
 *
 * ESCRIBE EN LA BASE, a diferencia del resto de la suite. Por eso borra lo que
 * crea, siempre y sin depender de un try.
 */
const SHOP_SLUG = process.env.E2E_SHOP_SLUG || "klip";
const tieneDb = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const EMAIL_E2E = "e2e-reserva@klip.test";

function clienteDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe("Reserva publica de punta a punta", () => {
  test.beforeEach(async ({ page }) => {
    await prepararPagina(page);
  });

  test("recorre el asistente y deja el turno reservado", async ({ page }) => {
    test.skip(!tieneDb, "Hace falta SUPABASE_SERVICE_ROLE_KEY para verificar y limpiar la reserva");
    test.skip(!process.env.E2E_LOGIN_EMAIL, "Hace falta E2E_LOGIN_EMAIL");
    // 5 pasos con fetch en cada uno y, al final, la espera de que el write
    // aterrice. El default de 60s no alcanza.
    test.setTimeout(180_000);

    const db = clienteDb();
    const { data: shop } = await db.from("shops").select("id").eq("slug", SHOP_SLUG).maybeSingle();
    expect(shop, "el local de pruebas existe").toBeTruthy();

    const auth = await loginToDashboard(page);
    test.skip(!auth.ok, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD to run authenticated flow.");

    // Se parte de lo que hay y se mide lo que aparece: comparar por id es
    // infalible aunque el write cree mas de un turno (combo).
    const antes = new Set(
      ((await db.from("appointments").select("id").eq("shop_id", shop!.id)).data ?? []).map((a) => a.id as string),
    );

    // ---------------------------------------------------------------- paso 1
    await page.goto(`/book/${SHOP_SLUG}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByText(/eleg[ií] tu servicio/i).first()).toBeVisible({ timeout: 20_000 });

    const servicios = page.getByRole("button", { name: /\$\s?[\d.]+/ });
    test.skip((await servicios.count()) === 0, "El local no tiene servicios con precio visible");
    const nombreServicio = (await servicios.first().innerText()).split("\n")[0].trim();
    // El carrito se arma clickeando el servicio y pasando por Continuar.
    await servicios.first().click();
    await page.getByRole("button", { name: /^Continuar$/ }).first().click();
    await page.waitForTimeout(1500);

    // ---------------------------------------------------------------- paso 2
    await expect(page.getByText(/eleg[ií] tu profesional/i).first()).toBeVisible({ timeout: 20_000 });
    const sinPreferencia = page.getByRole("button", { name: /sin preferencia/i }).first();
    if (await sinPreferencia.count()) await sinPreferencia.click();
    await page.getByRole("button", { name: /^Continuar$/ }).first().click();
    await page.waitForTimeout(2000);

    // ---------------------------------------------------------------- paso 3
    await expect(page.getByText(/eleg[ií] fecha y horario/i).first()).toBeVisible({ timeout: 20_000 });

    // Los dias cerrados dicen "Cerrado" (lunes y domingo en este local): el
    // calendario refleja el horario real del negocio.
    const dias = page.getByRole("button", { name: /^\d{1,2}$/ });
    const abiertos: string[] = [];
    for (let i = 0; i < (await dias.count()); i++) {
      const texto = (await dias.nth(i).innerText()).trim();
      if (!texto.toLowerCase().includes("cerrado")) abiertos.push(texto);
    }
    test.skip(abiertos.length === 0, "El local no tiene dias abiertos en el mes visible");

    const diaElegido = abiertos[0];
    await page.getByRole("button", { name: new RegExp(`^${diaElegido}$`) }).first().click();
    await page.waitForTimeout(2500);

    const horarios = page.getByRole("button", { name: /^\d{1,2}:\d{2}$/ });
    test.skip((await horarios.count()) === 0, "El dia abierto no tiene horarios libres");
    const horaElegida = (await horarios.first().innerText()).trim();
    await horarios.first().click();
    await page.waitForTimeout(1200);

    // Elegir la hora todavia no pasa de paso: hay que confirmar con Continuar.
    const seguir = page.getByRole("button", { name: /^Continuar$/ }).first();
    test.skip((await seguir.count()) === 0, "No aparece Continuar tras elegir el horario");
    await seguir.click();
    await page.waitForTimeout(2000);

    // ---------------------------------------------------------------- paso 4
    // Autenticado, el formulario de datos solo pide lo que la cuenta no tiene
    // (el nombre y nada mas si hay email y telefono). Por eso cada campo se
    // busca por separado en vez de asumir los tres.
    const campos = {
      nombre: page.getByPlaceholder(/nombre y apellido/i),
      email: page.getByPlaceholder(/tu@email\.com/i),
      telefono: page.getByPlaceholder(/11 1234/i),
    };
    const pideDatos = (await campos.nombre.count()) > 0;
    if (pideDatos) {
      if (await campos.nombre.count()) await campos.nombre.fill("Cliente E2E Reserva");
      if (await campos.email.count()) await campos.email.fill(EMAIL_E2E);
      if (await campos.telefono.count()) await campos.telefono.fill("11 5555 0002");
      await page.getByRole("button", { name: /^Continuar$/ }).first().click();
      await page.waitForTimeout(2500);
    }

    // ---------------------------------------------------------------- paso 5
    // Tienda opcional: se saltea. El local tiene pay_at_shop, asi que no hay
    // pago: al confirmar el turno queda `confirmed` e `is_paid = false`.
    const saltearTienda = page.getByRole("button", { name: /no me interesa|continuar sin/i }).first();
    if (await saltearTienda.count()) {
      await saltearTienda.click();
      await page.waitForTimeout(4000);
    }

    // ------------------------------------------------------- verificacion
    // Se asserta contra la base y no contra la pantalla: la UI no muestra una
    // pantalla de exito clara. Se espera a que el write aterrice.
    let nuevos: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 40; i++) {
      const { data } = await db
        .from("appointments")
        .select("id, status, is_paid, service_price, staff_id, start_time, customer_id")
        .eq("shop_id", shop!.id);
      nuevos = (data ?? []).filter((a) => !antes.has(a.id as string)) as Array<Record<string, unknown>>;
      if (nuevos.length > 0) break;
      await page.waitForTimeout(1500);
    }

    if (nuevos.length === 0) {
      // Diagnostico: sin esto el unico dato es "no hay turno nuevo", que no dice
      // si fallo la validacion, el pago o el write.
      console.log(
        "PANTALLA AL FALLAR:",
        (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 600),
      );
      console.log(
        "ERRORES:",
        JSON.stringify(
          await page.evaluate(() =>
            Array.from(document.querySelectorAll('[role="alert"]'))
              .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160))
              .filter(Boolean),
          ),
        ),
      );
    }

    expect(nuevos.length, "la reserva creo al menos un turno nuevo").toBeGreaterThan(0);
    const turno = nuevos[0];
    // Con `pay_at_shop` el turno queda confirmado pero IMPAGO: eso es lo
    // correcto (el local lo cobra en el mostrador) y es distinto de lo que hacia
    // la app antes, que|reportaba el precio de lista como cobrado.
    expect(turno.status).toBe("confirmed");
    expect(turno.is_paid).toBe(false);
    expect(Number(turno.service_price)).toBeGreaterThan(0);
    expect(turno.staff_id, "el turno quedo con profesional asignado (no sin preferencia)").toBeTruthy();

    console.log(
      `Reserva E2E: ${nombreServicio} · dia ${diaElegido} ${horaElegida} · turno ${turno.id} · $${turno.service_price}`,
    );

    // --------------------------------------------------------------- limpieza
    const ids = nuevos.map((t) => t.id as string);
    await db.from("appointments").delete().eq("shop_id", shop!.id).in("id", ids);
    const { data: clientesE2E } = await db.from("customers").select("id").eq("shop_id", shop!.id).eq("email", EMAIL_E2E);
    for (const c of clientesE2E ?? []) await db.from("customers").delete().eq("id", c.id);

    const { count: quedan } = await db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop!.id)
      .in("id", ids);
    expect(quedan, "no quedo ningun turno de la prueba").toBe(0);
  });
});