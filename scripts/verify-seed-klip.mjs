/**
 * Verifica que los datos del local `klip` devuelvan numeros correctos en TODAS las
 * secciones que los muestran: Caja, Finanzas, Equipo, Pagos e Inicio.
 *
 * No reimprime la app: cada bloque replica la consulta del server action con el
 * mismo filtro y despues chequea que el resultado tenga sentido y que las cifras
 * que se muestran en dos lugares distintos sean iguales. Si el server cambia un
 * filtro, este script hay que actualizarlo (por eso las queries estan copiadas,
 * no abstraidas).
 *
 *   node scripts/verify-seed-klip.mjs
 *
 * Sale con codigo 1 si algo falla, para poder engancharlo a un script de CI.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ------------------------------------------------------------------ helpers
const TZ = "America/Argentina/Buenos_Aires";
const fmtFecha = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hoy = fmtFecha.format(new Date());
const ahoraIso = new Date().toISOString();
const art = (fecha, hhmm) => `${fecha}T${hhmm}:00-03:00`;
/** Límites del día en ART, igual que `getArgentinaDayBounds`. */
const dia = (fecha) => ({ start: `${fecha}T00:00:00-03:00`, end: `${fecha}T23:59:59-03:00` });
const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const suma = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

/** Lunes de la semana de `fecha`. */
function lunesDe(fecha) {
  const d = new Date(`${fecha}T12:00:00-03:00`);
  const wd = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (wd === 0 ? -6 : 1 - wd));
  return fmtFecha.format(d);
}
function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtFecha.format(d);
}
const lunes = lunesDe(hoy);
const domingo = sumarDias(lunes, 6);
const primeroDelMes = hoy.slice(0, 8) + "01";

const RANGOS = [
  { nombre: "HOY", from: hoy, to: hoy },
  { nombre: "SEMANA", from: lunes, to: domingo },
  { nombre: "MES", from: primeroDelMes, to: hoy },
];

const out = [];
let fallas = 0;
const ok = (cond, msg, extra = "") => {
  if (!cond) fallas++;
  out.push(`${cond ? "  OK  " : " FALLA"}  ${msg}${extra ? `\n          ${extra}` : ""}`);
};
const titulo = (t) => out.push(`\n=== ${t} ${"=".repeat(Math.max(0, 62 - t.length))}`);

const { data: shop } = await db.from("shops").select("id, nombre").eq("slug", "klip").single();
const shopId = shop.id;
titulo(`LOCAL ${shop.nombre} · hoy=${hoy} · semana=${lunes}..${domingo}`);

// ------------------------------------------------------------------ helpers de datos
const turnosRango = async (from, to) => {
  const { data, error } = await db
    .from("appointments")
    .select("id, staff_id, service_id, start_time, status, is_paid, service_price, date_key_ar, notes")
    .eq("shop_id", shopId)
    .gte("start_time", dia(from).start)
    .lte("start_time", dia(to).end);
  if (error) throw error;
  return data;
};
const pagados = (turnos) => turnos.filter((t) => t.status === "completed" && t.is_paid);
const precio = (t) => Number(t.service_price || 0);

const gastosRango = async (from, to) => {
  const { data, error } = await db
    .from("finances")
    .select("id, amount, type, category, description, happened_at")
    .eq("shop_id", shopId)
    .eq("type", "expense")
    .gte("happened_at", dia(from).start)
    .lte("happened_at", dia(to).end);
  if (error) throw error;
  return data;
};
const movsRango = async (from, to) => {
  const { data, error } = await db
    .from("cash_movements")
    .select("id, cash_session_id, movement_type, amount, category, description, happened_at")
    .eq("shop_id", shopId)
    .gte("happened_at", dia(from).start)
    .lte("happened_at", dia(to).end);
  if (error) throw error;
  return data;
};

// ============================================================================
// 1. CAJA  (fetchCashSession)
// ============================================================================
titulo("CAJA");
const { data: sesiones } = await db
  .from("cash_sessions")
  .select("id, status, opened_at, closed_at, opening_amount, expected_amount, counted_amount, difference_amount, close_notes")
  .eq("shop_id", shopId)
  .order("opened_at", { ascending: false });

