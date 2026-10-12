"use server";

import { createServerClient } from "@/lib/supabase/server";
import { requireShopId, resolveAuthorizedShopId } from "@/lib/dashboard/auth/server";
import {
  getArgentinaDateString,
  getArgentinaDayBounds,
  getArgentinaDateKey,
  getArgentinaNow,
} from "@/lib/argentina-time";
import {
  APPOINTMENT_STATUS_TODAY_SUMMARY,
  APPOINTMENT_STATUS_UPCOMING,
} from "@/lib/dashboard/appointments/status";
import type { ActionResult } from "@/lib/types";
import "server-only";
import { createAdminClient } from "../appointments/shared";
import { findLargestGap, resolveGapHours, type AgendaGap, type AgendaInterval } from "./agenda-gaps";
import { buildDemandaBuckets } from "./demanda-buckets";
import { collectedAmount } from "../appointments/paid-amount";

type NextAppointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  customers: { nombre: string; telefono: string | null } | null;
  services: { name: string; price: number } | null;
  custom_service_name: string | null;
  service_price: number | null;
};

type DashboardSummary = {
  appointmentsCount: number;
  lowStockCount: number;
  nextAppointments: NextAppointment[];
  loyaltyRewardsReadyCount: number;
  loyaltyRewardCustomerNames: string[];
  shopName: string;
  shopSlug: string;
  agendaGap: AgendaGap | null;
};

export async function fetchDashboardSummary(shopIdOverride?: string): Promise<ActionResult<DashboardSummary>> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "member");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const supabase = await createServerClient();

    const todayDateStr = getArgentinaDateString();
    const { start: todayStart, end: todayEnd } = getArgentinaDayBounds(todayDateStr);
    const todayStartIso = todayStart.toISOString();
    const todayEndIso = todayEnd.toISOString();

    const nowIso = getArgentinaNow().toISOString();

    const [appointmentsToday, lowStock, loyaltyReady, loyaltyRewardCustomers, nextResult, shop] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, start_time, end_time, status")
        .eq("shop_id", shopId)
        .gte("start_time", todayStartIso)
        .lte("start_time", todayEndIso)
        .in("status", APPOINTMENT_STATUS_TODAY_SUMMARY as unknown as string[])
        .order("start_time", { ascending: true }),

      supabase
        .from("stock")
        .select("id")
        .eq("shop_id", shopId)
        .lt("quantity", 5),

      supabase
        .from("customers")
        .select("id")
        .eq("shop_id", shopId)
        .gt("loyalty_rewards_available", 0),

      supabase
        .from("customers")
        .select("nombre")
        .eq("shop_id", shopId)
        .gt("loyalty_rewards_available", 0)
        .order("loyalty_rewards_available", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(3),

      supabase
        .from("appointments")
        .select("id, start_time, end_time, status, service_price, custom_service_name, customers(nombre, telefono), services(name, price)")
        .eq("shop_id", shopId)
        .gte("start_time", nowIso)
        .lte("start_time", todayEndIso)
        .in("status", APPOINTMENT_STATUS_UPCOMING as unknown as string[])
        .order("start_time", { ascending: true })
        .limit(5),

      supabase
        .from("shops")
        .select("nombre, slug, business_hours")
        .eq("id", shopId)
        .single(),
    ]);

    if (appointmentsToday.error) return { success: false, error: appointmentsToday.error.message };
    if (lowStock.error) return { success: false, error: lowStock.error.message };
    if (loyaltyReady.error) return { success: false, error: loyaltyReady.error.message };
    if (loyaltyRewardCustomers.error) return { success: false, error: loyaltyRewardCustomers.error.message };
    if (nextResult.error) return { success: false, error: nextResult.error.message };
    if (shop.error) return { success: false, error: shop.error.message };

    const loyaltyRewardCustomerNames = (loyaltyRewardCustomers.data ?? [])
      .map((c) => (c.nombre || "").trim())
      .filter(Boolean);

    const nextAppointments: NextAppointment[] = (nextResult.data ?? []).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        start_time: a.start_time as string,
        end_time: a.end_time as string,
        status: a.status as string,
        service_price: a.service_price as number | null,
        custom_service_name: a.custom_service_name as string | null,
        customers: Array.isArray(a.customers)
          ? (a.customers as { nombre: string; telefono: string | null }[])[0] ?? null
          : (a.customers as { nombre: string; telefono: string | null } | null),
        services: Array.isArray(a.services)
          ? (a.services as { name: string; price: number }[])[0] ?? null
          : (a.services as { name: string; price: number } | null),
      }));

    const shopRow = shop.data as { nombre?: string; slug?: string; business_hours?: unknown } | null;
    const gapHours = resolveGapHours(shopRow?.business_hours, todayStart.getUTCDay());
    const agendaIntervals: AgendaInterval[] = (appointmentsToday.data ?? [])
      .filter((a) => typeof a.end_time === "string" && a.end_time)
      .map((a) => ({ start: a.start_time as string, end: a.end_time as string }));
    const agendaGap = findLargestGap(agendaIntervals, gapHours, todayStart, nowIso);

    return {
      success: true,
      data: {
        appointmentsCount: (appointmentsToday.data ?? []).length,
        lowStockCount: (lowStock.data ?? []).length,
        nextAppointments,
        loyaltyRewardsReadyCount: (loyaltyReady.data ?? []).length,
        loyaltyRewardCustomerNames,
        shopName: shopRow?.nombre || "",
        shopSlug: shopRow?.slug || "",
        agendaGap,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar resumen" };
  }
}

