import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// El script corre con `node`, no con Next, asi que hay que cargar .env.local a mano.
if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

/**
 * Descubre las tablas desde database.types.ts en vez de hardcodearlas: asi el
 * audit no se queda viejo cuando se agrega una tabla nueva.
 */
function discoverTables() {
  const src = readFileSync("src/lib/supabase/database.types.ts", "utf8");
  // Hay un `Tables: {}` de ejemplo en el JSDoc de arriba; el real es el ultimo.
  const start = src.lastIndexOf("    Tables: {");
  if (start === -1) throw new Error("No se encontro la seccion Tables en database.types.ts");
  const end = src.indexOf("    Views: {", start);
  const block = src.slice(start, end === -1 ? undefined : end);

  const tables = [];
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^ {6}(\w+): \{$/);
    if (m) tables.push(m[1]);
  }
  if (tables.length === 0) throw new Error("No se parseo ninguna tabla de database.types.ts");
  return tables;
}

/**
 * RIESGO ACEPTADO CONOCIDO. Estas dos tablas son legibles con la anon key
 * (politicas `stock_public_select` en 081 y `combos_select_active` en 057):
 *
 *   stock  -> expone `unit_cost` (lo que el salon paga) y `quantity`
 *   combos -> 11 filas de combos activos
 *
 * Se acepta: es inteligencia competitiva, NO PII ni dinero. Las escrituras estan
 * bloqueadas (42501), asi que nadie puede modificar nada. Nadie en el codigo
 * lee estas tablas con la anon key: los paths publicos usan service role.
 *
 * Para cerrarlo esta la migracion 107, que las reemplaza por vistas con columnas
 * curadas. No se aplico a proposito: el costo/beneficio no lo justifica todavia.
 */
const ALLOWED_PUBLIC = new Set(["stock", "combos"]);

/**
 * Columnas que nunca deben salir por una lectura anon. Exponer `stock` entero
 * por una politica `for select to anon` Leandro el unit_cost (lo que el salon
 * paga) y el quantity (stock del competidor) de toda la plataforma.
 */
const SENSITIVE_COLUMNS = ["unit_cost"];

/** Columnas que SI existen en la tabla pero no en su vista publica curada (migracion 107). */
const PUBLIC_VIEW_OVERRIDES = {};

// Escrituras que la anon key jamas deberia poder hacer. Un SELECT en 0 filas no
// alcanza: lo que importaba era que cualquiera pudiera ESCRIBIR el horario de
// un competidor.
const WRITE_PROBES = [
  {
    table: "shop_date_overrides",
    row: { shop_id: "00000000-0000-0000-0000-000000000000", date: "2030-01-01", is_closed: true },
  },
  {
    table: "staff_schedules",
    row: { staff_id: "00000000-0000-0000-0000-000000000000", day_of_week: 0, start_time: "00:00", end_time: "23:59" },
  },
  {
    table: "staff_profiles",
    row: { user_id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    table: "combos",
    row: { shop_id: "00000000-0000-0000-0000-000000000000", name: "x", price: 1 },
  },
];

async function run() {
  const tables = discoverTables();
  console.log(`\n=== RLS ANON AUDIT (${tables.length} tablas) ===`);

  const exposed = [];
  const leakedColumns = [];
  const missing = [];

  for (const table of tables) {
    // Las tablas con vista publica curada se auditan contra la vista.
    const target = PUBLIC_VIEW_OVERRIDES[table] ?? table;
    // OJO: sin `head: true`. supabase-js devuelve { count: null } SIN error
    // cuando la tabla no existe, y eso hacia pasar el audit con la tabla real
    // expuesta. Con GET normal el 404 llega como PGRST205.
    const result = await supabase.from(target).select("*", { count: "exact" });
    const count = result.count ?? 0;
    const label = target === table ? table : `${table} -> ${target}`;

    const status = result.error ? "MISSING" : count > 0 ? "EXPOSED" : "OK";
    if (ALLOWED_PUBLIC.has(table)) {
      console.log(
        `${String(count > 0 ? "ACCEPTED" : "OK").padEnd(8)} ${label.padEnd(44)} count=${String(count).padEnd(7)} (riesgo aceptado: ver ALLOWED_PUBLIC)`,
      );
      continue;
    }
    if (status === "EXPOSED") exposed.push({ table: label, count });
    if (status === "MISSING") missing.push(label);
    console.log(
      `${status.padEnd(8)} ${label.padEnd(44)} count=${String(count).padEnd(7)} ${result.error ? `error=${result.error.message}` : ""}`,
    );
  }

  // Aunque el conteo de filas sea 0 (local sin productos), la politica podría
  // exponer columnas sensibles en cuanto haya data. Se chequea el shape.
  console.log("\n=== RLS ANON COLUMN CHECK (no debe filtrar datos sensibles) ===");
  for (const [table, view] of Object.entries(PUBLIC_VIEW_OVERRIDES)) {
    const { data, error } = await supabase.from(view).select("*").limit(1);
    if (error) {
      console.log(`SKIP      ${view}  (${error.message})`);
      continue;
    }
    const keys = data?.[0] ? Object.keys(data[0]) : [];
    const bad = keys.filter((k) => SENSITIVE_COLUMNS.includes(k));
    if (bad.length > 0) {
      leakedColumns.push(`${view}: ${bad.join(", ")}`);
      console.log(`LEAK      ${view}  expone ${bad.join(", ")}`);
    } else {
      console.log(`OK        ${view}  (${keys.length} columnas: ${keys.join(", ")})`);
    }
  }

  console.log("\n=== RLS ANON WRITE PROBE (debe fallar) ===");
  const writable = [];
  for (const probe of WRITE_PROBES) {
    const { error } = await supabase.from(probe.table).insert(probe.row).select();
    const blocked = Boolean(error);
    console.log(`${(blocked ? "OK" : "WRITABLE").padEnd(9)} ${probe.table}${error ? `  (${error.code})` : ""}`);
    if (!blocked) writable.push(probe.table);
  }

  if (exposed.length > 0) {
    console.error("\nRLS audit FAILED - filas publicas en:", exposed.map((e) => `${e.table}(${e.count})`).join(", "));
  }
  if (missing.length > 0) {
    console.error("RLS audit FAILED - objetivos no encontrados (migracion no aplicada?):", missing.join(", "));
  }
  if (leakedColumns.length > 0) {
    console.error("RLS audit FAILED - columnas sensibles expuestas:", leakedColumns.join("; "));
  }
  if (writable.length > 0) {
    console.error("RLS audit FAILED - anon puede escribir en:", writable.join(", "));
  }
  if (exposed.length === 0 && writable.length === 0 && leakedColumns.length === 0 && missing.length === 0) {
    console.log("\nRLS anon audit PASSED: sin lecturas, escrituras ni columnas sensibles por anon.");
    return;
  }
  process.exit(2);
}

run().catch((err) => {
  console.error("RLS audit failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
