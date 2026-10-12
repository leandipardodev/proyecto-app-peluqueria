/**
 * BANCO DE PRUEBAS DEL SISTEMA DE TURNOS CONTRA EL LOCAL REAL "klip".
 *
 * A diferencia de `agenda.db.test.ts` (que crea un local desechable), esto
 * prueba el local de verdad: sus 590 turnos, sus 19 servicios, sus 5 combos, sus
 * 4 profesionales con horarios cargados a mano y el feriado real del 15/10.
 *
 * REGLAS DE ORO (si no se cumplen, la prueba contamina al local):
 *
 *  1. Todo lo que se crea lleva el prefijo `TAG` en un campo de texto, para que
 *     `limpiar()` lo pueda borrar sin ambiguedad.
 *  2. `beforeEach` corre `limpiar()`, y tambien `afterAll`: si una corrida
 *     muere a mitad de camino, la proxima empieza limpia.
 *  3. Los campos del local que se tocan (`business_hours`, `pay_at_shop`,
 *     `booking_deposit_*`, `assign_staff_later`, `bank_transfer_*`, `mp_*`) se
 *     snapshotan en `snapshotLocal()` y se restauran en `restaurarLocal()`.
 *  4. Ninguna prueba toca `shops.plan_expiry` ni `shops.active`.
 *
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/turnos-klip.db.test.ts
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { join } from "node:path";

vi.unmock("@supabase/supabase-js");

dotenv.config({ path: join(process.cwd(), ".env.local") });

export const DB_TESTS_ON = process.env.RUN_DB_TESTS === "1";

export const SHOP_SLUG = process.env.TURNOS_SHOP_SLUG || "klip";
export const TAG = "[turnos-lab]";

export const SHOP_ID = "18e5e411-c31c-434e-8a48-a1f155823f57";
/** `lean`, owner del local. */
export const OWNER_ID = "10f3a2ee-e7b8-4557-8aca-74b5332aefcb";
/** `E2E Klip`, segundo owner, sin horarios cargados. */
export const OWNER2_ID = "74da5934-991d-4276-91aa-0bbc9f9c4043";
/** Miembro con `is_active=false`: no debe aparecer en la reserva publica. */
export const STAFF_INACTIVO_ID = "10c77738-043b-4711-a1f9-f8da3ab46786";

let cliente: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cliente;
}

// ---------------------------------------------------------------------------
// Fechas. Klip: lunes cerrado, mar-vie 09-20, sabado 09-13, domingo cerrado, y
// el jueves tiene descanso 13:00-16:00. El 15/10 (jueves) esta cerrado por el
// feriado real que el local ya tiene cargado.
// ---------------------------------------------------------------------------
export function artDate(d: Date = new Date()): string {
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
  return artDate(d);
}

export function dowEnArt(fecha: string): number {
  return new Date(`${fecha}T12:00:00-03:00`).getUTCDay();
}

/** Proximo dia de la semana pedido a partir de manana (0 = domingo). */
export function proximoDiaDeSemana(day: number, desde?: string): string {
  let f = desde ?? sumarDias(artDate(), 1);
  for (let i = 0; i < 14; i++) {
    if (dowEnArt(f) === day) return f;
    f = sumarDias(f, 1);
  }
  throw new Error(`no se encontro el dia ${day}`);
}

export function artTimestamp(fecha: string, hhmm = "10:00"): string {
  return `${fecha}T${hhmm}:00-03:00`;
}

