import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

const TABLES = [
  "shops",
  "services",
  "appointments",
  "customers",
  "finances",
  "cash_sessions",
  "cash_movements",
  "staff_liquidations",
];

async function run() {
  const rows = [];

  for (const table of TABLES) {
    const result = await supabase.from(table).select("*", { count: "exact", head: true });
    rows.push({
      table,
      count: result.count ?? 0,
      error: result.error?.message ?? null,
      code: result.error?.code ?? null,
    });
  }

  console.log("\n=== RLS ANON AUDIT ===");
  for (const row of rows) {
    const status = row.error ? "ERR" : row.count > 0 ? "EXPOSED" : "OK";
    console.log(`${status.padEnd(8)} ${row.table.padEnd(20)} count=${String(row.count).padEnd(6)} ${row.error ? `error=${row.error}` : ""}`);
  }

  const exposed = rows.filter((r) => !r.error && r.count > 0);
  if (exposed.length > 0) {
    console.error("\nRLS audit failed: public rows exposed in:", exposed.map((e) => e.table).join(", "));
    process.exit(2);
  }

  console.log("\nRLS anon audit passed: no public rows exposed in audited tables.");
}

run().catch((err) => {
  console.error("RLS audit failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
