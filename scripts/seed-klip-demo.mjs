/**
 * Siembra el local de pruebas `klip` para que Caja y Finanzas se vean como un
 * salon que lleva semanas trabajando: turnos pagados de las ultimas dos semanas,
 * caja abierta hoy con movimientos, cierres anteriores y liquidaciones de
 * comisiones pagadas y pendientes.
 *
 * Por que existe: sin esto la pagina abre en el rango de HOY y no hay ni
 * ingresos, ni gastos, ni caja abierta, ni liquidaciones. Y las liquidaciones
 * que habia eran todas de $0 (pruebas manuales), asi que el Historial no
 * mostraba nada.
 *
 * Como se reverte:
 * - Todo lo que escribe este script queda marcado con el prefijo `[seed]` en
 *   `description` (caja y gastos) o en `notes` (liquidaciones). Los turnos se
 *   marcan con `notes = [seed]` y las liquidaciones se borran por `notes`.
 * - `--reset` borra exactamente eso y nada mas. No toca los turnos, clientes,
 *   servicios ni reglas de compensacion que ya tenia el local.
 *
 * Lo unico que el script SI modifica de algo preexistente son las reglas de
 * `staff_compensation_rules` de los empleados activos (ver seccion REGLAS): sin
 * eso las liquidaciones sembradas usan porcentajes que la app no va a volver a
 * calcular, y "Calcular" daria numeros distintos a los del Historial.
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
/** `n` dias hacia atras en ART. */
const haceDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmtFecha.format(d);
};
/** Timestamp con offset -03:00, que es como guarda la app. */
const art = (fecha, hhmm) => `${fecha}T${hhmm}:00-03:00`;
/** Límites del día en ART, como `getArgentinaDayBounds`. `art` no sirve para el
 *  final del día porque ya trae los segundos. */
const artIni = (fecha) => `${fecha}T00:00:00-03:00`;
const artFin = (fecha) => `${fecha}T23:59:59-03:00`;
const sumarMin = (iso, min) => new Date(new Date(iso).getTime() + min * 60000).toISOString();
/** Dia de la semana 0=domingo..6=sabado, en ART. */
const dow = (fecha) => new Date(`${fecha}T12:00:00-03:00`).getUTCDay();

