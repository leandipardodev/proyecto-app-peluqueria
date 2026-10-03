/**
 * Siembra datos de demo en el local de pruebas `klip` para poder probar Caja /
 * Finanzas, que sin movimientos no tienen nada que mostrar.
 *
 * Contexto: el local tiene 470 turnos pero el ultimo es del dia anterior, y cero
 * cash_sessions, cero cash_movements y cero gastos. La pagina abre por defecto en
 * el rango de HOY, asi que sin esto no hay ni ingresos, ni gastos, ni caja.
 *
 * Solo escribe filas marcadas con el prefijo `[seed]`, para que `--reset` borre
 * exactamente lo que puso este script y nada mas.
 *
 *   node scripts/seed-klip-demo.mjs           siembra si todavia no hay nada sembrado
 *   node scripts/seed-klip-demo.mjs --reset   borra lo sembrado y vuelve a sembrar
 *   node scripts/seed-klip-demo.mjs --dry     muestra el plan sin escribir
 *
 * IMPORTANTE: escribe en la base de .env.local con la service role key.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SHOP_SLUG = "klip";
const TAG = "[seed]";
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const RESET = args.includes("--reset");

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------- fechas (ART)
const TZ = "America/Argentina/Buenos_Aires";
const fmtFecha = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hoy = () => fmtFecha.format(new Date());
const haceDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmtFecha.format(d); };
/** Timestamp con offset -03:00, que es como guarda la app. */
const art = (fecha, hhmm) => `${fecha}T${hhmm}:00-03:00`;

// ------------------------------------------------------------------ helpers
const ARS = (n) => Math.round(n);
const fail = (msg) => { console.error("ERROR: " + msg); process.exit(1); };

async function borrarSembrado(shopId) {
  const conTag = (col) => db.from(col).delete({ count: "exact" }).eq("shop_id", shopId).like("description", `${TAG}%`);
  const { data: movs } = await db.from("cash_movements").select("id, cash_session_id").eq("shop_id", shopId).like("description", `${TAG}%`);
  const sessionIds = [...new Set((movs || []).map((m) => m.cash_session_id).filter(Boolean))];

  const r1 = await conTag("finances");
  const r2 = await conTag("cash_movements");
  const r3 = await db.from("appointments").delete({ count: "exact" }).eq("shop_id", shopId).eq("notes", TAG);
  let r4 = { count: 0 };
  for (const id of sessionIds) {
    const r = await db.from("cash_sessions").delete({ count: "exact" }).eq("id", id);
    r4.count = (r4.count || 0) + (r.count || 0);
  }
  for (const [n, r] of [["finances", r1], ["cash_movements", r2], ["appointments", r3], ["cash_sessions", r4]]) {
    if (r.error) console.error(`  ! no se pudo borrar de ${n}: ${r.error.message}`);
  }
  console.log(`Borrado: finances=${r1.count ?? 0} cash_movements=${r2.count ?? 0} appointments=${r3.count ?? 0} cash_sessions=${r4.count ?? 0}`);
}