/**
 * Topes de las agregaciones de Inicio. Un `.limit()` sin `count` se come filas en
 * silencio (PostgREST no avisa), y en un dashboard de 6 meses eso no es un
 * detalle: son los numeros que el dueño mira para decidir. Con `count` la action
 * devuelve si el total es parcial y la UI lo dice.
 */
const TRENDS_LIMIT = 5000;
const FLOW_RANGE_LIMIT = 5000;

export type DashboardMetrics = {
  revenueChart: Array<{ month: string; income: number; expenses: number }>;
  dailyBreakdown: Array<{ dateKey: string; income: number; expenses: number }>;
  weeklyBreakdown: Array<{ weekKey: string; income: number; expenses: number }>;
  monthlyGrowth: Array<{ month: string; clients: number; growthPct: number | null }>;
  healthScore: number;
  healthBreakdown: { revenue: number; clients: number; appointments: number };
  flowByPeriod: {
    today: { income: number; expenses: number; truncated: boolean };
    week: { income: number; expenses: number; truncated: boolean };
    month: { income: number; expenses: number; truncated: boolean };
  };
  /** Alguna de las 5 consultas de 6 meses se corto y los graficos son parciales. */
  trendsTruncated: boolean;
  topServices: Array<{ name: string; count: number }>;
  topDias: Array<{ name: string; count: number }>;
  topHorarios: Array<{ name: string; count: number }>;
  stats: { totalClients: number; totalAppointments: number };
};

