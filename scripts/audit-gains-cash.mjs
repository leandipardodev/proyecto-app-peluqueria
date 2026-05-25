import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
let shopId = process.env.AUDIT_SHOP_ID;
const from = process.env.AUDIT_FROM;
const to = process.env.AUDIT_TO;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!from || !to) {
  console.error("Missing AUDIT_FROM or AUDIT_TO (format YYYY-MM-DD)");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

if (!shopId) {
  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, nombre, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!shops || shops.length === 0) {
    console.error("No shops found. Define AUDIT_SHOP_ID manually.");
    process.exit(1);
  }
  shopId = shops[0].id;
  console.log(`AUDIT_SHOP_ID not set. Using latest shop: ${shops[0].nombre || "(sin nombre)"} (${shopId})`);
}

const startIso = `${from}T00:00:00-03:00`;
const endIso = `${to}T23:59:59-03:00`;

function monthAr(value) {
  const d = new Date(value);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit" });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

const { data: appointments, error: apptErr } = await supabase
  .from("appointments")
  .select("id, start_time, status, is_paid, services:service_id(price)")
  .eq("shop_id", shopId)
  .gte("start_time", startIso)
  .lte("start_time", endIso)
  .in("status", ["scheduled", "confirmed", "completed"]);

if (apptErr) throw apptErr;

const { data: finances, error: finErr } = await supabase
  .from("finances")
  .select("id, amount, type, description, created_at")
  .eq("shop_id", shopId)
  .gte("created_at", startIso)
  .lte("created_at", endIso);

if (finErr) throw finErr;

const appointmentIncome = (appointments || []).reduce((sum, row) => {
  const svc = Array.isArray(row.services) ? row.services[0] : row.services;
  return sum + Number(svc?.price || 0);
}, 0);

const paidAppointmentIncome = (appointments || []).reduce((sum, row) => {
  const svc = Array.isArray(row.services) ? row.services[0] : row.services;
  if (row.status === "completed" && row.is_paid) return sum + Number(svc?.price || 0);
  return sum;
}, 0);

const extraIncome = (finances || []).filter((f) => f.type === "income").reduce((sum, f) => sum + Number(f.amount || 0), 0);
const expenses = (finances || []).filter((f) => f.type === "expense").reduce((sum, f) => sum + Number(f.amount || 0), 0);

const monthRows = new Map();
for (const row of appointments || []) {
  const m = monthAr(row.start_time);
  const svc = Array.isArray(row.services) ? row.services[0] : row.services;
  const current = monthRows.get(m) || { appointmentsIncome: 0, financeIncome: 0, financeExpenses: 0 };
  current.appointmentsIncome += Number(svc?.price || 0);
  monthRows.set(m, current);
}
for (const row of finances || []) {
  const m = monthAr(row.created_at);
  const current = monthRows.get(m) || { appointmentsIncome: 0, financeIncome: 0, financeExpenses: 0 };
  if (row.type === "income") current.financeIncome += Number(row.amount || 0);
  if (row.type === "expense") current.financeExpenses += Number(row.amount || 0);
  monthRows.set(m, current);
}

const suspicious = (finances || []).filter((f) =>
  f.type === "income" && /turno|seña|sena|reserva/i.test(String(f.description || ""))
);

console.log("\n=== AUDIT: GANANCIAS Y CAJA ===");
console.log(`Shop: ${shopId}`);
console.log(`Range AR: ${from} -> ${to}`);
console.log("--------------------------------");
console.log(`Appointments income (billable states): ${appointmentIncome.toFixed(2)}`);
console.log(`Appointments paid income (completed+paid): ${paidAppointmentIncome.toFixed(2)}`);
console.log(`Extra income (finances): ${extraIncome.toFixed(2)}`);
console.log(`Expenses (finances): ${expenses.toFixed(2)}`);
console.log(`Current formula income (appointments + extra): ${(appointmentIncome + extraIncome).toFixed(2)}`);
console.log(`Net balance (current formula - expenses): ${(appointmentIncome + extraIncome - expenses).toFixed(2)}`);
console.log("--------------------------------");
console.log("Monthly breakdown (AR month):");
for (const [month, row] of [...monthRows.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`${month} | appt=${row.appointmentsIncome.toFixed(2)} | fin_income=${row.financeIncome.toFixed(2)} | fin_exp=${row.financeExpenses.toFixed(2)}`);
}
console.log("--------------------------------");
console.log(`Potential duplicate income rows by description: ${suspicious.length}`);
if (suspicious.length > 0) {
  console.log("Examples:");
  for (const row of suspicious.slice(0, 5)) {
    console.log(`- ${row.created_at} | ${row.amount} | ${row.description || "(sin descripcion)"}`);
  }
}