async function main() {
  // --------------------------------------------------------------- local
  const { data: shop, error: eShop } = await db.from("shops").select("id, slug, nombre").eq("slug", SHOP_SLUG).maybeSingle();
  if (eShop) fail(eShop.message);
  if (!shop) fail(`No existe el local con slug "${SHOP_SLUG}"`);
  const shopId = shop.id;
  console.log(`Local: ${shop.nombre} (${shop.slug})  ${shopId}`);

  if (RESET) await borrarSembrado(shopId);

  const { count: yaHay } = await db.from("cash_movements").select("id", { count: "exact", head: true }).eq("shop_id", shopId).like("description", `${TAG}%`);
  if ((yaHay ?? 0) > 0 && !RESET) {
    console.log(`\nYa hay ${yaHay} movimientos sembrados. No se toca nada.`);
    console.log("Para volver a sembrar: node scripts/seed-klip-demo.mjs --reset\n");
    return;
  }

  // ---------------------------------------------------------- catálogo base
  const { data: servicios } = await db.from("services").select("id, name, price, duration_minutes").eq("shop_id", shopId).order("price");
  if (!servicios || servicios.length === 0) fail("El local no tiene servicios");
  const svc = (n) => {
    const s = servicios.find((x) => x.name.toLowerCase().includes(n));
    if (!s) fail(`No se encontro el servicio "${n}"`);
    return s;
  };

  const { data: membresias } = await db.from("shop_memberships").select("user_id, role").eq("shop_id", shopId);
  const { data: perfiles } = await db.from("user_profiles").select("user_id, nombre").eq("shop_id", shopId);
  const nombreDe = (uid) => perfiles?.find((p) => p.user_id === uid)?.nombre || "?";
  const equipo = (membresias || []).filter((m) => m.role === "staff" || m.role === "admin" || m.role === "owner");
  const barberos = equipo.filter((m) => m.role === "staff").map((m) => m.user_id);
  console.log(`Equipo: ${equipo.map((m) => `${m.role}:${nombreDe(m.user_id)}`).join(", ")}`);
  const barberosUsables = barberos.length >= 3 ? barberos.slice(0, 3) : barberos.length >= 1 ? barberos : equipo.map((m) => m.user_id);
  if (barberosUsables.length === 0) fail("El local no tiene miembros para asignar turnos");

  const { data: clientes } = await db.from("customers").select("id, nombre").eq("shop_id", shopId).limit(30);
  if (!clientes || clientes.length === 0) fail("El local no tiene clientes");
  const cli = (i) => clientes[i % clientes.length].id;

  const d0 = hoy();
  console.log(`\nDia a sembrar: ${d0}  (${art(d0, "09:00")})`);
  console.log(`Servicios usados: ${barberosUsables.length} barberos, ${clientes.length} clientes, ${servicios.length} servicios`);

  // --------------------------------------------------------------- plan
  const planTurnos = [
    ["09:00", svc("fade"),        "completed", true,  "cash",     0],
    ["09:40", svc("tintura"),     "completed", true,  "cash",     1],
    ["10:45", svc("alisado"),     "completed", true,  "cash",     0],
    ["11:15", svc("french"),      "completed", true,  "transfer", 2 % 3],
    ["11:45", svc("voluminizador"),"completed",true,  "cash",     1 % barberosUsables.length],
    ["12:40", svc("mohicano"),    "completed", true,  "cash",     0],
    ["13:10", svc("money"),       "completed", true,  "transfer", 2 % barberosUsables.length],
    ["14:05", svc("baby"),        "completed", true,  "cash",     1 % barberosUsables.length],
    ["14:35", svc("fade"),        "completed", true,  "cash",     0],
    ["15:30", svc("ondas"),       "completed", true,  "transfer", 2 % barberosUsables.length],
    ["16:00", svc("keratina"),    "completed", true,  "cash",     1 % barberosUsables.length],
    ["16:30", svc("californianas"),"cancelled",false, "cash",     0],
    ["17:10", svc("texturizado"), "confirmed", false, "cash",     2 % barberosUsables.length],
  ];

  const planMovs = [
    ["09:05", "income",     "General",              "Venta de insumos y productos",        18500],
    ["10:30", "expense",    "Insumos",              "Compra de tintes y keratina",         32000],
    ["12:15", "income",     "General",              "Propinas y venta de cepillos",          9500],
    ["13:40", "expense",    "Servicios",            "Pago de luz y gas",                   14500],
    ["15:00", "withdrawal", "Retiro",               "Retiro a cuenta del dueño",           60000],
    ["16:45", "expense",    "Insumos",              "Reposición de insumos",                8900],
  ];

  const planGastos = [
    [d0,              "10:00", "Insumos",   "Insumos del dia (tintes, keratina, aminoglicol)", 38500],
    [d0,              "13:00", "Publicidad","Campaña de Instagram de la semana",                12000],
    [haceDias(1),     "11:00", "Insumos",   "Reposición de insumos",                            21000],
    [haceDias(2),     "10:30", "Servicios", "Factura de luz",                                  27500],
    [haceDias(3),     "18:00", "Alquiler",  "Alquiler del local (mitad de mes)",              180000],
    [haceDias(4),     "12:00", "Otros",     "Varios:Delivery, hielo, descartables",           15400],
  ];

  console.log(`\nPlan: ${planTurnos.length} turnos hoy, ${planMovs.length} movimientos de caja, ${planGastos.length} gastos, 1 caja abierta + 3 cerradas`);
  if (DRY) { console.log("\n--dry: no se escribe nada.\n"); return; }

  // --------------------------------------------------------- caja de hoy
  const apertura = 50000;
  const { data: sesion, error: eSesion } = await db
    .from("cash_sessions")
    .insert({ shop_id: shopId, opened_at: art(d0, "09:00"), opened_by: barberosUsables[0], opening_amount: apertura, status: "open", close_notes: `${TAG} caja de hoy` })
    .select("id")
    .single();
  if (eSesion) fail(`cash_sessions: ${eSesion.message}`);

  const filasMovs = planMovs.map(([hh, tipo, cat, desc, monto]) => ({
    shop_id: shopId, cash_session_id: sesion.id, movement_type: tipo, payment_method: "cash",
    category: cat, amount: ARS(monto), description: `${TAG} ${desc}`, happened_at: art(d0, hh),
  }));
  const { error: eMovs } = await db.from("cash_movements").insert(filasMovs);
  if (eMovs) fail(`cash_movements: ${eMovs.message}`);

  // --------------------------------------------------------------- turnos
  const filasTurnos = planTurnos.map(([hh, s, estado, pagado, metodo, bIdx]) => {
    const [h, m] = hh.split(":").map(Number);
    const start = art(d0, `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    const fin = new Date(new Date(start).getTime() + (s.duration_minutes || 30) * 60000).toISOString();
    return {
      shop_id: shopId, customer_id: cli(Math.floor(h * 3 + m)), service_id: s.id,
      service_price: Number(s.price), staff_id: barberosUsables[bIdx % barberosUsables.length],
      start_time: start, end_time: fin, date_key_ar: d0,
      status: estado, is_paid: pagado, payment_method: metodo, notes: TAG,
    };
  });
  const { error: eTurnos } = await db.from("appointments").insert(filasTurnos);
  if (eTurnos) fail(`appointments: ${eTurnos.message}`);

  // -------------------------------------------------------------- gastos
  const filasGastos = planGastos.map(([fecha, hh, cat, desc, monto]) => ({
    shop_id: shopId, type: "expense", category: cat, amount: ARS(monto),
    description: `${TAG} ${desc}`, happened_at: art(fecha, hh), created_at: art(fecha, hh),
  }));
  const { error: eGastos } = await db.from("finances").insert(filasGastos);
  if (eGastos) fail(`finances: ${eGastos.message}`);

  // ------------------------------------- caja de dias previos, ya cerrada
  const cierres = [
    [haceDias(1), 48000, 45500],
    [haceDias(2), 52000, 52000],
    [haceDias(4), 50000, 49200],
  ];
  for (const [fecha, esperado, contado] of cierres) {
    const { data: s2, error: e2 } = await db
      .from("cash_sessions")
      .insert({ shop_id: shopId, opened_at: art(fecha, "09:00"), closed_at: art(fecha, "20:00"), opened_by: barberosUsables[0], opening_amount: 30000, status: "closed", expected_amount: esperado, counted_amount: contado, difference_amount: ARS(contado - esperado), close_notes: `${TAG} cierre ${fecha}` })
      .select("id").single();
    if (e2) { console.error(`  ! cash_sessions ${fecha}: ${e2.message}`); continue; }
    await db.from("cash_movements").insert([{
      shop_id: shopId, cash_session_id: s2.id, movement_type: "income", payment_method: "cash",
      category: "General", amount: ARS(esperado - 30000), description: `${TAG} Recaudacion del dia`, happened_at: art(fecha, "20:00"),
    }]);
  }

  // ------------------------------------------------------------- resumen
  const { data: turnosHoy } = await db.from("appointments").select("service_price").eq("shop_id", shopId).eq("status", "completed").eq("is_paid", true).gte("start_time", art(d0, "00:00")).lte("start_time", art(d0, "23:59:59"));
  const ingresos = (turnosHoy || []).reduce((s, a) => s + Number(a.service_price || 0), 0);
  const { data: gastosHoy } = await db.from("finances").select("amount").eq("shop_id", shopId).eq("type", "expense").gte("happened_at", art(d0, "00:00")).lte("happened_at", art(d0, "23:59:59"));
  const totalGastos = (gastosHoy || []).reduce((s, g) => s + Number(g.amount || 0), 0);

  console.log(`\nListo. Para HOY (${d0}) deberias ver:`);
  console.log(`  Ingresos      $${ingresos.toLocaleString("es-AR")}   (${turnosHoy?.length ?? 0} turnos pagados)`);
  console.log(`  Gastos        $${totalGastos.toLocaleString("es-AR")}`);
  console.log(`  Balance       $${(ingresos - totalGastos).toLocaleString("es-AR")}`);
  console.log(`  Caja          abierta, inicial $${apertura.toLocaleString("es-AR")}`);
  console.log(`  Mov:          $${planMovs.reduce((s, m) => s + (m[1] === "expense" || m[1] === "withdrawal" ? -Number(m[4]) : Number(m[4])), 0).toLocaleString("es-AR")}`);
  console.log(`  Turnos:       $${ingresos.toLocaleString("es-AR")}`);
  console.log(`\nPara volver a dejar como estaba: node scripts/seed-klip-demo.mjs --reset\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });