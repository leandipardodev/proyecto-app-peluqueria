/**
 * Borra las liquidaciones de prueba que quedaron de cuando se probaba Calcular a
 * mano y que ensucian el Historial.
 *
 * Que una liquidacion sea "basura" es lo mismo que decide `verify-seed-klip.mjs`
 * (mismas reglas, mismo criterio): no tiene items, o el encabezado no cierra con
 * los items, o no es pagada pero tiene `paid_amount`, o sus items son de otra
 * tasa que la regla vigente.
 *
 * NO toca:
 * - las liquidaciones del seed (llevan `[seed]` en `notes`; `--reset` las borra)
 * - las liquidaciones sanas, aunque sean viejas o de un solo dia. La de agosto
 *   con 9 turnos es real y se queda.
 *
 *   node scripts/purge-legacy-liquidations.mjs        lista lo que borraria
 *   node scripts/purge-legacy-liquidations.mjs --yes  lo borra
 *
 * IMPORTANTE: escribe en la base de .env.local con la service role key.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SHOP_SLUG = "klip";
const TAG = "[seed]";
const APPLY = process.argv.slice(2).includes("--yes");

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });

async function main() {
  const { data: shop, error: eShop } = await db.from("shops").select("id, nombre").eq("slug", SHOP_SLUG).maybeSingle();
  if (eShop) fail(eShop.message);
  if (!shop) fail(`No existe el local con slug "${SHOP_SLUG}"`);
  const shopId = shop.id;
  console.log(`Local: ${shop.nombre} (${SHOP_SLUG})\n`);

  const { data: reglas } = await db
    .from("staff_compensation_rules")
    .select("staff_user_id, percentage_rate")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .is("ends_on", null);

  const { data: liquidaciones, error } = await db
    .from("staff_liquidations")
    .select("id, staff_user_id, period_start, period_end, status, gross_revenue, commission_amount, final_payable, paid_amount, notes")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });
  if (error) fail(error.message);

  const { data: todosItems } = await db
    .from("staff_liquidation_items")
    .select("liquidation_id, gross_amount, commission_amount, commission_rate_snapshot")
    .eq("shop_id", shopId);
  const itemsPor = new Map();
  for (const i of todosItems || []) {
    if (!itemsPor.has(i.liquidation_id)) itemsPor.set(i.liquidation_id, []);
    itemsPor.get(i.liquidation_id).push(i);
  }

  const { data: perfiles } = await db.from("user_profiles").select("user_id, name, email").eq("shop_id", shopId);
  const nombreDe = (u) => perfiles?.find((p) => p.user_id === u)?.name || perfiles?.find((p) => p.user_id === u)?.email || u.slice(0, 8);

  const basura = [];
  for (const l of liquidaciones || []) {
    if (typeof l.notes === "string" && l.notes.startsWith(TAG)) continue; // del seed: no se toca
    const items = itemsPor.get(l.id) || [];
    const suma = (f) => items.reduce((s, i) => s + Number(f(i) || 0), 0);
    const brutoItems = suma((i) => i.gross_amount);
    const comItems = suma((i) => i.commission_amount);
    const tasa = items.length ? Number(items[0].commission_rate_snapshot) : null;
    const regla = reglas?.find((r) => r.staff_user_id === l.staff_user_id);

    const motivos = [];
    if (items.length === 0) motivos.push("sin items: el Historial abriria vacio");
    if (Math.abs(brutoItems - Number(l.gross_revenue)) > 1) motivos.push(`bruto ${l.gross_revenue} vs items ${brutoItems}`);
    if (Math.abs(comItems - Number(l.commission_amount)) > 1) motivos.push(`comision ${l.commission_amount} vs items ${comItems}`);
    if (tasa !== null && Math.abs(Math.round((brutoItems * tasa) / 100) - Number(l.commission_amount)) > 1) {
      motivos.push(`comision != bruto * ${tasa}%`);
    }
    if (Number(l.final_payable) !== Number(l.commission_amount)) motivos.push("final != comision");
    if (l.status === "paid" && Number(l.paid_amount) !== Number(l.final_payable)) motivos.push("pagada pero paid_amount != final_payable");
    if (l.status !== "paid" && Number(l.paid_amount) !== 0) motivos.push("no pagada pero con paid_amount");
    if (tasa !== null && regla && Number(regla.percentage_rate) !== tasa) {
      motivos.push(`items al ${tasa}% pero la regla vigente dice ${regla.percentage_rate}%`);
    }

    if (motivos.length) {
      basura.push({ l, motivos, nombre: nombreDe(l.staff_user_id), items: items.length });
    }
  }

  if (basura.length === 0) {
    console.log("No hay liquidaciones de prueba que limpiar.");
    return;
  }

  console.log(`Se borrarian ${basura.length} liquidaciones:\n`);
  for (const b of basura) {
    console.log(`  ${b.nombre.padEnd(10)} ${b.l.period_start}..${b.l.period_end}  ${String(b.l.status).padEnd(9)} bruto ${money(b.l.gross_revenue).padStart(10)}  items ${b.items}`);
    b.motivos.forEach((m) => console.log(`      - ${m}`));
  }
  const seQuedan = (liquidaciones || []).length - basura.length;
  console.log(`\nSe quedan ${seQuedan} liquidaciones (incluidas las del seed y las sanas).`);

  if (!APPLY) {
    console.log("\n--dry: no se borro nada. Para borrar de verdad: node scripts/purge-legacy-liquidations.mjs --yes\n");
    return;
  }

  // Los items primero: tienen foreign key a la liquidacion.
  const ids = basura.map((b) => b.l.id);
  const rItems = await db.from("staff_liquidation_items").delete({ count: "exact" }).in("liquidation_id", ids);
  if (rItems.error) fail(`staff_liquidation_items: ${rItems.error.message}`);
  const rLiq = await db.from("staff_liquidations").delete({ count: "exact" }).in("id", ids);
  if (rLiq.error) fail(`staff_liquidations: ${rLiq.error.message}`);

  console.log(`\nBorradas ${basura.length} liquidaciones y ${rItems.count ?? 0} items.`);
  console.log(`Quedan ${(liquidaciones || []).length - (rLiq.count ?? 0)} liquidaciones en el local.\n`);
}

function fail(msg) {
  console.error("ERROR: " + msg);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});