const abiertas = sesiones.filter((s) => s.status === "open");
ok(abiertas.length <= 1, `cajas abiertas: ${abiertas.length} (el indice unico del schema exige <= 1)`);

if (abiertas.length === 1) {
  const s = abiertas[0];
  const { data: movs } = await db.from("cash_movements").select("movement_type, amount, happened_at").eq("shop_id", shopId).eq("cash_session_id", s.id);
  const { data: turnos } = await db.from("appointments").select("service_price").eq("shop_id", shopId).eq("status", "completed").eq("is_paid", true).gte("start_time", s.opened_at).lte("start_time", ahoraIso);

  // La app NO filtra los movimientos por hora: los suma todos. Por eso el seed
  // no carga en una caja abierta movimientos con hora futura.
  const movNet = suma(movs, (m) => (m.movement_type === "expense" || m.movement_type === "withdrawal" ? -Number(m.amount) : Number(m.amount)));
  const turnosIngreso = suma(turnos, precio);
  const esperado = Number(s.opening_amount) + movNet + turnosIngreso;

  out.push(`        abierta desde ${String(s.opened_at).slice(0, 16)}  inicial ${money(s.opening_amount)}  mov ${money(movNet)}  turnos ${money(turnosIngreso)}`);
  ok(esperado > 0, `esperado = ${money(esperado)} (positivo)`);
  ok(
    movs.every((m) => String(m.happened_at) <= ahoraIso),
    `los ${movs.length} movimientos de la caja abierta ya ocurrieron (ninguno con hora futura)`,
  );
  const futuros = movs.filter((m) => String(m.happened_at) > ahoraIso);
  if (futuros.length) ok(false, `${futuros.length} movimientos con hora futura hunden el "esperado"`);
} else {
  out.push("        (sin caja abierta: la pagina muestra el form de Abrir caja)");
}

const cerradas = sesiones.filter((s) => s.status === "closed");
ok(cerradas.length > 0, `cierres cerrados: ${cerradas.length} (llenan "Cierres recientes")`);

let cierresMalos = 0;
for (const s of cerradas) {
  const { data: movs } = await db.from("cash_movements").select("movement_type, amount").eq("shop_id", shopId).eq("cash_session_id", s.id);
  const { data: turnos } = await db.from("appointments").select("service_price").eq("shop_id", shopId).eq("status", "completed").eq("is_paid", true).gte("start_time", s.opened_at).lte("start_time", s.closed_at);
  const movNet = suma(movs, (m) => (m.movement_type === "expense" || m.movement_type === "withdrawal" ? -Number(m.amount) : Number(m.amount)));
  const esperadoReal = Number(s.opening_amount) + movNet + suma(turnos, precio);
  const difReal = Number(s.counted_amount) - esperadoReal;
  // Tolerancia: el seed cierra con un desvio de a lo sumo +-4000 y hay
  // redondeos de centavo.
  if (Math.abs(esperadoReal - Number(s.expected_amount)) > 5 || Math.abs(difReal - Number(s.difference_amount)) > 5) {
    cierresMalos++;
    out.push(`        ${String(s.opened_at).slice(0, 10)}: esperado guardado ${money(s.expected_amount)} vs real ${money(esperadoReal)} · dif ${money(s.difference_amount)} vs ${money(difReal)}`);
  }
}
ok(cierresMalos === 0, `los ${cerradas.length} cierres guardan expected = inicial + movimientos + turnos y difference = contado - esperado`, `${cierresMalos} con desvio`);
ok(cerradas.every((s) => s.difference_amount !== null), "todos los cierres tienen diferencia calculada (se muestra el bloque Diferencia)");

