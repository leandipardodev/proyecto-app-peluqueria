import { expect, test } from "@playwright/test";

test.describe("Public booking flow", () => {
  const SHOP_SLUG = process.env.E2E_SHOP_SLUG || "mi-peluqueria";

  test("booking page loads and shows services", async ({ page }) => {
    await page.goto(`/book/${SHOP_SLUG}`);
    await expect(page).toHaveTitle(/Klip|Reserva/i);

    // Should show the service selection step
    await expect(page.getByText(/Elegi tu servicio|Servicios/i)).toBeVisible();

    // Should list services as clickable buttons
    const serviceButtons = page.locator(
      'div.grid button:has(span.font-semibold), div.grid button:has(p.font-semibold)'
    );
    const count = await serviceButtons.count();
    test.skip(count === 0, "No hay servicios configurados para este shop en E2E");

    await expect(serviceButtons.first()).toBeVisible();
  });

  test("complete booking wizard up to confirm", async ({ page }) => {
    await page.goto(`/book/${SHOP_SLUG}`);

    // ── Step 0: Select service ──
    await expect(page.getByText(/Elegi tu servicio/i)).toBeVisible({ timeout: 10_000 });
    const serviceBtn = page.locator('button:has(span.font-semibold), button:has(p.font-semibold)').first();
    const serviceCount = await serviceBtn.count();
    test.skip(serviceCount === 0, "No hay servicios para este shop en E2E");
    await serviceBtn.click();

    // ── Step 1: Select staff ──
    await expect(page.getByText(/Profesional|Elegi tu profesional/i).or(page.getByText(/Sin preferencia/i))).toBeVisible({ timeout: 10_000 });
    const noPrefBtn = page.getByRole("button", { name: /sin preferencia/i });
    const staffCount = await noPrefBtn.count();
    if (staffCount > 0) {
      await noPrefBtn.click();
    } else {
      // Click whatever staff button is available
      const staffBtn = page.locator('button:has(img[alt*="staff"]), button:has(span:not(:empty))').filter({ hasNotText: /Atrás|Continuar|Volver|atrás|continuar/i }).first();
      const staffBtnCount = await staffBtn.count();
      test.skip(staffBtnCount === 0, "No hay personal disponible en E2E");
      await staffBtn.click();
    }

    // ── Step 2: Select date/time ──
    await expect(page.getByText(/Elegi fecha|Fecha y horario/i)).toBeVisible({ timeout: 10_000 });

    // Click first available date button (skip header/nav buttons)
    const dateBtns = page.locator('div.grid button, div[class*="grid"] button').filter({ hasNotText: /<|>|Atrás|Continuar/i });
    const dateCount = await dateBtns.count();
    test.skip(dateCount < 3, "No hay suficientes fechas disponibles en E2E");
    // Pick a date a few days ahead
    await dateBtns.nth(2).click();

    // Wait for slots to appear (brief loading)
    await page.waitForTimeout(1500);

    // Try to click a time slot
    const slotBtn = page.getByRole("button").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
    const slotCount = await slotBtn.count();
    test.skip(slotCount === 0, "No hay horarios disponibles para esta fecha en E2E");
    await slotBtn.click();

    // ── Step 3: Customer info ──
    await expect(page.getByText(/Tus datos|Completá tus datos/i)).toBeVisible({ timeout: 10_000 });

    // Fill form (guest mode — no Google login in E2E)
    const nameInput = page.locator("#customer-name");
    const nameCount = await nameInput.count();
    test.skip(nameCount === 0, "El formulario de datos no está visible (quizás redirigió a Google Auth)");
    await nameInput.fill("E2E Test User");
    await page.locator("#customer-email").fill("e2e-booking-test@example.com");
    await page.locator("#customer-phone").fill("11 5555 0000");

    // Confirm button should be visible
    await expect(page.getByRole("button", { name: /confirmar turno/i })).toBeVisible();
  });

  test("confirmacion page renders all payment statuses", async ({ page }) => {
    for (const status of ["success", "pending", "failure"] as const) {
      await page.goto(`/confirmacion?status=${status}&slug=${SHOP_SLUG}`);
      await expect(page).toHaveURL(/confirmacion/);

      if (status === "success") {
        await expect(page.getByText(/Pago aprobado|Gracias/i)).toBeVisible({ timeout: 10_000 });
      } else if (status === "pending") {
        await expect(page.getByText(/Pago pendiente/i)).toBeVisible({ timeout: 10_000 });
      } else {
        await expect(page.getByText(/Pago cancelado|no se pudo/i)).toBeVisible({ timeout: 10_000 });
      }
    }
  });
});

