import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: shop, error: eShop } = await db.from("shops").select("id, nombre").eq("slug", "klip").maybeSingle();
if (eShop) { console.error(eShop.message); process.exit(1); }
if (!shop) { console.error('No existe el local con slug "klip"'); process.exit(1); }
const SHOP = shop.id;
console.log(`Local: ${shop.nombre} (klip)  ${SHOP}\n`);

const { data: members } = await db.from("shop_memberships").select("user_id, role").eq("shop_id", SHOP);
const { data: perfiles } = await db.from("user_profiles").select("user_id, nombre, email").eq("shop_id", SHOP);
const nombre = (uid) => { const p = perfiles?.find((x) => x.user_id === uid); return p?.nombre || p?.email || uid.slice(0, 8); };

console.log("=== EQUIPO ===");
for (const m of members || []) console.log(`  ${m.role.padEnd(8)} ${nombre(m.user_id)}  ${m.user_id}`);

console.log("\n=== REGLAS DE COMPENSACION (de donde sale el % ) ===");
const { data: rules } = await db.from("staff_compensation_rules")
  .select("staff_user_id, model, percentage_rate, fixed_amount, is_active, ends_on, starts_on")
  .eq("shop_id", SHOP);
if (!rules || rules.length === 0) console.log("  NO HAY REGLAS -> la app usa el default de 40%");
for (const r of rules || []) {
  console.log(`  ${nombre(r.staff_user_id).padEnd(14)} model=${r.model} pct=${r.percentage_rate} fijo=${r.fixed_amount} activo=${r.is_active} ends_on=${r.ends_on ?? "-"}`);
}

console.log("\n=== OVERRIDES POR SERVICIO ===");
const { data: ov } = await db.from("staff_commission_overrides").select("compensation_rule_id, service_id, percentage_rate");
console.log("  total:", (ov || []).length);

console.log("\n=== TURNOS HOY (completed + is_paid), por empleado ===");
const { data: hoy } = await db.from("appointments")
  .select("staff_id, service_price, start_time")
  .eq("shop_id", SHOP).eq("status", "completed").eq("is_paid", true)
  .gte("start_time", "2026-10-02T00:00:00-03:00").lte("start_time", "2026-10-02T23:59:59-03:00");
const por = {};
for (const a of hoy || []) {
  por[a.staff_id] ??= { n: 0, bruto: 0 };
  por[a.staff_id].n++;
  por[a.staff_id].bruto += Number(a.service_price || 0);
}
for (const m of members || []) {
  const p = por[m.user_id];
  console.log(`  ${nombre(m.user_id).padEnd(14)} ${p ? `${p.n} turnos, bruto $${p.bruto.toLocaleString("es-AR")}` : "SIN TURNOS HOY -> liquidacion $0"}`);
}

console.log("\n=== ULTIMAS LIQUIDACIONES CREADAS ===");
const { data: liq } = await db.from("staff_liquidations")
  .select("staff_user_id, period_start, period_end, status, gross_revenue, commission_amount, final_payable, created_at")
  .eq("shop_id", SHOP).order("created_at", { ascending: false }).limit(6);
for (const l of liq || []) {
  console.log(`  ${nombre(l.staff_user_id).padEnd(14)} ${l.period_start}->${l.period_end} status=${l.status} bruto=${l.gross_revenue} comision=${l.commission_amount} final=${l.final_payable} (${String(l.created_at).slice(0,16)})`);
}