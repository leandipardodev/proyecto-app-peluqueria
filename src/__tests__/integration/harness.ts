/**
 * INTEGRACION CONTRA LA BASE REAL.
 *
 * A diferencia del resto de `src/__tests__/`, este archivo NO mockea el cliente
 * de Supabase: `setup.ts` lo reemplaza globalmente, asi que aca se lo des-mockea y
 * se dejan las env vars reales de `.env.local`. Los server actions Entonces
 * consultan la base de verdad.
 *
 * Se corre solo si `RUN_DB_TESTS=1`:
 *
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration
 *
 * Por que el gate: estas pruebas leen y ESCRIBEN en el local de pruebas, y el CI
 * no tiene esa base. Sin la env var quedan skipped y el Quality Gate no se entera.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { join } from "node:path";

// `setup.ts` mockea `@supabase/supabase-js` entero (su `createClient` es un
// `vi.fn()` que devuelve undefined). Estas pruebas necesitan el cliente REAL,
// asi que se lo des-mockea en el tope del modulo: si queda el mock, el primer
// `supabase.auth.admin.createUser` explota con "cannot read auth of undefined".
vi.unmock("@supabase/supabase-js");

// El dotenv va antes que cualquier import que lea process.env al cargar el
// modulo, asi que se carga aca y se re-exporta el booleano para los describes.
dotenv.config({ path: join(process.cwd(), ".env.local") });

export const DB_TESTS_ON = process.env.RUN_DB_TESTS === "1";

export type ClienteReal = ReturnType<typeof crearCliente>;

function crearCliente() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function db(): ClienteReal {
  return crearCliente();
}

/** Fecha en ART (UTC-3), que es la zona con la que trabaja la app. */
export function artDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function artTimestamp(fecha: string, hhmm = "10:00"): string {
  return `${fecha}T${hhmm}:00-03:00`;
}

/** Dia de la semana en ART, 0 = domingo (como lo usa `getWeekdayFromDateString`). */
export function dowEnArt(fecha: string): number {
  return new Date(`${fecha}T12:00:00-03:00`).getUTCDay();
}

/**
 * Crea un local de pruebas con su dueño. Todo lo que el script toca queda
 * marcado con el prefijo del TAG para poder borrarlo despues.
 */
export const TAG = "[test-agenda]";

export type LocalDePrueba = {
  shopId: string;
  ownerId: string;
  slug: string;
  email: string;
};

let contador = 0;

export async function crearLocalDePrueba(
  nombreBase: string,
  opciones: { days?: number } = {},
): Promise<LocalDePrueba> {
  const supabase = db();
  const n = ++contador;
  const slug = `test-agenda-${Date.now().toString(36)}-${n}`;
  const email = `${slug}@klip.test`;
  const password = "test-agenda-123456";

  const { data: auth, error: eAuth } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (eAuth) throw new Error(`createUser: ${eAuth.message}`);

  const ownerId = auth.user.id;

  const { data: shop, error: eShop } = await supabase
    .from("shops")
    .insert({
      nombre: `${TAG} ${nombreBase}`,
      slug,
      // L-V 09:00-20:00 abierto, domingo cerrado: el default de la app.
      business_hours: {
        monday: { open: true, start: "09:00", end: "20:00" },
        tuesday: { open: true, start: "09:00", end: "20:00" },
        wednesday: { open: true, start: "09:00", end: "20:00" },
        thursday: { open: true, start: "09:00", end: "20:00" },
        friday: { open: true, start: "09:00", end: "20:00" },
        saturday: { open: true, start: "09:00", end: "14:00" },
        sunday: { open: false, start: "09:00", end: "15:00" },
      },
      pay_at_shop: true,
      assign_staff_later: false,
      booking_deposit_enabled: false,
      auto_complete_enabled: false,
    })
    .select("id, slug")
    .single();
  if (eShop) throw new Error(`shops insert: ${eShop.message}`);

  await supabase.from("user_profiles").insert({
    user_id: ownerId,
    shop_id: shop.id,
    name: nombreBase,
    email,
    role: "owner",
  });
  await supabase.from("shop_memberships").insert({
    shop_id: shop.id,
    user_id: ownerId,
    role: "owner",
    is_active: true,
  });
  await supabase.from("admin_allowlist").insert({
    user_id: ownerId,
    shop_id: shop.id,
    role: "owner",
    is_active: true,
  });

  return { shopId: shop.id, ownerId, slug, email };
}