async function fetchFlowRange(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  shopId: string,
  startIso: string,
  endIso: string
): Promise<{ income: number; expenses: number; truncated: boolean }> {
  const [appointmentsRes, financesRes, cashMovesRes] = await Promise.all([
    admin
      .from("appointments")
      .select("is_paid, service_price, amount_paid, loyalty_discount_percent_applied, services!appointments_service_id_fkey(price)", { count: "exact" })
      .eq("shop_id", shopId)
      .gte("start_time", startIso)
      .lte("start_time", endIso)
      .eq("status", "completed")
      .limit(FLOW_RANGE_LIMIT),
    admin
      .from("finances")
      .select("amount, type, happened_at", { count: "exact" })
      .eq("shop_id", shopId)
      .is("appointment_id", null)
      .gte("happened_at", startIso)
      .lte("happened_at", endIso)
      .limit(FLOW_RANGE_LIMIT),
    admin
      .from("cash_movements")
      .select("amount, movement_type", { count: "exact" })
      .eq("shop_id", shopId)
      .is("appointment_id", null)
      .in("movement_type", ["income", "expense", "withdrawal"])
      .gte("happened_at", startIso)
      .lte("happened_at", endIso)
      .limit(FLOW_RANGE_LIMIT),
  ]);

  if (appointmentsRes.error) throw new Error(appointmentsRes.error.message);
  if (financesRes.error) throw new Error(financesRes.error.message);
  if (cashMovesRes.error) throw new Error(cashMovesRes.error.message);

  const appointmentsIncome = (appointmentsRes.data ?? []).reduce((sum, row) => {
    if (!row.is_paid) return sum;
    return sum + collectedAmount(row);
  }, 0);

  const cashIncome = (cashMovesRes.data ?? [])
    .filter((m) => m.movement_type === "income")
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);

  const manualIncome = (financesRes.data ?? [])
    .filter((f) => f.type === "income")
    .reduce((sum, f) => sum + Number(f.amount || 0), 0);

  const financeExpenses = (financesRes.data ?? [])
    .filter((f) => f.type === "expense")
    .reduce((sum, f) => sum + Number(f.amount || 0), 0);

  const cashExpenses = (cashMovesRes.data ?? [])
    .filter((m) => m.movement_type === "expense" || m.movement_type === "withdrawal")
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);

  // Sin `count`, un local con mas de FLOW_RANGE_LIMIT filas veia los KPI de
  // Hoy/Semana/Mes mas bajos sin ningun aviso. Con el flag, Inicio puede
  // decirlo en vez de mentir en silencio.
  const truncated =
    ((appointmentsRes.count ?? 0) > (appointmentsRes.data ?? []).length) ||
    ((financesRes.count ?? 0) > (financesRes.data ?? []).length) ||
    ((cashMovesRes.count ?? 0) > (cashMovesRes.data ?? []).length);

  return { income: appointmentsIncome + manualIncome + cashIncome, expenses: financeExpenses + cashExpenses, truncated };
}

