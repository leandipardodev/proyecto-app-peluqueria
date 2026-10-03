import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SHOP = "18e5e411-c31c-434e-8a48-a1f155823f57";
const hoy = "2026-10-02";
const d0 = `${hoy}T00:00:00-03:00`;
const d1 = `${hoy}T23:59:59-03:00`;

const out = [];
const ok = (c, m) => out.push((c ? "OK   " : "FALLA") + "  " + m);

// --- fetchFinanceData: ingresos / gastos -----------------------------------
const [appts, gastos, movs] = await Promise.all([
  db.from("appointments").select("service_price").eq("shop_id", SHOP).eq("status", "completed").eq("is_paid", true).gte("start_time", d0).lte("start_time", d1),
  db.from("finances").select("amount").eq("shop_id", SHOP).eq("type", "expense").gte("happened_at", d0).lte("happened_at", d1),
  db.from("cash_movements").select("movement_type, amount").eq("shop_id", SHOP).gte("happened_at", d0).lte("happened_at", d1),
]);
ok(!appts.error && (appts.data?.length ?? 0) > 0, `ingresos: ${appts.data?.length ?? 0} turnos pagados de HOY (error: ${appts.error?.message ?? "ninguno"})`);
ok(!gastos.error && (gastos.data?.length ?? 0) > 0, `gastos: ${gastos.data?.length ?? 0} filas de HOY (error: ${gastos.error?.message ?? "ninguno"})`);

const inc = (appts.data ?? []).reduce((s, a) => s + Number(a.service_price || 0), 0);
const gas = (gastos.data ?? []).reduce((s, g) => s + Number(g.amount || 0), 0);
ok(inc > 0 && gas > 0 && inc !== gas, `KPI no triviales: ingresos $${inc.toLocaleString("es-AR")} gastos $${gas.toLocaleString("es-AR")} balance $${(inc - gas).toLocaleString("es-AR")}`);

// --- fetchCashSession: la caja abierta --------------------------------------
const { data: sesion } = await db.from("cash_sessions").select("*").eq("shop_id", SHOP).eq("status", "open").maybeSingle();
ok(!!sesion, `caja abierta: ${sesion ? "si, desde " + sesion.opened_at : "NO HAY"}`);

if (sesion) {
  const { data: sm } = await db.from("cash_movements").select("movement_type, amount").eq("shop_id", SHOP).eq("cash_session_id", sesion.id);
  const movementNet = (sm ?? []).reduce((s, m) => s + (m.movement_type === "expense" || m.movement_type === "withdrawal" ? -Number(m.amount || 0) : Number(m.amount || 0)), 0);
  const { data: sa } = await db.from("appointments").select("service_price").eq("shop_id", SHOP).eq("status", "completed").eq("is_paid", true).gte("start_time", sesion.opened_at).lte("start_time", new Date().toISOString());
  const appointmentIncome = (sa ?? []).reduce((s, a) => s + Number(a.service_price || 0), 0);
  const esperado = Number(sesion.opening_amount) + movementNet + appointmentIncome;

  ok(movementNet !== 0, `movementNet = $${movementNet.toLocaleString("es-AR")} (NO es 0, que era el bug)`);
  ok(appointmentIncome > 0, `appointmentIncome = $${appointmentIncome.toLocaleString("es-AR")} (NO es 0)`);
  ok((sm ?? []).length > 0, `movimientos de la sesion: ${(sm ?? []).length} (la lista "Movimientos recientes" tiene contenido)`);
  console.log(`\n  Esperado en caja: $${esperado.toLocaleString("es-AR")}  (inicial $${Number(sesion.opening_amount).toLocaleString("es-AR")} + mov $${movementNet.toLocaleString("es-AR")} + turnos $${appointmentIncome.toLocaleString("es-AR")})`);
}

// --- cierres recientes --------------------------------------------------------
const { data: hist } = await db.from("cash_sessions").select("opened_at, status, counted_amount, difference_amount").eq("shop_id", SHOP).eq("status", "closed").order("opened_at", { ascending: false });
ok((hist?.length ?? 0) > 0, `cierres cerrados: ${hist?.length ?? 0} (llena "Cierres recientes")`);
ok((hist ?? []).every((h) => h.difference_amount !== null), "todos los cierres tienen diferencia calculada (se muestra el bloque)");

// --- produccion del equipo ----------------------------------------------------
const { data: staff } = await db.from("shop_memberships").select("user_id, role").eq("shop_id", SHOP).eq("role", "staff");
const { data: prod } = await db.from("appointments").select("staff_id, service_price").eq("shop_id", SHOP).eq("status", "completed").eq("is_paid", true).gte("start_time", d0).lte("start_time", d1);
const porBarbero = (staff ?? []).map((s) => ({ staff: s.user_id, n: (prod ?? []).filter((p) => p.staff_id === s.user_id).length }));
ok(porBarbero.some((p) => p.n > 0), `Equipo con produccion HOY: ${porBarbero.map((p) => `${p.staff.slice(0, 8)}=${p.n}`).join(", ")}`);
ok((staff ?? []).length > 0, `hay ${(staff ?? []).length} empleados para la tabla (y para probar el filtro de rol)`);

// --- el seed es reversible -----------------------------------------------------
const { count: sembradosMovs } = await db.from("cash_movements").select("id", { count: "exact", head: true }).eq("shop_id", SHOP).like("description", "[seed]%");
ok((sembradosMovs ?? 0) > 0, `todo lo sembrado esta marcado con [seed]: ${sembradosMovs} movimientos (--reset los borra)`);

out.forEach((l) => console.log(l));
console.log("\n" + (out.some((l) => l.startsWith("FALLA")) ? "HAY FALLAS" : "TODO OK"));