export function hhmmEnArt(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Registro de lo creado, para que `limpiar()` pueda borrarlo sin ambiguedad.
// ---------------------------------------------------------------------------
const CREADOS = {
  servicios: [] as string[],
  profesionales: [] as string[],
  clientes: [] as string[],
  overrides: [] as string[],
  turnos: [] as string[],
  combos: [] as string[],
  bookings: [] as string[],
};

// ---------------------------------------------------------------------------
// Snapshot / restore del local
// ---------------------------------------------------------------------------
const CAMPOS_DEL_LOCAL = [
  "business_hours",
  "pay_at_shop",
  "assign_staff_later",
  "booking_deposit_enabled",
  "booking_deposit_amount",
  "bank_transfer_enabled",
  "bank_alias",
  "bank_cvu_cbu",
  "bank_name",
  "mp_public_key",
  "mp_access_token",
  "mp_max_installments",
  "mp_excluded_payment_types",
  "auto_complete_enabled",
  "loyalty_enabled",
  "loyalty_cuts_required",
  "loyalty_discount_percent",
  "features_override",
] as const;

let snapshot: Record<string, unknown> | null = null;

/**
 * Las tres suites (`A`, `B/C` y `D/E/G`) pegan al MISMO local real, asi que no
 * pueden correr a la vez: el `limpiar()` de una borra los turnos que la otra
 * esta por usar. Vitest corre archivos en paralelo, y con las tres juntas el
 * resultado es ~58 falsos negativos que no dicen nada del producto.
 *
 * Este lock es entre PROCESOS (un archivo con `wx`, que es atomico en Windows y
 * en POSIX), porque Vitest puede usar threads o forks.
 */
const LOCK_PATH = join(process.env.TEMP || process.env.TMPDIR || process.cwd(), "klip-turnos-lab.lock");
const LOCK_STALE_MS = 20 * 60 * 1000;

async function tomarLock(): Promise<string> {
  const { writeFile, readFile, unlink } = await import("node:fs/promises");
  const mio = `${process.pid}:${Date.now()}`;
  const deadline = Date.now() + LOCK_STALE_MS;

  while (Date.now() < deadline) {
    try {
      await writeFile(LOCK_PATH, mio, { flag: "wx" });
      return mio;
    } catch {
      // Ya hay alguien: si el lock es viejo (una corrida que murio), lo robo.
      try {
        const viejo = await readFile(LOCK_PATH, "utf8");
        const [pid, stamp] = viejo.split(":");
        const age = Date.now() - Number(stamp);
        if (!pid || Number.isNaN(age) || age > LOCK_STALE_MS) {
          await unlink(LOCK_PATH).catch(() => {});
        }
      } catch {
        // El otro lo acaba de liberar.
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`no se pudo tomar el lock ${LOCK_PATH} en ${LOCK_STALE_MS / 1000}s`);
}

let lockMio: string | null = null;

export async function snapshotLocal() {
  if (!lockMio) lockMio = await tomarLock();
  const { data, error } = await db()
    .from("shops")
    .select([...CAMPOS_DEL_LOCAL, "id"].join(","))
    .eq("id", SHOP_ID)
    .single();
  if (error) throw error;
  snapshot = data as Record<string, unknown>;
  return snapshot;
}

/** Se llama al final de la suite, DESPUES de `limpiar()` + `restaurarLocal()`. */
export async function liberarLocal() {
  if (!lockMio) return;
  const { readFile, unlink } = await import("node:fs/promises");
  try {
    // Solo se suelta el lock si sigue siendo nuestro.
    if ((await readFile(LOCK_PATH, "utf8")) === lockMio) await unlink(LOCK_PATH);
  } catch {
    // Ya no estaba: nada que hacer.
  }
  lockMio = null;
  snapshot = null;
}

export async function restaurarLocal() {
  // Si esta suite NO tiene el lock, esta no es su fila para restaurar: otra
  // suite esta corriendo y pisaria su configuracion.
  if (!lockMio || !snapshot) return;
  const patch: Record<string, unknown> = {};
  for (const campo of CAMPOS_DEL_LOCAL) patch[campo] = snapshot[campo] ?? null;
  const { error } = await db().from("shops").update(patch).eq("id", SHOP_ID);
  if (error) throw new Error(`no se pudo restaurar el local: ${error.message}`);
}

export function local(): Record<string, unknown> {
  if (!snapshot) throw new Error("falta snapshotLocal()");
  return snapshot;
}

// ---------------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------------
export async function limpiar() {
  // Misma guarda que `restaurarLocal()`: sin lock, `limpiar()` borraria los
  // datos `[turnos-lab]` de la suite que SI tiene el lock.
  if (!lockMio) return;
  const supabase = db();

  if (CREADOS.turnos.length) {
    await supabase.from("appointments").delete().eq("shop_id", SHOP_ID).in("id", CREADOS.turnos);
    CREADOS.turnos.length = 0;
  }
  if (CREADOS.bookings.length) {
    await supabase.from("pending_bookings").delete().eq("shop_id", SHOP_ID).in("id", CREADOS.bookings);
    CREADOS.bookings.length = 0;
  }
  if (CREADOS.clientes.length) {
    await supabase.from("customers").delete().eq("shop_id", SHOP_ID).in("id", CREADOS.clientes);
    CREADOS.clientes.length = 0;
  }
  if (CREADOS.overrides.length) {
    await supabase.from("shop_date_overrides").delete().eq("shop_id", SHOP_ID).in("id", CREADOS.overrides);
    CREADOS.overrides.length = 0;
  }
  if (CREADOS.combos.length) {
    await supabase.from("combo_services").delete().in("combo_id", CREADOS.combos);
    await supabase.from("combos").delete().eq("shop_id", SHOP_ID).in("id", CREADOS.combos);
    CREADOS.combos.length = 0;
  }
  if (CREADOS.profesionales.length) {
    for (const id of CREADOS.profesionales) {
      await supabase.from("staff_services").delete().eq("staff_id", id);
      await supabase.from("staff_schedules").delete().eq("staff_id", id);
      await supabase.from("shop_memberships").delete().eq("shop_id", SHOP_ID).eq("user_id", id);
      await supabase.from("user_profiles").delete().eq("shop_id", SHOP_ID).eq("user_id", id);
      await supabase.from("admin_allowlist").delete().eq("shop_id", SHOP_ID).eq("user_id", id);
    }
    await supabase.auth.admin.deleteUser(CREADOS.profesionales[0]).catch(() => {});
    for (const id of CREADOS.profesionales.slice(1)) await supabase.auth.admin.deleteUser(id).catch(() => {});
    CREADOS.profesionales.length = 0;
  }
  if (CREADOS.servicios.length) {
    await supabase.from("staff_services").delete().in("service_id", CREADOS.servicios);
    await supabase.from("appointments").delete().eq("shop_id", SHOP_ID).in("service_id", CREADOS.servicios);
    await supabase.from("combo_services").delete().in("service_id", CREADOS.servicios);
    await supabase.from("services").delete().eq("shop_id", SHOP_ID).in("id", CREADOS.servicios);
    CREADOS.servicios.length = 0;
  }

  // Red de seguridad: cualquier fila de la prueba que haya quedado sin registrar
  // se detecta por el prefijo en las notas / nombre / motivo.
  await supabase.from("appointments").delete().eq("shop_id", SHOP_ID).like("notes", `${TAG}%`);
  await supabase.from("customers").delete().eq("shop_id", SHOP_ID).like("nombre", `${TAG}%`);
  await supabase.from("shop_date_overrides").delete().eq("shop_id", SHOP_ID).like("reason", `${TAG}%`);
  await supabase.from("pending_bookings").delete().eq("shop_id", SHOP_ID).like("customer_name", `${TAG}%`);
  await supabase.from("combos").delete().eq("shop_id", SHOP_ID).like("name", `${TAG}%`);
  await supabase.from("services").delete().eq("shop_id", SHOP_ID).like("name", `${TAG}%`);
}

export function registrarTurno(id: string) {
  CREADOS.turnos.push(id);
}
export function registrarBooking(id: string) {
  CREADOS.bookings.push(id);
}
export function registrarCliente(id: string) {
  CREADOS.clientes.push(id);
}

// ---------------------------------------------------------------------------
// Fabricas
// ---------------------------------------------------------------------------
export async function crearProfesionalLab(
  nombre: string,
  opts: {
    dias?: Array<{ day: number; start: string; end: string; activo?: boolean }>;
    servicios?: string[];
    role?: string;
    isActive?: boolean;
  } = {},
) {
  const supabase = db();
  const sufijo = Math.random().toString(36).slice(2, 8);
  const email = `lab-${nombre.toLowerCase().replace(/\W/g, "")}-${sufijo}@klip.test`;
  const { data: auth, error } = await supabase.auth.admin.createUser({
    email,
    password: "lab-turnos-123456",
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${nombre}: ${error.message}`);
  const staffId = auth.user.id;
  CREADOS.profesionales.push(staffId);

  await supabase.from("user_profiles").insert({
    user_id: staffId,
    shop_id: SHOP_ID,
    name: `${TAG} ${nombre}`,
    email,
    role: opts.role ?? "staff",
  });
  await supabase.from("shop_memberships").insert({
    shop_id: SHOP_ID,
    user_id: staffId,
    role: opts.role ?? "staff",
    is_active: opts.isActive ?? true,
  });

  if (opts.dias?.length) {
    const { error: e } = await supabase.from("staff_schedules").insert(
      opts.dias.map((d) => ({
        staff_id: staffId,
        day_of_week: d.day,
        start_time: d.start,
        end_time: d.end,
        is_active: d.activo ?? true,
      })),
    );
    if (e) throw new Error(`staff_schedules ${nombre}: ${e.message}`);
  }
  if (opts.servicios?.length) {
    const { error: e } = await supabase.from("staff_services").insert(
      opts.servicios.map((sid) => ({ staff_id: staffId, service_id: sid })),
    );
    if (e) throw new Error(`staff_services ${nombre}: ${e.message}`);
  }
  return staffId;
}

export async function crearServicioLab(opts: {
  name: string;
  price: number;
  duration: number;
  payAtShop?: boolean;
  hidePrice?: boolean;
}) {
  const { data, error } = await db()
    .from("services")
    .insert({
      shop_id: SHOP_ID,
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
  CREADOS.servicios.push(data.id);
  return data.id;
}

export async function crearTurnoLab(opts: {
  staffId?: string | null;
  serviceId?: string | null;
  fecha: string;
  desde: string;
  hasta: string;
  status?: string;
  isPaid?: boolean;
  servicePrice?: number | null;
  customerId?: string | null;
  notas?: string;
  creadoHaceMinutos?: number;
  sinMarcar?: boolean;
}): Promise<string> {
  const { data, error } = await db()
    .from("appointments")
    .insert({
      shop_id: SHOP_ID,
      staff_id: opts.staffId ?? null,
      service_id: opts.serviceId ?? null,
      service_price: opts.servicePrice ?? 10000,
      customer_id: opts.customerId ?? null,
      start_time: artTimestamp(opts.fecha, opts.desde),
      end_time: artTimestamp(opts.fecha, opts.hasta),
      date_key_ar: opts.fecha,
      status: opts.status ?? "confirmed",
      is_paid: opts.isPaid ?? false,
      ...(opts.sinMarcar ? {} : { notes: `${TAG} ${opts.notas ?? ""}`.trim() }),
      ...(opts.creadoHaceMinutos !== undefined
        ? { created_at: new Date(Date.now() - opts.creadoHaceMinutos * 60_000).toISOString() }
        : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(`appointments insert: ${error.message}`);
  if (!opts.sinMarcar) CREADOS.turnos.push(data.id);
  return data.id;
}

export async function crearClienteLab(nombre: string, telefono?: string) {
  const tel = telefono ?? `11${String(Math.floor(Math.random() * 9000000) + 1000000)}`;
  const { data, error } = await db()
    .from("customers")
    .insert({
      shop_id: SHOP_ID,
      nombre: `${TAG} ${nombre}`,
      telefono: tel,
      email: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@klip.test`,
    })
    .select("id")
    .single();
  if (error) throw new Error(`customers insert: ${error.message}`);
  CREADOS.clientes.push(data.id);
  return { id: data.id, telefono: tel };
}

export async function crearOverrideLab(opts: {
  fecha: string;
  staffId?: string | null;
  isClosed?: boolean;
  start?: string | null;
  end?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  motivo?: string;
}) {
  const { data, error } = await db()
    .from("shop_date_overrides")
    .insert({
      shop_id: SHOP_ID,
      staff_id: opts.staffId ?? null,
      date: opts.fecha,
      is_closed: opts.isClosed ?? false,
      start_time: opts.start ?? null,
      end_time: opts.end ?? null,
      break_start: opts.breakStart ?? null,
      break_end: opts.breakEnd ?? null,
      reason: `${TAG} ${opts.motivo ?? "excepcion de prueba"}`,
    })
    .select("id")
    .single();
  if (error) throw new Error(`shop_date_overrides insert: ${error.message}`);
  CREADOS.overrides.push(data.id);
  return data.id;
}

export async function ponerHorario(dia: string, cfg: unknown) {
  const { data } = await db().from("shops").select("business_hours").eq("id", SHOP_ID).single();
  const horas = { ...(data.business_hours as Record<string, unknown>) };
  horas[dia] = cfg;
  const { error } = await db().from("shops").update({ business_hours: horas }).eq("id", SHOP_ID);
  if (error) throw error;
}

export async function leerHorarios(): Promise<Record<string, { open?: boolean; start?: string; end?: string }>> {
  const { data } = await db().from("shops").select("business_hours").eq("id", SHOP_ID).single();
  return data.business_hours as Record<string, { open?: boolean; start?: string; end?: string }>;
}

// ---------------------------------------------------------------------------
// Cableado de la sesion: server actions reales + service-role client real +
// usuario fijo. El reloj NO se toca: `vi.unmock("@/lib/argentina-time")` lo deja
// en el tiempo real, que es lo unico que hace que "hoy" y "manana" signifiquen algo.
// ---------------------------------------------------------------------------
let IP_ACTUAL = "1.1.1.1";
export function setIp(ip: string) {
  IP_ACTUAL = ip;
}

let ipSeq = 0;

/**
 * IP distinta para cada prueba.
 *
 * `fetchPublicAvailableSlots` tiene un limitador de 30 requests por minuto y la
 * clave es `fetch-slots:<ip>:<shopId>`. Sin esto, 30 llamadas de pruebas
 * anteriores revientan la 31ra con una lista vacia y todos los casos de
 * colision dan un falso verde: el turno SI existe en la base, pero el limitador
 * lo esconde.
 */
export function ipUnica(): string {
  ipSeq += 1;
  IP_ACTUAL = `10.${Math.floor(ipSeq / 65025) % 256}.${Math.floor(ipSeq / 255) % 255}.${(ipSeq % 255) + 1}`;
  return IP_ACTUAL;
}

export async function cablearAuth(userId: string, role: "owner" | "staff" | "admin" | null) {
  const supabase = db();

  const server = await import("@/lib/supabase/server");
  vi.mocked(server.createServerClient).mockImplementation(
    async () =>
      ({
        auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
        from: (t: string) => supabase.from(t as never),
      }) as never,
  );

  const auth = await import("@/lib/dashboard/auth/server");

  vi.mocked(auth.createServiceRoleClient).mockImplementation(async () => supabase as never);
  vi.mocked(auth.getAuthSession).mockImplementation(async () => ({ user: { id: userId } }));

  vi.mocked(auth.getCurrentUserRole).mockImplementation(async (shopId: string) => {
    const { data } = await supabase
      .from("shop_memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .maybeSingle();
    if (!data) return { success: false, error: "SIN_ACCESO" };
    return { success: true, data: { role: data.role as string, userId } };
  });

  vi.mocked(auth.canAccessShopId).mockImplementation(async (u: string, shopId: string) => {
    const { data } = await supabase
      .from("shop_memberships")
      .select("shop_id")
      .eq("user_id", u)
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .in("role", ["owner", "admin", "staff"])
      .maybeSingle();
    return Boolean(data?.shop_id);
  });

  vi.mocked(auth.requireShopId).mockImplementation(async () => ({ success: true, data: SHOP_ID }));
  vi.mocked(auth.requireOwnerShopId).mockImplementation(async () => {
    if (role !== "owner") return { success: false, error: "Solo el owner del local puede realizar esta accion" };
    return { success: true, data: SHOP_ID };
  });

  vi.mocked(auth.resolveAuthorizedShopId).mockImplementation(
    async (shopIdOverride?: string, mode: "owner" | "member" = "owner") => {
      if (!shopIdOverride) {
        const resolved = mode === "owner" ? await auth.requireOwnerShopId() : await auth.requireShopId();
        if (!resolved.success) return { success: false, error: resolved.error };
        return { success: true, data: (resolved as { data: string }).data };
      }
      if (shopIdOverride !== SHOP_ID) return { success: false, error: "SIN_ACCESO_LOCAL" };
      if (mode === "owner" && role !== "owner") {
        return { success: false, error: "Solo el owner del local puede realizar esta accion" };
      }
      return { success: true, data: shopIdOverride };
    },
  );

  const nextHeaders = await import("next/headers");
  vi.mocked(nextHeaders.headers).mockImplementation(async () => {
    const m = new Map<string, string>();
    m.set("x-forwarded-for", IP_ACTUAL);
    return m as never;
  });
}

export async function desconectarAuth() {
  const auth = await import("@/lib/dashboard/auth/server");
  vi.mocked(auth.getAuthSession).mockResolvedValue(null as never);
  // `createAppointment` y las demas del panel leen el usuario de
  // `createServerClient()`, no de `getAuthSession()`. Sin esto, "sin sesion"
  // seguiria pasando el chequeo.
  const server = await import("@/lib/supabase/server");
  vi.mocked(server.createServerClient).mockImplementation(
    async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) }, from: () => ({}) }) as never,
  );
}