export async function fetchDashboardMetrics(shopIdOverride?: string): Promise<ActionResult<DashboardMetrics>> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "member");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const admin = await createAdminClient();

    const nowAr = getArgentinaNow();
    const todayArKey = getArgentinaDateKey(nowAr);
    const { start: dayStart, end: dayEnd } = getArgentinaDayBounds(todayArKey);

    const weekStart = new Date(dayStart);
    const dayOfWeek = weekStart.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekStart.setUTCDate(weekStart.getUTCDate() + mondayOffset);

    const monthStart = new Date(dayStart);
    monthStart.setUTCDate(1);

    const sixMonthsAgo = new Date(monthStart);
    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);

    const [apptsRevenueRes, apptsCountRes, financesRes, cashMovesRes, clientsRes, flowToday, flowWeek, flowMonth] = await Promise.all([
      admin
        .from("appointments")
        .select("date_key_ar, start_time, service_id, is_paid, service_price, amount_paid, loyalty_discount_percent_applied, services!appointments_service_id_fkey(name, price)", { count: "exact" })
        .eq("shop_id", shopId)
        .gte("start_time", sixMonthsAgo.toISOString())
        .eq("status", "completed")
        // El limit sin order trunca en forma arbitraria: el top 5 era distinto en
        // cada carga. Se ordena para que el corte sea siempre el mismo.
        .order("start_time", { ascending: false })
        .limit(TRENDS_LIMIT),
      admin
        .from("appointments")
        .select("id", { count: "exact" })
        .eq("shop_id", shopId)
        .gte("start_time", sixMonthsAgo.toISOString())
        .in("status", ["confirmed", "pending_payment", "completed"])
        .limit(TRENDS_LIMIT),
      admin
        .from("finances")
        .select("amount, type, created_at, happened_at", { count: "exact" })
        .eq("shop_id", shopId)
        .is("appointment_id", null)
        .gte("happened_at", sixMonthsAgo.toISOString())
        .limit(TRENDS_LIMIT),
      admin
        .from("cash_movements")
        .select("amount, movement_type, happened_at, created_at", { count: "exact" })
        .eq("shop_id", shopId)
        .is("appointment_id", null)
        .gte("happened_at", sixMonthsAgo.toISOString())
        .limit(TRENDS_LIMIT),
      admin
        .from("customers")
        .select("created_at", { count: "exact" })
        .eq("shop_id", shopId)
        .gte("created_at", sixMonthsAgo.toISOString())
        .limit(TRENDS_LIMIT),
      fetchFlowRange(admin, shopId, dayStart.toISOString(), dayEnd.toISOString()),
      fetchFlowRange(admin, shopId, weekStart.toISOString(), dayEnd.toISOString()),
      fetchFlowRange(admin, shopId, monthStart.toISOString(), dayEnd.toISOString()),
    ]);

    if (apptsRevenueRes.error) return { success: false, error: apptsRevenueRes.error.message };
    if (apptsCountRes.error) return { success: false, error: apptsCountRes.error.message };
    if (financesRes.error) return { success: false, error: financesRes.error.message };
    if (cashMovesRes.error) return { success: false, error: cashMovesRes.error.message };
    if (clientsRes.error) return { success: false, error: clientsRes.error.message };

    // Un local de 6 sillones tiene ~30 turnos/dia: en 6 meses son 32.000 filas y
    // el tope de 5000 se come la mitad del periodo. El grafico de ingresos por
    // mes mostraba $0 en los meses viejos (porque solo entran las filas de
    // `finances`/`cash_movements`, que casi no tienen historia) y el Rendimiento
    // se calculaba sobre el ~15% de los datos. Antes era silencioso.
    const trendsTruncated =
      ((apptsRevenueRes.count ?? 0) > (apptsRevenueRes.data ?? []).length) ||
      ((apptsCountRes.count ?? 0) > (apptsCountRes.data ?? []).length) ||
      ((financesRes.count ?? 0) > (financesRes.data ?? []).length) ||
      ((cashMovesRes.count ?? 0) > (cashMovesRes.data ?? []).length) ||
      ((clientsRes.count ?? 0) > (clientsRes.data ?? []).length);

    const incomeByMonth = new Map<string, number>();
    const expensesByMonth = new Map<string, number>();

    // El score de Rendimiento compara el mes actual contra el promedio de los 3
    // anteriores. Con el mes a medias eso es tramposo: el dia 3 se comparan 3 dias
    // contra meses enteros y toda peluqueria del mundo sale "Critico". Los mapas
    // `*Cut` son los mismos numeros pero recortados al dia de hoy, asi que la
    // comparacion es siempre "mismos dias contra mismos dias".
    // Caso borde: si el mes anterior tiene menos dias que `diaDelMes`, se toma
    // completo (no hay dias que comparar).
    const diaDelMes = Number(todayArKey.slice(8, 10));
    const incomeByMonthCut = new Map<string, number>();
    const expensesByMonthCut = new Map<string, number>();
    const clientsByMonthCut = new Map<string, number>();
    const apptsByMonthCut = new Map<string, number>();
    const dentroDelCorte = (dateKey: string | null | undefined): boolean => {
      if (!dateKey || dateKey.length < 10) return false;
      return Number(dateKey.slice(8, 10)) <= diaDelMes;
    };
    const sumarEn = (map: Map<string, number>, month: string, amount: number) =>
      map.set(month, (map.get(month) ?? 0) + amount);

    for (const apt of apptsRevenueRes.data ?? []) {
      if (!apt.is_paid) continue;
      const month = typeof apt.date_key_ar === "string" ? apt.date_key_ar.slice(0, 7) : null;
      if (!month) continue;
      const price = collectedAmount(apt);
      incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + price);
      if (dentroDelCorte(apt.date_key_ar)) sumarEn(incomeByMonthCut, month, price);
      sumarEn(apptsByMonthCut, month, 1);
    }

    for (const fin of financesRes.data ?? []) {
      const dateKey = fin.happened_at || fin.created_at;
      const month = dateKey ? getArgentinaDateKey(dateKey).slice(0, 7) : null;
      if (!month) continue;
      const dk = dateKey ? getArgentinaDateKey(dateKey) : null;
      if (fin.type === "income") {
        incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + fin.amount);
        if (dentroDelCorte(dk)) sumarEn(incomeByMonthCut, month, fin.amount);
      } else if (fin.type === "expense") {
        expensesByMonth.set(month, (expensesByMonth.get(month) ?? 0) + fin.amount);
        if (dentroDelCorte(dk)) sumarEn(expensesByMonthCut, month, fin.amount);
      }
    }

    for (const mov of cashMovesRes.data ?? []) {
      const month = mov.happened_at ? getArgentinaDateKey(mov.happened_at).slice(0, 7) : null;
      if (!month) continue;
      const dk = mov.happened_at ? getArgentinaDateKey(mov.happened_at) : null;
      if (mov.movement_type === "income") {
        incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + Number(mov.amount || 0));
        if (dentroDelCorte(dk)) sumarEn(incomeByMonthCut, month, Number(mov.amount || 0));
      } else if (mov.movement_type === "expense" || mov.movement_type === "withdrawal") {
        expensesByMonth.set(month, (expensesByMonth.get(month) ?? 0) + Number(mov.amount || 0));
        if (dentroDelCorte(dk)) sumarEn(expensesByMonthCut, month, Number(mov.amount || 0));
      }
    }

    const allMonths = new Set([...incomeByMonth.keys(), ...expensesByMonth.keys()]);
    const revenueChart = [...allMonths].sort().map((month) => ({
      month,
      income: incomeByMonth.get(month) ?? 0,
      expenses: expensesByMonth.get(month) ?? 0,
    }));

    const weekDayKeys: string[] = [];
    {
      const wd = new Date(weekStart);
      for (let i = 0; i < 7; i++) {
        const k = getArgentinaDateKey(wd);
        weekDayKeys.push(k);
        wd.setUTCDate(wd.getUTCDate() + 1);
      }
    }
    const incomeByDay = new Map<string, number>();
    const expensesByDay = new Map<string, number>();
    for (const apt of apptsRevenueRes.data ?? []) {
      if (!apt.is_paid) continue;
      const dk = typeof apt.date_key_ar === "string" ? apt.date_key_ar : null;
      if (!dk || !weekDayKeys.includes(dk)) continue;
      const price = collectedAmount(apt);
      incomeByDay.set(dk, (incomeByDay.get(dk) ?? 0) + price);
    }
    for (const fin of financesRes.data ?? []) {
      const dateKey = fin.happened_at || fin.created_at;
      const dk = dateKey ? getArgentinaDateKey(dateKey) : null;
      if (!dk || !weekDayKeys.includes(dk)) continue;
      if (fin.type === "income") {
        incomeByDay.set(dk, (incomeByDay.get(dk) ?? 0) + fin.amount);
      } else if (fin.type === "expense") {
        expensesByDay.set(dk, (expensesByDay.get(dk) ?? 0) + fin.amount);
      }
    }
    for (const mov of cashMovesRes.data ?? []) {
      const dk = mov.happened_at ? getArgentinaDateKey(mov.happened_at) : null;
      if (!dk || !weekDayKeys.includes(dk)) continue;
      if (mov.movement_type === "income") {
        incomeByDay.set(dk, (incomeByDay.get(dk) ?? 0) + Number(mov.amount || 0));
      } else if (mov.movement_type === "expense" || mov.movement_type === "withdrawal") {
        expensesByDay.set(dk, (expensesByDay.get(dk) ?? 0) + Number(mov.amount || 0));
      }
    }
    const dailyBreakdown = weekDayKeys.map((dk) => ({
      dateKey: dk,
      income: incomeByDay.get(dk) ?? 0,
      expenses: expensesByDay.get(dk) ?? 0,
    }));
    const weeksToShow: string[] = [];
    {
      const mondayStart = new Date(weekStart);
      for (let i = 7; i >= 0; i--) {
        const w = new Date(mondayStart);
        w.setUTCDate(w.getUTCDate() - i * 7);
        weeksToShow.push(getArgentinaDateKey(w));
      }
    }
    const incomeByWeek = new Map<string, number>();
    const expensesByWeek = new Map<string, number>();
    for (const apt of apptsRevenueRes.data ?? []) {
      if (!apt.is_paid) continue;
      const dk = typeof apt.date_key_ar === "string" ? apt.date_key_ar : null;
      if (!dk) continue;
      const d = new Date(dk + "T12:00:00-03:00");
      const day = d.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setUTCDate(d.getUTCDate() + diff);
      const weekKey = getArgentinaDateKey(d);
      if (!weeksToShow.includes(weekKey)) continue;
      const price = collectedAmount(apt);
      incomeByWeek.set(weekKey, (incomeByWeek.get(weekKey) ?? 0) + price);
    }
    for (const fin of financesRes.data ?? []) {
      const dateKey = fin.happened_at || fin.created_at;
      const dk = dateKey ? getArgentinaDateKey(dateKey) : null;
      if (!dk) continue;
      const d = new Date(dk + "T12:00:00-03:00");
      const day = d.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setUTCDate(d.getUTCDate() + diff);
      const weekKey = getArgentinaDateKey(d);
      if (!weeksToShow.includes(weekKey)) continue;
      if (fin.type === "income") {
        incomeByWeek.set(weekKey, (incomeByWeek.get(weekKey) ?? 0) + fin.amount);
      } else if (fin.type === "expense") {
        expensesByWeek.set(weekKey, (expensesByWeek.get(weekKey) ?? 0) + fin.amount);
      }
    }
    for (const mov of cashMovesRes.data ?? []) {
      const dk = mov.happened_at ? getArgentinaDateKey(mov.happened_at) : null;
      if (!dk) continue;
      const d = new Date(dk + "T12:00:00-03:00");
      const day = d.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setUTCDate(d.getUTCDate() + diff);
      const weekKey = getArgentinaDateKey(d);
      if (!weeksToShow.includes(weekKey)) continue;
      if (mov.movement_type === "income") {
        incomeByWeek.set(weekKey, (incomeByWeek.get(weekKey) ?? 0) + Number(mov.amount || 0));
      } else if (mov.movement_type === "expense" || mov.movement_type === "withdrawal") {
        expensesByWeek.set(weekKey, (expensesByWeek.get(weekKey) ?? 0) + Number(mov.amount || 0));
      }
    }
    const weeklyBreakdown = weeksToShow.map((wk) => ({
      weekKey: wk,
      income: incomeByWeek.get(wk) ?? 0,
      expenses: expensesByWeek.get(wk) ?? 0,
    }));

    // La agrupacion vive en demanda-buckets: antes se hacia acá con
    // getUTCHours()/getUTCDay() sobre el timestamptz crudo, que mostraba todos los
    // horarios corridos +3 h y empujaba al dia siguiente los turnos de 21 a 23:59.
    const demanda = buildDemandaBuckets(apptsRevenueRes.data);
    const topDias = demanda.topDias;
    const topHorarios = demanda.topHorarios;
    const topServices = demanda.topServicios;

    const totalClients = clientsRes.data?.length ?? 0;
    const totalAppointments = apptsCountRes.data?.length ?? 0;

    const currentMonth = todayArKey.slice(0, 7);

    const toMonthKey = (value: string | null | undefined) => {
      if (!value) return "";
      return getArgentinaDateKey(value).slice(0, 7);
    };

    const clientsByMonth = new Map<string, number>();
    for (const client of clientsRes.data ?? []) {
      const mk = toMonthKey(client.created_at);
      if (!mk) continue;
      clientsByMonth.set(mk, (clientsByMonth.get(mk) || 0) + 1);
      if (dentroDelCorte(client.created_at ? getArgentinaDateKey(client.created_at) : null)) {
        sumarEn(clientsByMonthCut, mk, 1);
      }
    }

