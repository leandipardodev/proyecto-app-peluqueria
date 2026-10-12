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
  // `waitUntil: "commit"`: el login es un Server Action y el redirect lo hace el
  // router del cliente, sin un evento `load` nuevo. Con el default ("load") el
  // wait se queda esperando algo que no llega y TODOS los tests autenticados dan
  // timeout: asi es como el E2E estaba dormido sin que nadie lo notara.
  await page.waitForURL(/\/dashboard(\/.*)?$/i, { timeout: 30_000, waitUntil: "commit" });
  await expect(page).toHaveURL(/\/dashboard(\/.*)?$/i);

  return { ok: true as const };
}

/**
 * El slug del local sale de la URL a la que deja el login, para que el mismo
 * spec corra contra cualquier local de pruebas.
 */
export async function slugDelLocal(page: Page): Promise<string | null> {
  await page.waitForURL(/\/dashboard\/[^/]+/i, { timeout: 30_000, waitUntil: "commit" });
  const slug = new URL(page.url()).pathname.split("/").filter(Boolean)[1];
  return slug && slug !== "dashboard" ? slug : null;
}

/**
 * El modal de novedades (`ReleaseNotesModal`) aparece en la primera carga de cada
 * version y es un overlay que intercepta TODOS los clics de la pagina. Se lo
 * marca como visto antes de que cargue, con la misma clave que usa el componente.
 *
 * `app-version.ts` importa `package.json`, que no se puede importar desde un spec
 * de ESM, asi que la version se lee del package.json directamente.
 */
export async function prepararPagina(page: Page) {
  const { version } = JSON.parse(
    await import("node:fs/promises").then((fs) => fs.readFile("package.json", "utf8")),
  ) as { version: string };
  await page.addInitScript((v) => {
    try {
      window.localStorage.setItem(`klip_release_notes_seen_${v}`, "1");
    } catch {
      /* sin localStorage no hay nada que hacer */
    }
  }, version);
}

/** Red de seguridad por si el modal llegara a aparecer igual. */
export async function cerrarDialogos(page: Page) {
  for (let intento = 0; intento < 4; intento++) {
    const dialogo = page.getByRole("dialog");
    if ((await dialogo.count()) === 0) return;
    const cerrar = dialogo.getByRole("button", { name: /entendido|cerrar|close|✕|×/i }).first();
    if ((await cerrar.count()) > 0) await cerrar.click({ timeout: 5_000 }).catch(() => {});
    else await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
  }
}