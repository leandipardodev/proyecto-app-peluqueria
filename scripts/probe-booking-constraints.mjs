/**
 * Sonda COMPORTAMENTAL de las constraints de `appointments`.
 *
 * No se puede leer `pg_constraint` por PostgREST, asi que en vez de preguntar
 * "existe la constraint?" se prueba: se inserta un turno y se intenta meter
 * otro que lo pisa. Si la base lo rechaza, la constraint esta viva.
 *
 *   node scripts/probe-booking-constraints.mjs
 *
 * Crea un local y un profesional desechables y los borra al final.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sufijo = Date.now().toString(36).slice(-6);
const email = `probe-constraints-${sufijo}@klip.test`;
let shopId;
let staffId;
let userId;

function art(dia, hhmm) {
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${fecha}T${hhmm}:00-03:00`;
}

async function crearBase() {
  const { data: auth, error } = await db.auth.admin.createUser({ email, password: "x-1234567890", email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  userId = auth.user.id;
  const { data: shop, error: eShop } = await db
    .from("shops")
    .insert({ nombre: "[probe] constraints", slug: `probe-constraints-${sufijo}` })
    .select("id")
    .single();
  if (eShop) throw new Error(`shops: ${eShop.message}`);
  shopId = shop.id;
  await db.from("user_profiles").insert({ user_id: userId, shop_id: shopId, name: "Probe", email, role: "owner" });
  await db.from("shop_memberships").insert({ shop_id: shopId, user_id: userId, role: "staff", is_active: true });
  staffId = userId;
  const { data: svc, error: eSvc } = await db
    .from("services")
    .insert({ shop_id: shopId, name: "[probe] svc", price: 10000, duration_minutes: 30, category: "General" })
    .select("id")
    .single();
  if (eSvc) throw new Error(`services: ${eSvc.message}`);
  return svc.id;
}

async function turno({ desde, hasta, status, conStaff = true }) {
  const { error } = await db.from("appointments").insert({
    shop_id: shopId,
    service_id: servicioId,
    service_price: 10000,
    staff_id: conStaff ? staffId : null,
    start_time: art(dia, desde),
    end_time: art(dia, hasta),
    date_key_ar: dia,
    status,
    is_paid: status === "confirmed",
  });
  return error;
}

let servicioId;
let dia;

async function main() {
  servicioId = await crearBase();
  dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 86400000));

  console.log(`Local [probe] ${shopId}\n`);

  // 1. confirmed que se pisa: ESTA es la que debe bloquear (migracion 109).
  let e = await turno({ desde: "10:00", hasta: "10:30", status: "confirmed" });
  console.log("1er confirmed 10:00-10:30           ->", e ? "RECHAZADO" : "aceptado");
  e = await turno({ desde: "10:15", hasta: "10:45", status: "confirmed" });
  console.log("2do confirmed 10:15-10:45 (pisa)    ->", e ? `RECHAZADO (${e.code}) ${e.message.slice(0, 70)}` : "ACEPTADO  <-- sin proteccion");

  // 2. pending_payment que se pisa: la 109 NO lo cubre a proposito.
  e = await turno({ desde: "14:00", hasta: "14:30", status: "pending_payment" });
  console.log("1er pending_payment 14:00-14:30      ->", e ? "RECHAZADO" : "aceptado");
  e = await turno({ desde: "14:10", hasta: "14:40", status: "pending_payment" });
  console.log("2do pending_payment 14:10-14:40(pisa) ->", e ? `RECHAZADO (${e.code})` : "ACEPTADO  <-- carrera de pago");

  // 3. completed: la 109 NO lo cubre (es terminal).
  e = await turno({ desde: "16:00", hasta: "16:30", status: "completed" });
  console.log("1er completed 16:00-16:30           ->", e ? "RECHAZADO" : "aceptado");
  e = await turno({ desde: "16:10", hasta: "16:40", status: "completed" });
  console.log("2do completed 16:10-16:40 (pisa)    ->", e ? `RECHAZADO (${e.code})` : "ACEPTADO");

  // 4. Sin profesional asignado: la 109 NO lo cubre (es la cola manual).
  e = await turno({ desde: "18:00", hasta: "18:30", status: "confirmed", conStaff: false });
  console.log("1er confirmed SIN profesional         ->", e ? "RECHAZADO" : "aceptado");
  e = await turno({ desde: "18:10", hasta: "18:40", status: "confirmed", conStaff: false });
  console.log("2do confirmed SIN profesional (pisa)  ->", e ? `RECHAZADO (${e.code})` : "ACEPTADO  <-- cola manual");

  // 5. Mismo inicio exacto entre dos confirmed: lo cubria el indice de la 065,
  //    que la 103 dropeo.
  e = await turno({ desde: "20:00", hasta: "20:30", status: "confirmed" });
  console.log("1er confirmed 20:00-20:30           ->", e ? "RECHAZADO" : "aceptado");
  e = await turno({ desde: "20:00", hasta: "20:30", status: "confirmed" });
  console.log("2do confirmed 20:00-20:30 (identico)->", e ? `RECHAZADO (${e.code}) ${e.message.slice(0, 60)}` : "ACEPTADO");

  // 6. Cancelado encima: no debe bloquear.
  e = await turno({ desde: "11:00", hasta: "11:30", status: "confirmed" });
  console.log("confirmed 11:00-11:30               ->", e ? "RECHAZADO" : "aceptado");
  e = await turno({ desde: "11:10", hasta: "11:40", status: "cancelled" });
  console.log("cancelled 11:10-11:40 (pisa)        ->", e ? `RECHAZADO (${e.code})` : "aceptado  <-- correcto");
}

async function limpiar() {
  if (shopId) {
    await db.from("appointments").delete().eq("shop_id", shopId);
    await db.from("services").delete().eq("shop_id", shopId);
    await db.from("shop_memberships").delete().eq("shop_id", shopId);
    await db.from("user_profiles").delete().eq("shop_id", shopId);
    await db.from("admin_allowlist").delete().eq("shop_id", shopId);
    await db.from("shops").delete().eq("id", shopId);
  }
  if (userId) await db.auth.admin.deleteUser(userId);
  console.log("\nlimpieza ok");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(limpiar);