// El mes en curso siempre tiene punto, aunque tenga cero. Sin esto, el ultimo
    // punto de la serie es el MES PASADO y la card de Inicio mostraba "+13 este
    // mes" cuando en octubre van cero clientes: el dato existia, pero era de
    // septiembre.
    if (!clientsByMonth.has(currentMonth)) {
      clientsByMonth.set(currentMonth, 0);
    }

const monthlyGrowth = [...clientsByMonth.keys()]
      .sort()
      .slice(-6)
      .map((month, index, arr) => {
        const clients = clientsByMonth.get(month) || 0;
        if (index === 0) {
          return { month, clients, growthPct: null };
        }
        const prevClients = clientsByMonth.get(arr[index - 1]) || 0;
        const growthPct = prevClients > 0 ? Math.round(((clients - prevClients) / prevClients) * 100) : null;
        return { month, clients, growthPct };
      });

    const apptsByMonth = new Map<string, number>();
    for (const apt of apptsRevenueRes.data ?? []) {
      const month = typeof apt.date_key_ar === "string" ? apt.date_key_ar.slice(0, 7) : null;
      if (!month) continue;
      apptsByMonth.set(month, (apptsByMonth.get(month) || 0) + 1);
      if (dentroDelCorte(apt.date_key_ar)) sumarEn(apptsByMonthCut, month, 1);
    }

    const trailingMonths = (n: number) => {
      const months: string[] = [];
      const d = new Date(nowAr.getFullYear(), nowAr.getMonth(), 1);
      for (let i = 0; i < n; i++) {
        d.setMonth(d.getMonth() - 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      return months;
    };

    const compRatio = (current: number, avg: number) => {
      if (avg <= 0) return current > 0 ? 150 : 100;
      return Math.min(Math.round((current / avg) * 100), 200);
    };

    const toScore = (ratio: number) => Math.round(ratio / 2);

    const [m1, m2, m3] = trailingMonths(3);
    // Todo el score se arma con los mapas recortados al dia de hoy: el mes actual
    // contra el mismo tramo de cada uno de los 3 meses anteriores.
    const avgRevenue = ([m1, m2, m3].reduce((s, m) => s + (incomeByMonthCut.get(m) ?? 0), 0) / 3);
    const avgClients = ([m1, m2, m3].reduce((s, m) => s + (clientsByMonthCut.get(m) ?? 0), 0) / 3);
    const avgAppts = ([m1, m2, m3].reduce((s, m) => s + (apptsByMonthCut.get(m) ?? 0), 0) / 3);

    const revScore = toScore(compRatio(incomeByMonthCut.get(currentMonth) ?? 0, avgRevenue));
    const cliScore = toScore(compRatio(clientsByMonthCut.get(currentMonth) ?? 0, avgClients));
    const apptScore = toScore(compRatio(apptsByMonthCut.get(currentMonth) ?? 0, avgAppts));

    const healthScore = Math.min(
      Math.round(revScore * 0.4 + cliScore * 0.3 + apptScore * 0.3),
      100
    );

    return {
      success: true,
      data: {
        revenueChart,
        dailyBreakdown,
        weeklyBreakdown,
        monthlyGrowth,
        healthScore,
        healthBreakdown: { revenue: revScore, clients: cliScore, appointments: apptScore },
        flowByPeriod: {
          today: flowToday,
          week: flowWeek,
          month: flowMonth,
        },
        topServices,
        topDias,
        topHorarios,
        trendsTruncated,
        stats: { totalClients, totalAppointments },
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar métricas del dashboard" };
  }
}