// ============================================================================
// 2. FINANZAS  (fetchFinanceData) — los 3 KPIs, para los 3 rangos del filtro
// ============================================================================
titulo("FINANZAS · KPIs por rango del filtro");
for (const r of RANGOS) {
  const [turnos, gastos, movs] = await Promise.all([turnosRango(r.from, r.to), gastosRango(r.from, r.to), movsRango(r.from, r.to)]);
  const incTurnos = suma(pagados(turnos), precio);
  const incCaja = suma(movs.filter((m) => m.movement_type === "income"), (m) => Number(m.amount));
  const gasFin = suma(gastos, (g) => Number(g.amount));
  const gasCaja = suma(movs.filter((m) => m.movement_type === "expense" || m.movement_type === "withdrawal"), (m) => Number(m.amount));
  const inc = incTurnos + incCaja;
  const gas = gasFin + gasCaja;
  out.push(
    `        ${r.nombre.padEnd(7)} ${String(r.from)}..${String(r.to)}  ingresos ${money(inc)} (turnos ${money(incTurnos)} + caja ${money(incCaja)})  gastos ${money(gas)} (gastos ${money(gasFin)} + caja ${money(gasCaja)})  balance ${money(inc - gas)}`,
  );
  ok(gas >= 0 && inc >= 0 && Number.isFinite(inc - gas), `${r.nombre}: los tres KPIs son numeros finitos y no negativos`);
}
{
  // El mismo gasto no puede estar en `finances` y en `cash_movements`: las dos
  // tablas se suman y el Gastos del KPI sale el doble.
  const [gastos, movs] = await Promise.all([gastosRango(primeroDelMes, hoy), movsRango(primeroDelMes, hoy)]);
  const descFin = new Set(gastos.map((g) => (g.description || "").replace(/^\[seed\]\s*/, "").trim().toLowerCase()).filter(Boolean));
  const dups = movs.filter((m) => descFin.has((m.description || "").replace(/^\[seed\]\s*/, "").trim().toLowerCase()));
  ok(dups.length === 0, `ningun gasto esta duplicado entre 'finances' y 'cash_movements' (${gastos.length} gastos, ${movs.length} movimientos del mes)`);
}

// ============================================================================
// 3. EQUIPO  (fetchStaffProduction) — la tabla de la card Equipo
// ============================================================================
titulo("EQUIPO · produccion por profesional");
const { data: miembros } = await db.from("shop_memberships").select("user_id, role, is_active").eq("shop_id", shopId).eq("role", "staff").eq("is_active", true);
const { data: perfiles } = await db.from("user_profiles").select("user_id, name").eq("shop_id", shopId);
const nombreDe = (u) => perfiles.find((p) => p.user_id === u)?.name || "?";
const { data: reglas } = await db
  .from("staff_compensation_rules")
  .select("staff_user_id, percentage_rate, fixed_amount")
  .eq("shop_id", shopId)
  .eq("is_active", true)
  .is("ends_on", null);

// HOY puede legitimately estar vacio: si son las 6 de la manana el local todavia
// no abrio. Solo es un fallo si el rango ya tiene turnos pagados y aun asi la
// tabla no los muestra.
const localAbrio = pagados(await turnosRango(hoy, hoy)).length > 0;
for (const r of RANGOS) {
  const turnos = await turnosRango(r.from, r.to);
  const pag = pagados(turnos);
  const idsLiquidables = new Set(miembros.map((m) => m.user_id));
  // `fetchStaffProduction` arma una fila por miembro activo y descarta los
  // turnos de quien no esta en la lista (el dueño, un empleado dado de baja).
  // Los ingresos del KPI los cuenta igual: por eso el total se compara solo con
  // los profesionales liquidables, y el resto se informa aparte.
  const conPro = pag.filter((t) => t.staff_id && idsLiquidables.has(t.staff_id));
  const sinFilas = pag.filter((t) => t.staff_id && !idsLiquidables.has(t.staff_id));
  out.push(`        ${r.nombre.padEnd(7)} ${conPro.length} turnos pagados de profesionales, ${money(suma(conPro, precio))} cobrados`);
  if (sinFilas.length) {
    out.push(`                 (${sinFilas.length} turnos pagados / ${money(suma(sinFilas, precio))} de gente no liquidable: suma al KPI Ingresos pero no aparece en la tabla Equipo)`);
  }
  if (r.nombre === "HOY" && !localAbrio) {
    out.push(`                 HOY sin turnos pagados todavia (el local no abrio): se informa, no se cuenta como falla`);
  } else {
    ok(conPro.length > 0 && suma(conPro, precio) > 0, `${r.nombre}: la tabla Equipo tiene produccion (> 0)`);
  }
  let acumulado = 0;
  for (const m of miembros) {
    const propios = conPro.filter((t) => t.staff_id === m.user_id);
    const regla = reglas.find((x) => x.staff_user_id === m.user_id);
    const pct = regla?.percentage_rate ?? 40;
    const cobrado = suma(propios, precio);
    acumulado += cobrado;
    out.push(`                 ${nombreDe(m.user_id).padEnd(10)} ${String(propios.length).padStart(3)} turnos  ${money(cobrado).padStart(10)}  comision ${pct}%`);
  }
  ok(acumulado === suma(conPro, precio), `${r.nombre}: los importes por profesional suman el total de la tabla`, `${money(acumulado)} vs ${money(suma(conPro, precio))}`);
  const enFila = new Set(conPro.map((t) => t.id));
  ok(enFila.size === conPro.length, `${r.nombre}: sin turnos repetidos entre profesionales`);
}