/** Local ajeno + su owner, para probar aislamiento multi-tenant. */
export async function crearIntruso() {
  const supabase = db();
  const email = `lab-intruso-${Math.random().toString(36).slice(2, 8)}@klip.test`;
  const { data: auth, error } = await supabase.auth.admin.createUser({
    email,
    password: "lab-turnos-123456",
    email_confirm: true,
  });
  if (error) throw error;
  const slug = `lab-ajeno-${Math.random().toString(36).slice(2, 8)}`;
  const { data: shop, error: eShop } = await supabase
    .from("shops")
    .insert({ nombre: `${TAG} ajeno`, slug, pay_at_shop: true })
    .select("id")
    .single();
  if (eShop) throw eShop;
  await supabase.from("user_profiles").insert({
    user_id: auth.user.id,
    shop_id: shop.id,
    name: `${TAG} intruso`,
    email,
    role: "owner",
  });
  await supabase.from("shop_memberships").insert({
    shop_id: shop.id,
    user_id: auth.user.id,
    role: "owner",
    is_active: true,
  });
  return { userId: auth.user.id, shopId: shop.id, email };
}

export async function borrarIntruso(i: { userId: string; shopId: string }) {
  const supabase = db();
  await supabase.from("appointments").delete().eq("shop_id", i.shopId);
  await supabase.from("services").delete().eq("shop_id", i.shopId);
  await supabase.from("shop_memberships").delete().eq("shop_id", i.shopId);
  await supabase.from("user_profiles").delete().eq("shop_id", i.shopId);
  await supabase.from("shops").delete().eq("id", i.shopId);
  await supabase.auth.admin.deleteUser(i.userId).catch(() => {});
}

// ---------------------------------------------------------------------------
// Utilidades de asercion
// ---------------------------------------------------------------------------
export function horasDe(res: { success: boolean; data?: Array<{ start: string }> } | null): string[] {
  if (!res || !res.success || !res.data) return [];
  return res.data.map((s) => hhmmEnArt(s.start));
}

export async function cargarDisponibilidad() {
  await cablearAuth(OWNER_ID, "owner");
  const { createServiceRoleClient } = await import("@/lib/dashboard/auth/server");
  vi.mocked(createServiceRoleClient).mockImplementation(async () => db() as never);
  return import("@/lib/dashboard/booking/public-booking-actions");
}

export async function cargarTurnos() {
  await cablearAuth(OWNER_ID, "owner");
  return import("@/lib/dashboard/appointments/mutations");
}

export async function cargarNegocio() {
  await cablearAuth(OWNER_ID, "owner");
  return import("@/lib/dashboard/shop/business-actions");
}

export { describe, it, expect, beforeAll, beforeEach, afterAll, vi };

beforeAll(() => {
  if (!DB_TESTS_ON) return;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }
});