test.describe("Payment flows", () => {
  test("dashboard payment link generation (requires auth + appointments)", async ({ page }) => {
    const email = process.env.E2E_LOGIN_EMAIL;
    const password = process.env.E2E_LOGIN_PASSWORD;
    test.skip(!email || !password, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD for auth");

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/contrasena|contraseña|password/i).fill(password);
    await page.getByRole("button", { name: /ingresar|entrar|iniciar/i }).click();
    await page.waitForURL(/\/dashboard(\/.*)?$/i, { timeout: 30_000 });

    await page.goto("/dashboard/appointments");

    // Wait for appointments table
    await expect(page.getByText(/proximos turnos|turnos/i).first()).toBeVisible({ timeout: 15_000 });

    // Find a "Cobrar" button
    const cobrarBtn = page.getByRole("button", { name: /cobrar/i }).first();
    const cobrarCount = await cobrarBtn.count();
    test.skip(cobrarCount === 0, "No hay turnos impagos con Cobrar disponible");

    await cobrarBtn.click();
    await expect(page.getByRole("button", { name: /generando/i }).or(page.getByRole("link", { name: /link/i }))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: /link/i }).first()).toBeVisible({ timeout: 25_000 });
  });

  test("Mercado Pago external checkout link opens in new tab (requires auth + appointment)", async ({ page, context }) => {
    const email = process.env.E2E_LOGIN_EMAIL;
    const password = process.env.E2E_LOGIN_PASSWORD;
    test.skip(!email || !password, "Define E2E_LOGIN_EMAIL and E2E_LOGIN_PASSWORD for auth");

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/contrasena|contraseña|password/i).fill(password);
    await page.getByRole("button", { name: /ingresar|entrar|iniciar/i }).click();
    await page.waitForURL(/\/dashboard(\/.*)?$/i, { timeout: 30_000 });

    await page.goto("/dashboard/appointments");

    const cobrarBtn = page.getByRole("button", { name: /cobrar/i }).first();
    const cobrarCount = await cobrarBtn.count();
    test.skip(cobrarCount === 0, "No hay turnos impagos con Cobrar disponible");

    await cobrarBtn.click();

    // Wait for the MP link to be generated
    const link = page.getByRole("link", { name: /link/i }).first();
    await expect(link).toBeVisible({ timeout: 25_000 });

    // Open the MP checkout link in a new tab
    const href = await link.getAttribute("href");
    test.skip(!href || !href.includes("mercadopago"), "El link de pago no apunta a Mercado Pago");

    // Verify the link looks like a valid MP preference URL
    expect(href).toMatch(/mercadopago|mpago/i);

    // Open the link to verify it loads
    const mpPage = await context.newPage();
    await mpPage.goto(href!);
    await expect(mpPage).toHaveURL(/mercadopago|mpago/);
    await mpPage.close();
  });
});

test.describe("Booking page error states", () => {
  const SHOP_SLUG = process.env.E2E_SHOP_SLUG || "mi-peluqueria";

  test("shows error for non-existent shop", async ({ page }) => {
    await page.goto("/book/shop-que-no-existe-12345");
    await expect(page.getByText(/no encontrado|no existe|error/i).or(page.locator("[class*='error'], [class*='Error']"))).toBeVisible({ timeout: 10_000 });
  });

  test("booking page shows shop branding", async ({ page }) => {
    await page.goto(`/book/${SHOP_SLUG}`);
    await expect(page.locator("nav, header, [class*='header'], [class*='brand']").first()).toBeVisible({ timeout: 10_000 });
  });
});
