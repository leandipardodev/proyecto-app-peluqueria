import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TABLAS = [
  "shops", "services", "customers", "appointments", "cash_sessions",
  "cash_movements", "finances", "staff_liquidations", "shop_memberships",
];

async function main() {
  const { data: shops, error } = await admin.from("shops").select("id, slug, nombre, industry, plan_expiry, active");
  if (error) throw error;
  console.log("=== shops ===");
  for (const s of shops) console.log(`  ${s.slug.padEnd(22)} ${s.id}  ${s.nombre}  (${s.industry})`);

  const klip = shops.find((s) => s.slug === "klip");
  if (!klip) { console.log("\nNO existe un local con slug 'klip'"); return; }
  const shopId = klip.id;
  console.log(`\n=== conteos del local klip (${shopId}) ===`);

  for (const t of TABLAS) {
    const col = t === "shops" ? "id" : "shop_id";
    const q = col === "id" ? admin.from(t).select("*", { count: "exact", head: true }) : admin.from(t).select("*", { count: "exact", head: true }).eq(col, shopId);
    const { count, error: e } = await q;
    console.log(`  ${t.padEnd(20)} ${count ?? "?"}${e ? "  ERROR: " + e.message : ""}`);
  }

  const { data: servicios } = await admin.from("services").select("id, name, price, duration_minutes, pay_at_shop, hide_price").eq("shop_id", shopId);
  console.log(`\n=== servicios (${servicios?.length}) ===`);
  for (const s of servicios || []) console.log(`  ${String(s.name).padEnd(28)} $${s.price}  ${s.duration_minutes}min  pay_at_shop=${s.pay_at_shop} hide_price=${s.hide_price}`);

  const { data: staff } = await admin.from("shop_memberships").select("user_id, role, user_profiles:user_id(nombre,email)").eq("shop_id", shopId);
  console.log(`\n=== equipo (${staff?.length}) ===`);
  for (const m of staff || []) {
    const p = Array.isArray(m.user_profiles) ? m.user_profiles[0] : m.user_profiles;
    console.log(`  ${m.role.padEnd(8)} ${m.user_id}  ${p?.nombre || p?.email || "(sin perfil)"}`);
  }

  const { data: clientes } = await admin.from("customers").select("id, nombre, telefono").eq("shop_id", shopId).limit(8);
  console.log(`\n=== clientes (muestra) ===`);
  for (const c of clientes || []) console.log(`  ${String(c.nombre).padEnd(28)} ${c.telefono || ""}`);

  const hoy = new Date();
  const iso = hoy.toISOString();
  const { data: turnos } = await admin.from("appointments").select("id, start_time, status, is_paid, service_price, staff_id").eq("shop_id", shopId).order("start_time", { ascending: false }).limit(8);
  console.log(`\n=== ultimos turnos ===`);
  for (const a of turnos || []) console.log(`  ${a.start_time}  ${a.status}  paid=${a.is_paid}  $${a.service_price}`);

  const { data: caja } = await admin.from("cash_sessions").select("*").eq("shop_id", shopId).order("opened_at", { ascending: false }).limit(5);
  console.log(`\n=== cash_sessions ===`);
  for (const c of caja || []) console.log(`  ${c.opened_at}  ${c.status}  opening=${c.opening_amount} expected=${c.expected_amount} counted=${c.counted_amount}`);
}

main().catch((e) => { console.error(e); process.exit(1); });