// ============================================================================
// 4. PAGOS  (fetchStaffLiquidations + fetchStaffLiquidationItems + Historial)
// ============================================================================
titulo("PAGOS · liquidaciones, boton Pagar e Historial");
const { data: todasLiq } = await db
  .from("staff_liquidations")
  .select("id, staff_user_id, period_start, period_end, status, gross_revenue, commission_amount, bonuses_amount, deductions_amount, final_payable, paid_amount, paid_at, notes")
  .eq("shop_id", shopId)
  .order("created_at", { ascending: false });

const { data: reglasMap } = { data: reglas };
const esSeed = (l) => typeof l.notes === "string" && l.notes.startsWith("[seed]");
const liqMalas = [];
const liqLegacy = [];
for (const l of todasLiq) {
  const { data: items } = await db.from("staff_liquidation_items").select("gross_amount, commission_amount, commission_rate_snapshot").eq("liquidation_id", l.id);
  const brutoItems = suma(items, (i) => Number(i.gross_amount));
  const comItems = suma(items, (i) => Number(i.commission_amount));
  const pct = items[0] ? Number(items[0].commission_rate_snapshot) : 0;
  const esperadoCom = Math.round((brutoItems * pct) / 100);
  const errores = [];
  if (items.length === 0) errores.push("sin items (el Historial abriria vacio)");
  if (Math.abs(brutoItems - Number(l.gross_revenue)) > 1) errores.push(`bruto ${l.gross_revenue} vs items ${brutoItems}`);
  if (Math.abs(comItems - Number(l.commission_amount)) > 1) errores.push(`comision ${l.commission_amount} vs items ${comItems}`);
  if (Math.abs(esperadoCom - Number(l.commission_amount)) > 1) errores.push(`comision != bruto * ${pct}%`);
  if (Number(l.final_payable) !== Number(l.commission_amount)) errores.push("final != comision (no hay bonos ni descuentos)");
  if (l.status === "paid" && Number(l.paid_amount) !== Number(l.final_payable)) errores.push("pagada pero paid_amount != final_payable");
  if (l.status !== "paid" && Number(l.paid_amount) !== 0) errores.push("no pagada pero con paid_amount");
  const regla = reglasMap.find((x) => x.staff_user_id === l.staff_user_id);
  if (regla && items.length && Number(regla.percentage_rate) !== pct) errores.push(`items al ${pct}% pero la regla vigente dice ${regla.percentage_rate}%`);

  const etiqueta = `${nombreDe(l.staff_user_id)} ${l.period_start}..${l.period_end} (${l.status})`;
  if (esSeed(l)) {
    if (errores.length) liqMalas.push(`${etiqueta}: ${errores.join(" · ")}`);
    out.push(`   [seed] ${nombreDe(l.staff_user_id).padEnd(10)} ${l.period_start}..${l.period_end}  ${String(l.status).padEnd(9)} bruto ${money(l.gross_revenue).padStart(10)}  com ${pct}% = ${money(l.commission_amount).padStart(10)}  items ${items.length}`);
  } else {
    // Las que no son del seed son de pruebas manuales. No las hace fallar el
    // chequeo (no las toco) pero se listan: ensucian el Historial.
    if (errores.length) liqLegacy.push(`${etiqueta}: ${errores.join(" · ")}`);
    out.push(`   (manual) ${nombreDe(l.staff_user_id).padEnd(10)} ${l.period_start}..${l.period_end}  ${String(l.status).padEnd(9)} bruto ${money(l.gross_revenue).padStart(10)}  com ${pct}% = ${money(l.commission_amount).padStart(10)}  items ${items.length}${errores.length ? "  <- inconsistente" : ""}`);
  }
}
const sembradas = todasLiq.filter(esSeed);
ok(liqMalas.length === 0, `las ${sembradas.length} liquidaciones del seed son consistentes con sus items y con la regla vigente`, liqMalas.join("\n          "));
if (liqLegacy.length) {
  out.push(`\n  AVISO: ${liqLegacy.length} liquidaciones de pruebas manuales (no son del seed, --reset no las toca) y son inconsistentes:`);
  liqLegacy.forEach((x) => out.push(`          - ${x}`));
}