/** Generador con semilla: el mismo seed siempre deja el mismo local. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ helpers
const ARS = (n) => Math.round(n);
const fail = (msg) => {
  console.error("ERROR: " + msg);
  process.exit(1);
};
const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR");

async function borrarSembrado(shopId) {
  const conTag = (col) => db.from(col).delete({ count: "exact" }).eq("shop_id", shopId).like("description", `${TAG}%`);
  const { data: movs } = await db.from("cash_movements").select("id, cash_session_id").eq("shop_id", shopId).like("description", `${TAG}%`);
  const sessionIds = [...new Set((movs || []).map((m) => m.cash_session_id).filter(Boolean))];

  // Las liquidaciones primero: sus items tienen foreign key.
  const { data: liqs } = await db.from("staff_liquidations").select("id").eq("shop_id", shopId).like("notes", `${TAG}%`);
  const liqIds = (liqs || []).map((l) => l.id);
  let r0 = { count: 0 };
  if (liqIds.length > 0) {
    const r = await db.from("staff_liquidation_items").delete({ count: "exact" }).in("liquidation_id", liqIds);
    r0.count = r.count ?? 0;
    if (r.error) console.error(`  ! no se pudo borrar de staff_liquidation_items: ${r.error.message}`);
  }
  const rLiq = await db.from("staff_liquidations").delete({ count: "exact" }).eq("shop_id", shopId).like("notes", `${TAG}%`);

  const r1 = await conTag("finances");
  const r2 = await conTag("cash_movements");
  const r3 = await db.from("appointments").delete({ count: "exact" }).eq("shop_id", shopId).eq("notes", TAG);

  // Las sesiones se borran por `close_notes`, no por sus movimientos: la caja
  // abierta puede no tener ninguno (a las 6 de la manana todavia no se movio la
  // caja) y si se buscara por movimiento quedaria viva, y el proximo seed
  // chocaria con `idx_cash_sessions_single_open`. Toda sesion sembrada lleva el
  // tag en `close_notes`, abierta o cerrada.
  const r4 = await db.from("cash_sessions").delete({ count: "exact" }).eq("shop_id", shopId).like("close_notes", `${TAG}%`);
  if (r4.error) console.error(`  ! no se pudo borrar de cash_sessions: ${r4.error.message}`);

  for (const [n, r] of [
    ["staff_liquidation_items", r0],
    ["staff_liquidations", rLiq],
    ["finances", r1],
    ["cash_movements", r2],
    ["appointments", r3],
    ["cash_sessions", r4],
  ]) {
    if (r.error) console.error(`  ! no se pudo borrar de ${n}: ${r.error.message}`);
  }
  console.log(
    `Borrado: liquidaciones=${rLiq.count ?? 0} items=${r0.count ?? 0} finances=${r1.count ?? 0} ` +
      `cash_movements=${r2.count ?? 0} appointments=${r3.count ?? 0} cash_sessions=${r4.count ?? 0}`,
  );
  void sessionIds;
}

async function main() {
  // --------------------------------------------------------------- local
  const { data: shop, error: eShop } = await db.from("shops").select("id, slug, nombre").eq("slug", SHOP_SLUG).maybeSingle();
  if (eShop) fail(eShop.message);
  if (!shop) fail(`No existe el local con slug "${SHOP_SLUG}"`);
  const shopId = shop.id;
  console.log(`Local: ${shop.nombre} (${shop.slug})  ${shopId}`);

  if (RESET && !DRY) await borrarSembrado(shopId);

  const { count: yaHay } = await db.from("cash_movements").select("id", { count: "exact", head: true }).eq("shop_id", shopId).like("description", `${TAG}%`);
  if ((yaHay ?? 0) > 0 && !RESET && !DRY) {
    console.log(`\nYa hay ${yaHay} movimientos sembrados. No se toca nada.`);
    console.log("Para volver a sembrar: node scripts/seed-klip-demo.mjs --reset\n");
    return;
  }

  // ---------------------------------------------------------- catálogo base
  const { data: servicios } = await db.from("services").select("id, name, price, duration_minutes").eq("shop_id", shopId).order("price");
  if (!servicios || servicios.length === 0) fail("El local no tiene servicios");

  const { data: membresias } = await db.from("shop_memberships").select("user_id, role, is_active").eq("shop_id", shopId).eq("is_active", true);
  const { data: perfiles } = await db.from("user_profiles").select("user_id, name, email").eq("shop_id", shopId);
  const nombreDe = (uid) => perfiles?.find((p) => p.user_id === uid)?.name || perfiles?.find((p) => p.user_id === uid)?.email || "?";
  const empleados = (membresias || [])
    .filter((m) => m.role === "staff")
    // Ordenados por id: el reparto de porcentajes de abajo indexa por posicion,
    // y sin esto le tocaría un porcentaje distinto a cada uno en cada corrida.
    .map((m) => m.user_id)
    .sort();
  const dueno = (membresias || []).find((m) => m.role === "owner")?.user_id || empleados[0];
  if (empleados.length === 0) fail("El local no tiene empleados activos para liquidar");
  console.log(`Equipo: ${empleados.map((u) => nombreDe(u)).join(", ")} (${empleados.length} empleados)`);

  const { data: clientes } = await db.from("customers").select("id").eq("shop_id", shopId);
  if (!clientes || clientes.length === 0) fail("El local no tiene clientes");

  // ------------------------------------------------------- REGLAS de comisión
  // Porcentaje por empleado. Si no hay regla, la app usa 40% por defecto
  // (`createStaffPreLiquidations`), asi que sembrar liquidaciones con otros
  // porcentajes sin tocar esto haria que "Calcular" diera un numero distinto al
  // del Historial. Se ajustan las reglas activas de los empleados del local.
  const COMISION = { [empleados[0]]: 45, [empleados[1]]: 40, [empleados[2]]: 50 };
  for (const [uid, pct] of Object.entries(COMISION)) {
    if (!uid) continue;
    const { data: rule } = await db
      .from("staff_compensation_rules")
      .select("id, percentage_rate, is_active, ends_on")
      .eq("shop_id", shopId)
      .eq("staff_user_id", uid)
      .eq("is_active", true)
      .is("ends_on", null)
      .maybeSingle();
    if (!DRY) {
      if (rule) await db.from("staff_compensation_rules").update({ percentage_rate: pct, fixed_amount: 0 }).eq("id", rule.id);
      else await db.from("staff_compensation_rules").insert({ shop_id: shopId, staff_user_id: uid, model: "percentage", percentage_rate: pct, fixed_amount: 0, is_active: true });
    }
    console.log(`  comision ${nombreDe(uid)}: ${rule ? rule.percentage_rate : "(sin regla)"}% -> ${pct}%`);
  }

  // --------------------------------------------------------------- agenda
  // Dos semanas de dias habiles (lunes a sabado). Cada dia 7 a 10 turnos
  // repartidos entre los empleados, sin solapes por profesional.
  const DIAS = 14;
  const rand = rng(20261003);
  const turnos = [];
  for (let d = DIAS; d >= 0; d--) {
    const fecha = haceDias(d);
    if (dow(fecha) === 0) continue; // domingo cerrado
    const esHoy = d === 0;
    // Rastrillada por empleado: cada fila dice hasta que hora esta ocupado.
    const hasta = new Map(empleados.map((u) => [u, 9 * 60]));
    const cantidad = esHoy ? 11 : 8 + Math.floor(rand() * 3);
    for (let i = 0; i < cantidad; i++) {
      const uid = empleados[i % empleados.length];
      const svc = servicios[Math.floor(rand() * servicios.length)];
      const dur = Math.max(20, svc.duration_minutes || 30);
      // Un turno por empleado cada ~40 min, corrido desde las 9.
      const min = Math.max(hasta.get(uid) + 5, 9 * 60 + i * 25 + Math.floor(rand() * 10));
      hasta.set(uid, min + dur);
      const hh = String(Math.floor(min / 60)).padStart(2, "0");
      const mm = String(min % 60).padStart(2, "0");
      const start = art(fecha, `${hh}:${mm}`);

      // Hoy: los turnos de la manana quedan hechos, los de la tarde confirmados.
      let status = "completed";
      let pagado = true;
      let metodo = rand() < 0.25 ? "transfer" : "cash";
      if (esHoy) {
        if (new Date(sumarMin(start, dur)).getTime() > Date.now()) {
          status = "confirmed";
          pagado = false;
        }
      } else if (rand() < 0.08) {
        status = "cancelled";
        pagado = false;
      }

      turnos.push({
        fecha,
        shop_id: shopId,
        customer_id: clientes[Math.floor(rand() * clientes.length)].id,
        service_id: svc.id,
        service_price: Number(svc.price),
        staff_id: uid,
        start_time: start,
        end_time: sumarMin(start, dur),
        date_key_ar: fecha,
        status,
        is_paid: pagado,
        payment_method: metodo,
        notes: TAG,
        _serviceName: svc.name,
      });
    }
  }
  console.log(`\nTurnos: ${turnos.length} en ${DIAS} dias habiles (${haceDias(DIAS)} a ${hoy()})`);

  // --------------------------------------------------------------- gastos
  // `finances` es la tabla de gastos administrativos (Alquiler, Publicidad,
  // Servicios). Los gastos de caja van como `cash_movements`: no se repite el
  // mismo gasto en las dos tablas porque `fetchFinanceData` las suma las dos.
  const gastos = [];
  for (let d = DIAS; d >= 1; d--) {
    const fecha = haceDias(d);
    if (dow(fecha) === 0) continue;
    gastos.push({ fecha, hhmm: "13:00", category: "Insumos", desc: "Reposición de insumos del día", amount: 18000 + Math.floor(rand() * 12000) });
    if (rand() < 0.35) gastos.push({ fecha, hhmm: "18:30", category: "Otros", desc: "Varios: delivery, hielo, descartables", amount: 6000 + Math.floor(rand() * 9000) });
    if (dow(fecha) === 6) gastos.push({ fecha, hhmm: "10:00", category: "Personal", desc: "Ayudante por sábado", amount: 25000 });
  }
  gastos.push({ fecha: haceDias(6), hhmm: "09:00", category: "Alquiler", desc: "Alquiler del local", amount: 320000 });
  gastos.push({ fecha: haceDias(4), hhmm: "10:30", category: "Servicios", desc: "Factura de luz", amount: 27500 });
  gastos.push({ fecha: haceDias(3), hhmm: "12:00", category: "Publicidad", desc: "Campaña de Instagram de la quincena", amount: 45000 });

  // --------------------------------------------------------------- resumen
  console.log(`Gastos administrativos: ${gastos.length}`);
  console.log(`Liquidaciones: 4 semanas x ${empleados.length} empleados (3 semanas pagadas + la actual pendiente)`);
  console.log(`Caja: 1 abierta hoy + ${DIAS} cerradas`);
  if (DRY) {
    console.log("\n--dry: no se escribe nada.\n");
    return;
  }

  // --------------------------------------------------------------- escrituras
  const filasTurnos = turnos.map(({ fecha, _serviceName, ...t }) => t);
  const { error: eTurnos } = await db.from("appointments").insert(filasTurnos);
  if (eTurnos) fail(`appointments: ${eTurnos.message}`);
  console.log(`  + ${filasTurnos.length} turnos`);

  const filasGastos = gastos.map((g) => ({
    shop_id: shopId,
    type: "expense",
    category: g.category,
    amount: ARS(g.amount),
    description: `${TAG} ${g.desc}`,
    happened_at: art(g.fecha, g.hhmm),
    created_at: art(g.fecha, g.hhmm),
  }));
  if (filasGastos.length) {
    const { error } = await db.from("finances").insert(filasGastos);
    if (error) fail(`finances: ${error.message}`);
  }
  console.log(`  + ${filasGastos.length} gastos`);

  // ------------------------------------------------------- caja por dia
  // Una sesion por dia habil. Hoy queda ABIERTA (con `opened_at` a las 9, asi
  // que `fetchCashSession` cuenta los turnos pagados desde las 9). Las
  // anteriores se cierran con el esperado REAL: inicial + movimientos + turnos
  // pagados del dia, para que "Cierres recientes" no muestre numeros inventados.
  //
  // El total de turnos se consulta a la base y no se arma con los turnos que
  // genero este script: el local ya tenia turnos propios, y `closeCashSession`
  // cuenta TODOS los pagados desde `opened_at`. Con el total parcial, el
  // `expected_amount` guardado no coincidia con el real y el bloque Diferencia
  // mostraba un numero que no era la diferencia.
  const pagadoDelDia = async (fecha) => {
    const { data, error } = await db
      .from("appointments")
      .select("service_price")
      .eq("shop_id", shopId)
      .eq("status", "completed")
      .eq("is_paid", true)
      // Ventana de la sesion: abre 09:00 y cierra 20:30, que es lo que mide
    // `closeCashSession` (turnos completados y pagados entre `opened_at` y el
    // instante del cierre).
    .gte("start_time", art(fecha, "09:00"))
      .lte("start_time", art(fecha, "20:30"));
    if (error) fail(`appointments ${fecha}: ${error.message}`);
    return (data || []).reduce((s, a) => s + Number(a.service_price || 0), 0);
  };

  const movimientosCaja = (fecha, esHoy) => {
    const filas = [];
    if (rand() < 0.6) filas.push({ movement_type: "income", category: "General", amount: 9000 + Math.floor(rand() * 12000), description: `${TAG} Venta de insumos y productos`, payment_method: "cash" });
    filas.push({ movement_type: "expense", category: "Insumos", amount: 8000 + Math.floor(rand() * 9000), description: `${TAG} Compra de insumos del día`, payment_method: "cash" });
    if (esHoy) filas.push({ movement_type: "withdrawal", category: "Retiro", amount: 60000, description: `${TAG} Retiro a cuenta del dueño`, payment_method: "transfer" });
    return filas;
  };

  const aperturas = [];
  for (let d = DIAS; d >= 0; d--) {
    const fecha = haceDias(d);
    if (dow(fecha) === 0) continue;
    const esHoy = d === 0;
    const pagado = await pagadoDelDia(fecha);
    const inicial = esHoy ? 80000 : 40000 + Math.floor(rand() * 20000);

    // `fetchCashSession` filtra los turnos hasta `now` pero los movimientos de la
    // sesion los suma todos, sin mirar la hora. Si hoy se siembra un retiro de las
    // 18:00 a las 6 de la manana, el "esperado" sale negativo aunque ese retiro
    // todavia no ocurrio. A la caja abierta solo se le cargan movimientos que ya
    // pasaron.
    const ahora = Date.now();
    const candidatos = movimientosCaja(fecha, esHoy);
    const movs = esHoy ? candidatos.filter((m) => new Date(art(fecha, m.movement_type === "withdrawal" ? "18:00" : "12:00")).getTime() <= ahora) : candidatos;

    const movNet = movs.reduce((s, m) => s + (m.movement_type === "expense" || m.movement_type === "withdrawal" ? -m.amount : m.amount), 0);
    const esperado = inicial + movNet + pagado;
    // Contado = esperado con un desvio chico y creible.
    const desvío = esHoy ? 0 : Math.round((rand() - 0.45) * 4000);

    const { data: sesion, error: eS } = await db
      .from("cash_sessions")
      .insert({
        shop_id: shopId,
        opened_at: art(fecha, "09:00"),
        opened_by: dueno,
        opening_amount: inicial,
        status: esHoy ? "open" : "closed",
        // El tag va SIEMPRE, tambien en la caja abierta: es lo que permite que
        // `--reset` la encuentre (ver `borrarSembrado`).
        close_notes: `${TAG} caja ${fecha}`,
        ...(esHoy
          ? {}
          : {
              closed_at: art(fecha, "20:30"),
              expected_amount: esperado,
              counted_amount: esperado + desvío,
              difference_amount: desvío,
            }),
      })
      .select("id")
      .single();
    if (eS) fail(`cash_sessions ${fecha}: ${eS.message}`);
    aperturas.push({ fecha, sesion, esperado, pagado, movNet, inicial, esHoy });

    const filas = movs.map((m) => ({
      shop_id: shopId,
      cash_session_id: sesion.id,
      movement_type: m.movement_type,
      payment_method: m.payment_method,
      category: m.category,
      amount: ARS(m.amount),
      description: m.description,
      happened_at: art(fecha, m.movement_type === "withdrawal" ? "18:00" : "12:00"),
    }));
    if (filas.length) {
      const { error } = await db.from("cash_movements").insert(filas);
      if (error) fail(`cash_movements ${fecha}: ${error.message}`);
    }
  }
  console.log(`  + ${aperturas.length} cajas (${aperturas.filter((a) => a.esHoy).length} abierta, ${aperturas.filter((a) => !a.esHoy).length} cerradas)`);

  // -------------------------------------------------------- liquidaciones
  // Una por empleado y semana (lunes a domingo), con los items de los turnos
  // pagados de ese empleado en ese rango: asi el Historial abre y muestra el
  // detalle turno a turno de verdad. Las semanas anteriores van pagadas; la
  // actual queda pendiente para que se pueda probar el Pagar.
  const lunesDe = (fecha) => {
    const d = new Date(`${fecha}T12:00:00-03:00`);
    const dia = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + (dia === 0 ? -6 : 1 - dia));
    return fmtFecha.format(d);
  };
  const domingoDe = (lunes) => {
    const d = new Date(`${lunes}T12:00:00-03:00`);
    d.setUTCDate(d.getUTCDate() + 6);
    return fmtFecha.format(d);
  };

  const liquidaciones = [];
  const itemsLiquidacion = [];
  const lunesActual = lunesDe(hoy());
  for (let s = 3; s >= 0; s--) {
    const lunes = lunesDe(new Date(new Date(`${lunesActual}T12:00:00-03:00`).getTime() - s * 7 * 86400000).toISOString().slice(0, 10));
    const domingo = domingoDe(lunes);
    const pagada = s > 0;
    for (const uid of empleados) {
      const pct = COMISION[uid] ?? 40;
      // Se consulta la base y no se usan los turnos en memoria: el local ya
      // tenia turnos propios y `createStaffPreLiquidation` cuenta todos los
      // completados y pagados del rango. Con el total parcial, "Calcular" daria
      // un numero distinto al del Historial.
      const { data: delEmpleado, error: eA } = await db
        .from("appointments")
        .select("id, service_id, start_time, service_price, services:service_id(name)")
        .eq("shop_id", shopId)
        .eq("staff_id", uid)
        .eq("status", "completed")
        .eq("is_paid", true)
        .gte("start_time", artIni(lunes))
        .lte("start_time", artFin(domingo));
      if (eA) fail(`appointments de ${uid}: ${eA.message}`);
      if (!delEmpleado || delEmpleado.length === 0) continue;

      const bruto = delEmpleado.reduce((s, t) => s + Number(t.service_price ?? 0), 0);
      const comision = (bruto * pct) / 100;
      liquidaciones.push({
        shop_id: shopId,
        staff_user_id: uid,
        period_start: lunes,
        period_end: domingo,
        status: pagada ? "paid" : "draft",
        gross_revenue: ARS(bruto),
        commission_amount: ARS(comision),
        bonuses_amount: 0,
        deductions_amount: 0,
        final_payable: ARS(comision),
        paid_amount: pagada ? ARS(comision) : 0,
        paid_at: pagada ? art(domingo, "19:00") : null,
        paid_by: pagada ? dueno : null,
        notes: `${TAG} comisión ${nombreDe(uid)} ${lunes}`,
        created_at: art(domingo, "18:30"),
        _items: delEmpleado.map((t) => {
          const svc = Array.isArray(t.services) ? t.services[0] : t.services;
          const brutoTurno = Number(t.service_price ?? svc?.price ?? 0);
          const comisionTurno = Math.round((brutoTurno * pct) / 100);
          return {
            service_id: t.service_id,
            appointment_id: t.id,
            service_name_snapshot: svc?.name || "Servicio",
            start_time_snapshot: t.start_time,
            gross_amount: brutoTurno,
            commission_rate_snapshot: pct,
            commission_amount: comisionTurno,
            net_amount: comisionTurno,
          };
        }),
      });
    }
  }

  for (const l of liquidaciones) {
    const { _items, ...payload } = l;
    const { data: creada, error: eL } = await db.from("staff_liquidations").insert(payload).select("id").single();
    if (eL) fail(`staff_liquidations: ${eL.message}`);
    if (_items.length) {
      const filas = _items.map((i) => ({
        shop_id: shopId,
        liquidation_id: creada.id,
        bonus_amount: 0,
        deduction_amount: 0,
        ...i,
      }));
      const { error } = await db.from("staff_liquidation_items").insert(filas);
      if (error) fail(`staff_liquidation_items: ${error.message}`);
      itemsLiquidacion.push(...filas);
    }
  }
  console.log(`  + ${liquidaciones.length} liquidaciones con ${itemsLiquidacion.length} turnos de detalle`);

  // ------------------------------------------------------------- resumen
  const hoyTurnos = turnos.filter((t) => t.fecha === hoy() && t.status === "completed" && t.is_paid);
  const ingresosHoy = hoyTurnos.reduce((s, t) => s + Number(t.service_price), 0);
  const gastosHoy = gastos.filter((g) => g.fecha === hoy()).reduce((s, g) => s + g.amount, 0);
  const cajaHoy = aperturas.find((a) => a.esHoy);

  console.log(`\nListo. Para HOY (${hoy()}) deberias ver:`);
  console.log(`  Ingresos      ${money(ingresosHoy)}   (${hoyTurnos.length} turnos pagados)`);
  console.log(`  Gastos        ${money(gastosHoy)}`);
  console.log(`  Balance       ${money(ingresosHoy - gastosHoy)}`);
  if (cajaHoy) {
    console.log(`  Caja ABIERTA   inicial ${money(cajaHoy.inicial)} · mov ${money(cajaHoy.movNet)} · turnos ${money(cajaHoy.pagado)}`);
    console.log(`  Esperado      ${money(cajaHoy.esperado)}`);
  }
  console.log(`  Pagar         ${liquidaciones.filter((l) => l.status === "draft").length} liquidaciones pendientes de la semana en curso`);
  console.log(`  Historial     ${liquidaciones.length} liquidaciones con detalle turno a turno`);
  if (hoyTurnos.length === 0) {
    const hora = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    console.log(`\n  OJO: son las ${hora} y el localTodavia no abrio, asi que HOY no tiene turnos hechos.`);
    console.log(`  Para ver numeros usá el filtro "Semana" o "Mes", o volvé a correr el seed mas tarde.`);
  }
  console.log(`\nPara volver a dejar como estaba: node scripts/seed-klip-demo.mjs --reset\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});