export async function borrarLocalDePrueba(l: LocalDePrueba) {
  const supabase = db();
  await supabase.from("shop_memberships").delete().eq("shop_id", l.shopId);
  await supabase.from("user_profiles").delete().eq("shop_id", l.shopId);
  await supabase.from("admin_allowlist").delete().eq("shop_id", l.shopId);
  await supabase.from("shops").delete().eq("id", l.shopId);
  await supabase.auth.admin.deleteUser(l.ownerId);
}

/** Crea un profesional con membership, horario semanal y servicios. */
export async function crearProfesional(
  local: LocalDePrueba,
  opts: {
    nombre: string;
    email: string;
    /** 0 = domingo. Si falta un dia, NO hay fila y el motor usa el horario del local. */
    dias: Array<{ day: number; start: string; end: string; activo?: boolean }>;
    servicios: string[];
  },
): Promise<string> {
  const supabase = db();
  const { data: auth, error } = await supabase.auth.admin.createUser({
    email: opts.email,
    password: "test-agenda-123456",
    email_confirm: true,
  });
  if (error) throw new Error(`createUser staff: ${error.message}`);
  const staffId = auth.user.id;

  await supabase.from("user_profiles").insert({
    user_id: staffId,
    shop_id: local.shopId,
    name: opts.nombre,
    email: opts.email,
    role: "staff",
  });
  await supabase.from("shop_memberships").insert({
    shop_id: local.shopId,
    user_id: staffId,
    role: "staff",
    is_active: true,
  });

  if (opts.dias.length > 0) {
    const { error: eSch } = await supabase.from("staff_schedules").insert(
      opts.dias.map((d) => ({
        staff_id: staffId,
        day_of_week: d.day,
        start_time: d.start,
        end_time: d.end,
        is_active: d.activo ?? true,
      })),
    );
    if (eSch) throw new Error(`staff_schedules: ${eSch.message}`);
  }

  if (opts.servicios.length > 0) {
    const { error: eSs } = await supabase.from("staff_services").insert(
      opts.servicios.map((sid) => ({ staff_id: staffId, service_id: sid })),
    );
    if (eSs) throw new Error(`staff_services: ${eSs.message}`);
  }

  return staffId;
}

export async function borrarProfesional(local: LocalDePrueba, staffId: string) {
  const supabase = db();
  await supabase.from("staff_services").delete().eq("staff_id", staffId);
  await supabase.from("staff_schedules").delete().eq("staff_id", staffId);
  await supabase.from("shop_memberships").delete().eq("shop_id", local.shopId).eq("user_id", staffId);
  await supabase.from("user_profiles").delete().eq("shop_id", local.shopId).eq("user_id", staffId);
  await supabase.auth.admin.deleteUser(staffId);
}

export async function crearServicio(
  local: LocalDePrueba,
  opts: { name: string; price: number; duration: number; payAtShop?: boolean; hidePrice?: boolean },
): Promise<string> {
  const supabase = db();
  const { data, error } = await supabase
    .from("services")
    .insert({
      shop_id: local.shopId,
      name: `${TAG} ${opts.name}`,
      price: opts.price,
      duration_minutes: opts.duration,
      pay_at_shop: opts.payAtShop ?? false,
      hide_price: opts.hidePrice ?? false,
      category: "General",
    })
    .select("id")
    .single();
  if (error) throw new Error(`services insert: ${error.message}`);
  return data.id;
}

/** Grilla de 30 minutos: la primera hora exacta que cae en la grilla. */
export function slotTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

beforeAll(() => {
  if (DB_TESTS_ON && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }
});

export { describe, it, expect };