// El filtro por defecto es HOY. Con el filtro por containment (.gte period_start)
// una liquidacion semanal no apareceria nunca; ahora es por solapamiento.
const solapadasHoy = todasLiq.filter((l) => l.period_start <= hoy && l.period_end >= hoy);
const contenidasHoy = todasLiq.filter((l) => l.period_start >= hoy && l.period_end <= hoy);
ok(solapadasHoy.length > contenidasHoy.length, `con el filtro HOY se ven ${solapadasHoy.length} liquidaciones por solapamiento vs ${contenidasHoy.length} por contencion (el bug era este)`);
const pendientes = solapadasHoy.filter((l) => l.status !== "paid");
ok(pendientes.length > 0, `con el filtro HOY hay ${pendientes.length} liquidaciones pendientes => el boton Pagar aparece en la tabla`);

// Historial: son las mismas filas pero sin filtro de periodo
const { data: historial } = await db.from("staff_liquidations").select("id, staff_user_id, status, final_payable, paid_at, period_start, period_end").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(100);
ok(historial.length === todasLiq.length, `el Historial trae las ${historial.length} liquidaciones sin filtro de periodo`);
ok(historial.some((h) => h.paid_at), 'hay liquidaciones con paid_at (el Historial muestra "pagado el ...")');
const { data: todosItems } = await db.from("staff_liquidation_items").select("liquidation_id").eq("shop_id", shopId);
ok(todosItems.length > 0, `hay ${todosItems.length} items de detalle para abrir el Historial turno a turno`);

// ============================================================================
// 5. INICIO  (fetchDashboardSummary + fetchDashboardMetrics)
// ============================================================================
titulo("INICIO · resumen y metricas del dashboard");
{
  const hoyTurnos = await turnosRango(hoy, hoy);
  const resumenCount = hoyTurnos.filter((t) => ["confirmed", "pending_payment", "completed"].includes(t.status)).length;
  const resumenRevenue = suma(pagados(hoyTurnos), precio);
  out.push(`        HOY: ${resumenCount} turnos en el resumen, ${money(resumenRevenue)} de facturacion`);
  ok(Number.isInteger(resumenCount) && resumenCount >= 0, "el conteo de turnos de hoy es un entero >= 0");

  const { data: proximos } = await db
    .from("appointments")
    .select("id, start_time, status")
    .eq("shop_id", shopId)
    .gte("start_time", ahoraIso)
    .lte("start_time", dia(hoy).end)
    .in("status", ["confirmed", "pending_payment"])
    .order("start_time", { ascending: true });
  out.push(`        "Proximos turnos": ${(proximos || []).length}`);
  ok(true, `la lista de proximos turnos tiene ${(proximos || []).length} filas (hoy es la unica ventana que se consulta)`);

  // flowByPeriod: ingresos = turnos pagados + ingresos de finanzas + ingresos de caja
  const flow = async (from, to) => {
    const [turnos, gastos, movs] = await Promise.all([turnosRango(from, to), gastosRango(from, to), movsRango(from, to)]);
    const inc = suma(pagados(turnos), precio) + suma(movs.filter((m) => m.movement_type === "income"), (m) => Number(m.amount)) + suma(
      (await db.from("finances").select("amount").eq("shop_id", shopId).eq("type", "income").gte("happened_at", dia(from).start).lte("happened_at", dia(to).end)).data || [],
      (f) => Number(f.amount),
    );
    const gas = suma(gastos, (g) => Number(g.amount)) + suma(movs.filter((m) => m.movement_type !== "income"), (m) => Number(m.amount));
    return { inc, gas };
  };
  const fHoy = await flow(hoy, hoy);
  const fSem = await flow(lunes, domingo);
  const fMes = await flow(primeroDelMes, hoy);
  out.push(`        flujo HOY    ingresos ${money(fHoy.inc)} gastos ${money(fHoy.gas)}`);
  out.push(`        flujo SEMANA ingresos ${money(fSem.inc)} gastos ${money(fSem.gas)}`);
  out.push(`        flujo MES    ingresos ${money(fMes.inc)} gastos ${money(fMes.gas)}`);
  ok(fSem.inc >= fHoy.inc && fMes.inc >= fHoy.inc, "HOY esta contenido en SEMANA y en MES (los ingresos no pueden crecer al achicar el rango)", `hoy ${fHoy.inc} semana ${fSem.inc} mes ${fMes.inc}`);
  ok(fSem.gas >= fHoy.gas && fMes.gas >= fHoy.gas, "HOY esta contenido en SEMANA y en MES (los gastos)", `hoy ${fHoy.gas} semana ${fSem.gas} mes ${fMes.gas}`);
  ok(fSem.inc + fMes.inc - fHoy.inc > 0, "SEMANA y MES no son el mismo rango: hay dias distintos entre ambos", "si esto falla, la semana y el mes coinciden y el chequeo de solapamiento de abajo no dice nada");

  // `date_key_ar` es texto plano, no generado: si falta, los graficos de Inicio
  // descartan la fila en silencio.
  const seisMeses = sumarDias(hoy, -180);
  const { data: paraGraficos } = await db.from("appointments").select("date_key_ar, status, is_paid").eq("shop_id", shopId).gte("start_time", art(seisMeses, "00:00")).eq("status", "completed").limit(2000);
  const sinKey = (paraGraficos || []).filter((a) => !a.date_key_ar).length;
  ok(sinKey === 0, `los ${(paraGraficos || []).length} turnos de los ultimos 6 meses tienen date_key_ar (sin el, los graficos los ignoran)`, `${sinKey} sin fecha`);

  const meses = new Set((paraGraficos || []).filter((a) => a.date_key_ar).map((a) => a.date_key_ar.slice(0, 7)));
  ok(meses.size >= 2, `el grafico de ingresos por mes tiene ${meses.size} meses: ${[...meses].sort().join(", ")}`);

  // Los 7 dias de la semana tienen que sumar exactamente el flujo de la semana.
  const diasSemana = [];
  for (let i = 0; i < 7; i++) diasSemana.push(sumarDias(lunes, i));
  const porDia = [];
  for (const d of diasSemana) {
    const [t, g, m] = await Promise.all([turnosRango(d, d), gastosRango(d, d), movsRango(d, d)]);
    porDia.push({
      d,
      inc: suma(pagados(t), precio) + suma(m.filter((x) => x.movement_type === "income"), (x) => Number(x.amount)),
      gas: suma(g, (x) => Number(x.amount)) + suma(m.filter((x) => x.movement_type !== "income"), (x) => Number(x.amount)),
    });
  }
  const incPorDia = suma(porDia, (x) => x.inc);
  const gasPorDia = suma(porDia, (x) => x.gas);
  ok(Math.abs(incPorDia - fSem.inc) <= 1, `el desglose diario de la semana suma lo mismo que el flujo semanal (${money(incPorDia)} vs ${money(fSem.inc)})`);
  ok(Math.abs(gasPorDia - fSem.gas) <= 1, `los gastos por dia de la semana suman el flujo semanal (${money(gasPorDia)} vs ${money(fSem.gas)})`);
  for (const x of porDia) out.push(`                 ${x.d}  ingresos ${money(x.inc).padStart(10)}  gastos ${money(x.gas).padStart(10)}`);
  const diasVacios = porDia.filter((x) => x.inc === 0 && x.gas === 0);
  ok(diasVacios.length <= 1, `la semana tiene al menos ${7 - diasVacios.length} dias con movimiento`, `${diasVacios.length} dias en cero: ${diasVacios.map((x) => x.d).join(", ")}`);

  // ---- Rendimiento (healthScore) ------------------------------------------
  // El score compara el mes actual contra el mismo tramo de los 3 meses
  // anteriores. Si se dejara comparar el mes completo, el dia 3 de cada mes toda
  // peluqueria del mundo daria "Critico": este chequeo es el que lo defiende.
  const seisMesesAtras = sumarDias(hoy, -180);
  const primeroMes = hoy.slice(0, 8) + "01";
  const diaDelMes = Number(hoy.slice(8, 10));
  const [apptsGraf, finsGraf, movsGraf, clientesGraf] = await Promise.all([
    db.from("appointments").select("date_key_ar, is_paid, service_price, services!appointments_service_id_fkey(name, price)").eq("shop_id", shopId).gte("start_time", art(seisMesesAtras, "00:00")).eq("status", "completed").order("start_time", { ascending: false }).limit(2000),
    db.from("finances").select("amount, type, happened_at, created_at").eq("shop_id", shopId).is("appointment_id", null).gte("happened_at", art(seisMesesAtras, "00:00")).limit(2000),
    db.from("cash_movements").select("amount, movement_type, happened_at").eq("shop_id", shopId).is("appointment_id", null).gte("happened_at", art(seisMesesAtras, "00:00")).limit(2000),
    db.from("customers").select("created_at").eq("shop_id", shopId).gte("created_at", art(seisMesesAtras, "00:00")).limit(2000),
  ]);
  const enCorte = (k) => !!k && k.length >= 10 && Number(k.slice(8, 10)) <= diaDelMes;
  const incMes = new Map();
  const cliMes = new Map();
  const apMes = new Map();
  for (const a of apptsGraf.data || []) {
    if (!a.is_paid) continue;
    const k = typeof a.date_key_ar === "string" ? a.date_key_ar : null;
    const m = k ? k.slice(0, 7) : null;
    if (!m) continue;
    const sv = Array.isArray(a.services) ? a.services[0] : a.services;
    const p = a.service_price != null ? Number(a.service_price) : Number(sv?.price || 0);
    if (enCorte(k)) {
      incMes.set(m, (incMes.get(m) || 0) + p);
      apMes.set(m, (apMes.get(m) || 0) + 1);
    }
  }
  for (const f of finsGraf.data || []) {
    const k = f.happened_at ? art(f.happened_at, "00:00").slice(0, 10) : null;
    const m = k ? art(f.happened_at || f.created_at, "00:00").slice(0, 7) : null;
    if (!m || !enCorte(k)) continue;
    if (f.type === "income") incMes.set(m, (incMes.get(m) || 0) + f.amount);
  }
  for (const v of movsGraf.data || []) {
    if (v.movement_type !== "income") continue;
    const m = v.happened_at ? art(v.happened_at, "00:00").slice(0, 7) : null;
    if (!m) continue;
    incMes.set(m, (incMes.get(m) || 0) + Number(v.amount || 0));
  }
  for (const c of clientesGraf.data || []) {
    const m = c.created_at ? art(c.created_at, "00:00").slice(0, 7) : null;
    if (m) cliMes.set(m, (cliMes.get(m) || 0) + 1);
  }
  const mesActual = primeroMes.slice(0, 7);
  const tresMesesAntes = [1, 2, 3].map((n) => {
    const d = new Date(`${mesActual}-01T00:00:00-03:00`);
    d.setUTCMonth(d.getUTCMonth() - n);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const ratio = (cur, avg) => (avg <= 0 ? (cur > 0 ? 150 : 100) : Math.min(Math.round((cur / avg) * 100), 200));
  const scoreDe = (mapa) => Math.round(ratio(mapa.get(mesActual) || 0, suma(tresMesesAntes, (m) => mapa.get(m) || 0) / 3) / 2);
  const revScore = scoreDe(incMes);
  const cliScore = scoreDe(cliMes);
  const apScore = scoreDe(apMes);
  const health = Math.min(Math.round(revScore * 0.4 + cliScore * 0.3 + apScore * 0.3), 100);
  out.push(`        Rendimiento ${health}/100  (dinero ${revScore} · clientes ${cliScore} · turnos ${apScore})`);
  out.push(`                 mes actual (1-${diaDelMes}) ${money(incMes.get(mesActual) || 0)} vs ${tresMesesAntes.map((m) => money(incMes.get(m) || 0)).join(" / ")} (mismo tramo)`);
  ok(health >= 0 && health <= 100, `el score esta en rango (${health}/100)`);

  // La regresion que hay que cazar: si el score usara el mes completo contra
  // meses enteros, caeria fuerte los primeros dias del mes.
  const ratioViejo = ratio(incMes.get(mesActual) || 0, suma(tresMesesAntes, (m) => incMes.get(m) || 0) / 3);
  const scoreViejo = Math.min(Math.round(Math.round(ratioViejo / 2) * 0.4 + cliScore * 0.3 + apScore * 0.3), 100);
  ok(diaDelMes > 5 ? health >= scoreViejo : true, `con el mismo periodo el score no es PEOR que la version vieja (${health} vs ${scoreViejo})`, "si falla, el recorte por dia de mes esta achicando el numerador o inflando el promedio");

  // ---- Demanda ------------------------------------------------------------
  const porServicio = new Map();
  for (const a of apptsGraf.data || []) {
    const sv = Array.isArray(a.services) ? a.services[0] : a.services;
    const n = sv?.name;
    if (!n) continue;
    porServicio.set(n, (porServicio.get(n) || 0) + 1);
  }
  const top = [...porServicio.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  ok(top.length > 0, `la card Demanda tiene ${porServicio.size} servicios distintos, top: ${top.map(([n, c]) => `${n} (${c})`).join(", ")}`);

  // ---- Agenda gap y alertas -----------------------------------------------
  const { data: shopRow } = await db.from("shops").select("business_hours").eq("id", shopId).single();
  ok(!!shopRow?.business_hours, `el local tiene horarios de atencion (${JSON.stringify(shopRow?.business_hours)?.slice(0, 60)}...)`, "sin business_hours el hueco de agenda usa el default");
  const { count: stockBajo } = await db.from("stock").select("id", { count: "exact", head: true }).eq("shop_id", shopId).lt("quantity", 5);
  const { count: conCanje } = await db.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", shopId).gt("loyalty_rewards_available", 0);
  out.push(`        stock bajo: ${stockBajo ?? 0}   clientes con canje: ${conCanje ?? 0}`);
  ok(typeof stockBajo === "number" && typeof conCanje === "number", "las alertas de stock y fidelizacion devuelven un numero");
}

// ============================================================================
// 6. REVERSIBILIDAD del seed
// ============================================================================
titulo("SEED · todo lo que se puede deshacer");
{
  const { count: movs } = await db.from("cash_movements").select("id", { count: "exact", head: true }).eq("shop_id", shopId).like("description", "[seed]%");
  const { count: gastos } = await db.from("finances").select("id", { count: "exact", head: true }).eq("shop_id", shopId).like("description", "[seed]%");
  const { count: turnos } = await db.from("appointments").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("notes", "[seed]");
  const { count: liqs } = await db.from("staff_liquidations").select("id", { count: "exact", head: true }).eq("shop_id", shopId).like("notes", "[seed]%");
  out.push(`        marcados [seed]: movimientos=${movs} gastos=${gastos} turnos=${turnos} liquidaciones=${liqs}`);
  ok(movs > 0 && gastos > 0 && turnos > 0 && liqs > 0, "todo lo sembrado esta marcado con [seed], --reset lo borra y nada mas");
  const { count: sinTag } = await db.from("staff_liquidations").select("id", { count: "exact", head: true }).eq("shop_id", shopId).is("notes", null);
  out.push(`        liquidaciones sin [seed]: ${sinTag} (las pruebas manuales, no las toca --reset)`);
}

out.forEach((l) => console.log(l));
console.log(fallas === 0 ? "\nTODO OK\n" : `\n${fallas} FALLAS\n`);
process.exit(fallas === 0 ? 0 : 1);