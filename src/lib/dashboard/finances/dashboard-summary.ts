"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient, getCurrentUserRole, requireShopId } from "@/lib/dashboard/auth/server";
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
import { createAdminClient } from "./appointment-shared";

type NextAppointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  customers: { nombre: string; telefono: string | null } | null;
  services: { name: string; price: number } | null;
};

type DashboardSummary = {
  appointmentsCount: number;
  revenue: number;
  lowStockCount: number;
  nextAppointments: NextAppointment[];
  loyaltyRewardsReadyCount: number;
  loyaltyRewardCustomerNames: string[];
  shopName: string;
  shopSlug: string;
};

export async function fetchDashboardSummary(shopIdOverride?: string): Promise<ActionResult<DashboardSummary>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    // Staff cannot access financial summary at all
    const roleResult = await getCurrentUserRole(shopId);
    const isStaff = roleResult.success && roleResult.data?.role === "staff";
    if (isStaff) {
      return {
        success: true,
        data: {
          appointmentsCount: 0,
          revenue: 0,
          lowStockCount: 0,
          nextAppointments: [],
          loyaltyRewardsReadyCount: 0,
          loyaltyRewardCustomerNames: [],
          shopName: "",
          shopSlug: "",
        },
      };
    }

    const supabase = await createServerClient();

    const todayDateStr = getArgentinaDateString();
    const { start: todayStart, end: todayEnd } = getArgentinaDayBounds(todayDateStr);
    const todayStartIso = todayStart.toISOString();
    const todayEndIso = todayEnd.toISOString();

    const nowIso = getArgentinaNow().toISOString();

    const [appointmentsToday, revenueToday, lowStock, loyaltyReady, loyaltyRewardCustomers, nextResult, shop] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, start_time, status")
        .eq("shop_id", shopId)
        .gte("start_time", todayStartIso)
        .lte("start_time", todayEndIso)
        .in("status", APPOINTMENT_STATUS_TODAY_SUMMARY as unknown as string[])
        .order("start_time", { ascending: true }),

      supabase
        .from("appointments")
        .select("id, status, is_paid, service_price, services(price)")
        .eq("shop_id", shopId)
        .gte("start_time", todayStartIso)
        .lte("start_time", todayEndIso)
        .eq("status", "completed")
        .eq("is_paid", true),

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
        .select("*, customers(nombre, telefono), services(name, price)")
        .eq("shop_id", shopId)
        .gte("start_time", nowIso)
        .lte("start_time", todayEndIso)
        .in("status", APPOINTMENT_STATUS_UPCOMING as unknown as string[])
        .order("start_time", { ascending: true })
        .limit(5),

      supabase
        .from("shops")
        .select("nombre, slug")
        .eq("id", shopId)
        .single(),
    ]);

    if (appointmentsToday.error) return { success: false, error: appointmentsToday.error.message };
    if (revenueToday.error) return { success: false, error: revenueToday.error.message };
    if (lowStock.error) return { success: false, error: lowStock.error.message };
    if (loyaltyReady.error) return { success: false, error: loyaltyReady.error.message };
    if (loyaltyRewardCustomers.error) return { success: false, error: loyaltyRewardCustomers.error.message };
    if (nextResult.error) return { success: false, error: nextResult.error.message };
    if (shop.error) return { success: false, error: shop.error.message };

    const loyaltyRewardCustomerNames = (loyaltyRewardCustomers.data ?? [])
      .map((c) => (c.nombre || "").trim())
      .filter(Boolean);

    const revenue = (revenueToday.data ?? []).reduce((sum, a) => {
      if (a.service_price != null) return sum + Number(a.service_price);
      const serviceData = a.services as { price?: number } | Array<{ price?: number }> | null;
      const price = serviceData ? (Array.isArray(serviceData) ? serviceData[0]?.price : serviceData.price) : 0;
      return sum + (Number(price) || 0);
    }, 0);

    const nextAppointments: NextAppointment[] = (nextResult.data ?? []).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        start_time: a.start_time as string,
        end_time: a.end_time as string,
        status: a.status as string,
        customers: Array.isArray(a.customers)
          ? (a.customers as { nombre: string; telefono: string | null }[])[0] ?? null
          : (a.customers as { nombre: string; telefono: string | null } | null),
        services: Array.isArray(a.services)
          ? (a.services as { name: string; price: number }[])[0] ?? null
          : (a.services as { name: string; price: number } | null),
      }));

    return {
      success: true,
      data: {
        appointmentsCount: (appointmentsToday.data ?? []).length,
        revenue,
        lowStockCount: (lowStock.data ?? []).length,
        nextAppointments,
        loyaltyRewardsReadyCount: (loyaltyReady.data ?? []).length,
        loyaltyRewardCustomerNames,
        shopName: (shop.data as { nombre: string } | null)?.nombre || "",
        shopSlug: (shop.data as { slug: string } | null)?.slug || "",
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar resumen" };
  }
}

export type DashboardMetrics = {
  revenueChart: Array<{ month: string; income: number; expenses: number }>;
  dailyBreakdown: Array<{ dateKey: string; income: number; expenses: number }>;
  hourlyBreakdown: Array<{ hour: string; income: number; expenses: number }>;
  weeklyBreakdown: Array<{ weekKey: string; income: number; expenses: number }>;
  busiestDay: { day: string; count: number } | null;
  busiestHour: { hour: string; count: number } | null;
  monthlyGrowth: Array<{ month: string; clients: number; growthPct: number | null }>;
  healthScore: number;
  healthBreakdown: { revenue: number; clients: number; appointments: number };
  flowByPeriod: {
    today: { income: number; expenses: number };
    week: { income: number; expenses: number };
    month: { income: number; expenses: number };
  };
  topServices: Array<{ name: string; count: number }>;
  stats: { totalClients: number; growth: number | null; totalAppointments: number };
};

async function fetchFlowRange(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  shopId: string,
  startIso: string,
  endIso: string
): Promise<{ income: number; expenses: number }> {
  const [appointmentsRes, financesRes, cashMovesRes] = await Promise.all([
    admin
      .from("appointments")
      .select("is_paid, service_price, services!appointments_service_id_fkey(price)")
      .eq("shop_id", shopId)
      .gte("start_time", startIso)
      .lte("start_time", endIso)
      .eq("status", "completed")
      .limit(1000),
    admin
      .from("finances")
      .select("amount, type, happened_at")
      .eq("shop_id", shopId)
      .is("appointment_id", null)
      .gte("happened_at", startIso)
      .lte("happened_at", endIso)
      .limit(1000),
    admin
      .from("cash_movements")
      .select("amount, movement_type")
      .eq("shop_id", shopId)
      .is("appointment_id", null)
      .in("movement_type", ["income", "expense", "withdrawal"])
      .gte("happened_at", startIso)
      .lte("happened_at", endIso)
      .limit(1000),
  ]);

  if (appointmentsRes.error) throw new Error(appointmentsRes.error.message);
  if (financesRes.error) throw new Error(financesRes.error.message);
  if (cashMovesRes.error) throw new Error(cashMovesRes.error.message);

  const appointmentsIncome = (appointmentsRes.data ?? []).reduce((sum, row) => {
    if (!row.is_paid) return sum;
    if (row.service_price != null) return sum + Number(row.service_price);
    const svc = Array.isArray(row.services) ? row.services[0] : row.services;
    return sum + Number(svc?.price || 0);
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

  return { income: appointmentsIncome + manualIncome + cashIncome, expenses: financeExpenses + cashExpenses };
}

export async function fetchDashboardMetrics(shopIdOverride?: string): Promise<ActionResult<DashboardMetrics>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    // Check if user is staff — if so, return empty metrics
    const roleResult = await getCurrentUserRole(shopId);
    if (roleResult.success && roleResult.data?.role === "staff") {
      return {
        success: true,
        data: {
          revenueChart: [],
          dailyBreakdown: [],
          hourlyBreakdown: [],
          weeklyBreakdown: [],
          busiestDay: null,
          busiestHour: null,
          monthlyGrowth: [],
          healthScore: 0,
          healthBreakdown: { revenue: 0, clients: 0, appointments: 0 },
          flowByPeriod: { today: { income: 0, expenses: 0 }, week: { income: 0, expenses: 0 }, month: { income: 0, expenses: 0 } },
          topServices: [],
          stats: { totalClients: 0, growth: null, totalAppointments: 0 },
        },
      };
    }

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
        .select("date_key_ar, start_time, service_id, is_paid, service_price, services!appointments_service_id_fkey(price)")
        .eq("shop_id", shopId)
        .gte("start_time", sixMonthsAgo.toISOString())
        .eq("status", "completed")
        .limit(2000),
      admin
        .from("appointments")
        .select("id")
        .eq("shop_id", shopId)
        .gte("start_time", sixMonthsAgo.toISOString())
        .in("status", ["scheduled", "confirmed", "pending_payment", "in_progress", "completed"])
        .limit(2000),
      admin
        .from("finances")
        .select("amount, type, created_at, happened_at")
        .eq("shop_id", shopId)
        .is("appointment_id", null)
        .gte("happened_at", sixMonthsAgo.toISOString())
        .limit(2000),
      admin
        .from("cash_movements")
        .select("amount, movement_type, happened_at, created_at")
        .eq("shop_id", shopId)
        .is("appointment_id", null)
        .gte("happened_at", sixMonthsAgo.toISOString())
        .limit(2000),
      admin
        .from("customers")
        .select("created_at")
        .eq("shop_id", shopId)
        .gte("created_at", sixMonthsAgo.toISOString())
        .limit(2000),
      fetchFlowRange(admin, shopId, dayStart.toISOString(), dayEnd.toISOString()),
      fetchFlowRange(admin, shopId, weekStart.toISOString(), dayEnd.toISOString()),
      fetchFlowRange(admin, shopId, monthStart.toISOString(), dayEnd.toISOString()),
    ]);

    if (apptsRevenueRes.error) return { success: false, error: apptsRevenueRes.error.message };
    if (apptsCountRes.error) return { success: false, error: apptsCountRes.error.message };
    if (financesRes.error) return { success: false, error: financesRes.error.message };
    if (cashMovesRes.error) return { success: false, error: cashMovesRes.error.message };
    if (clientsRes.error) return { success: false, error: clientsRes.error.message };

    const incomeByMonth = new Map<string, number>();
    const expensesByMonth = new Map<string, number>();

    for (const apt of apptsRevenueRes.data ?? []) {
      if (!apt.is_paid) continue;
      const month = typeof apt.date_key_ar === "string" ? apt.date_key_ar.slice(0, 7) : null;
      if (!month) continue;
      const price = apt.service_price != null ? Number(apt.service_price) : (() => {
        const svc = Array.isArray(apt.services) ? apt.services[0] : apt.services;
        return svc?.price ?? 0;
      })();
      incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + price);
    }

    for (const fin of financesRes.data ?? []) {
      const dateKey = fin.happened_at || fin.created_at;
      const month = dateKey ? getArgentinaDateKey(dateKey).slice(0, 7) : null;
      if (!month) continue;
      if (fin.type === "income") {
        incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + fin.amount);
      } else if (fin.type === "expense") {
        expensesByMonth.set(month, (expensesByMonth.get(month) ?? 0) + fin.amount);
      }
    }

    for (const mov of cashMovesRes.data ?? []) {
      const month = mov.happened_at ? getArgentinaDateKey(mov.happened_at).slice(0, 7) : null;
      if (!month) continue;
      if (mov.movement_type === "income") {
        incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + Number(mov.amount || 0));
      } else if (mov.movement_type === "expense" || mov.movement_type === "withdrawal") {
        expensesByMonth.set(month, (expensesByMonth.get(month) ?? 0) + Number(mov.amount || 0));
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
      const price = apt.service_price != null ? Number(apt.service_price) : (() => {
        const svc = Array.isArray(apt.services) ? apt.services[0] : apt.services;
        return svc?.price ?? 0;
      })();
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

    const hours = Array.from({ length: 14 }, (_, i) => String(i + 8));
    const incomeByHour = new Map<string, number>();
    const expensesByHour = new Map<string, number>();
    for (const apt of apptsRevenueRes.data ?? []) {
      if (!apt.is_paid) continue;
      const dk = typeof apt.date_key_ar === "string" ? apt.date_key_ar : null;
      if (!dk || dk !== todayArKey) continue;
      const hour = apt.start_time ? String(new Date(apt.start_time).getUTCHours()).padStart(2, "0") : null;
      if (!hour || !hours.includes(hour)) continue;
      const price = apt.service_price != null ? Number(apt.service_price) : (() => {
        const svc = Array.isArray(apt.services) ? apt.services[0] : apt.services;
        return svc?.price ?? 0;
      })();
      incomeByHour.set(hour, (incomeByHour.get(hour) ?? 0) + price);
    }
    for (const fin of financesRes.data ?? []) {
      const dateKey = fin.happened_at || fin.created_at;
      if (!dateKey) continue;
      const dk = getArgentinaDateKey(dateKey);
      if (dk !== todayArKey) continue;
      const hour = String(new Date(dateKey).getUTCHours()).padStart(2, "0");
      if (!hours.includes(hour)) continue;
      if (fin.type === "income") {
        incomeByHour.set(hour, (incomeByHour.get(hour) ?? 0) + fin.amount);
      } else if (fin.type === "expense") {
        expensesByHour.set(hour, (expensesByHour.get(hour) ?? 0) + fin.amount);
      }
    }
    for (const mov of cashMovesRes.data ?? []) {
      if (!mov.happened_at) continue;
      const dk = getArgentinaDateKey(mov.happened_at);
      if (dk !== todayArKey) continue;
      const hour = String(new Date(mov.happened_at).getUTCHours()).padStart(2, "0");
      if (!hours.includes(hour)) continue;
      if (mov.movement_type === "income") {
        incomeByHour.set(hour, (incomeByHour.get(hour) ?? 0) + Number(mov.amount || 0));
      } else if (mov.movement_type === "expense" || mov.movement_type === "withdrawal") {
        expensesByHour.set(hour, (expensesByHour.get(hour) ?? 0) + Number(mov.amount || 0));
      }
    }
    const hourlyBreakdown = hours.map((hour) => ({
      hour,
      income: incomeByHour.get(hour) ?? 0,
      expenses: expensesByHour.get(hour) ?? 0,
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
      const price = apt.service_price != null ? Number(apt.service_price) : (() => {
        const svc = Array.isArray(apt.services) ? apt.services[0] : apt.services;
        return svc?.price ?? 0;
      })();
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

    const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const dayCounts = new Map<string, number>();
    const hourCounts = new Map<string, number>();
    for (const apt of apptsRevenueRes.data ?? []) {
      if (!apt.start_time) continue;
      const d = new Date(apt.start_time);
      const dayName = dayNames[d.getUTCDay()];
      dayCounts.set(dayName, (dayCounts.get(dayName) ?? 0) + 1);
      const hour = String(d.getUTCHours()).padStart(2, "0");
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }
    let busiestDay: { day: string; count: number } | null = null;
    let busiestHour: { hour: string; count: number } | null = null;
    for (const [day, count] of dayCounts) {
      if (!busiestDay || count > busiestDay.count) busiestDay = { day, count };
    }
    for (const [hour, count] of hourCounts) {
      if (!busiestHour || count > busiestHour.count) busiestHour = { hour: `${hour}:00`, count };
    }

    const { data: topRaw, error: topErr } = await admin
      .from("appointments")
      .select("service_id, is_paid, services!appointments_service_id_fkey(name)")
      .eq("shop_id", shopId)
      .gte("start_time", sixMonthsAgo.toISOString())
      .eq("status", "completed")
      .eq("is_paid", true)
      .limit(2000);

    if (topErr) return { success: false, error: topErr.message };

    const serviceCount = new Map<string, { name: string; count: number }>();
    for (const apt of topRaw ?? []) {
      const svc = Array.isArray(apt.services) ? apt.services[0] : apt.services;
      const name = svc?.name;
      if (!name) continue;
      const entry = serviceCount.get(apt.service_id) ?? { name, count: 0 };
      entry.count++;
      serviceCount.set(apt.service_id, entry);
    }

    const topServices = [...serviceCount.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const totalClients = clientsRes.data?.length ?? 0;
    const totalAppointments = apptsCountRes.data?.length ?? 0;

    const currentMonth = todayArKey.slice(0, 7);
    const prevMonthDate = new Date(`${currentMonth}-01T00:00:00-03:00`);
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

    const toMonthKey = (value: string | null | undefined) => {
      if (!value) return "";
      return getArgentinaDateKey(value).slice(0, 7);
    };

    const currentMonthClients =
      clientsRes.data?.filter((c) => toMonthKey(c.created_at) === currentMonth).length ?? 0;
    const prevMonthClients =
      clientsRes.data?.filter((c) => toMonthKey(c.created_at) === prevMonth).length ?? 0;

    const growth = prevMonthClients > 0 && currentMonthClients > 0 ? Math.round(((currentMonthClients - prevMonthClients) / prevMonthClients) * 100) : null;

    const clientsByMonth = new Map<string, number>();
    for (const client of clientsRes.data ?? []) {
      const mk = toMonthKey(client.created_at);
      if (!mk) continue;
      clientsByMonth.set(mk, (clientsByMonth.get(mk) || 0) + 1);
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
    const avgRevenue = ([m1, m2, m3].reduce((s, m) => s + (incomeByMonth.get(m) ?? 0), 0) / 3);
    const avgClients = ([m1, m2, m3].reduce((s, m) => s + (clientsByMonth.get(m) ?? 0), 0) / 3);
    const avgAppts = ([m1, m2, m3].reduce((s, m) => s + (apptsByMonth.get(m) ?? 0), 0) / 3);

    const revScore = toScore(compRatio(incomeByMonth.get(currentMonth) ?? 0, avgRevenue));
    const cliScore = toScore(compRatio(clientsByMonth.get(currentMonth) ?? 0, avgClients));
    const apptScore = toScore(compRatio(apptsByMonth.get(currentMonth) ?? 0, avgAppts));

    const healthScore = Math.min(
      Math.round(revScore * 0.4 + cliScore * 0.3 + apptScore * 0.3),
      100
    );

    return {
      success: true,
      data: {
        revenueChart,
        dailyBreakdown,
        hourlyBreakdown,
        weeklyBreakdown,
        busiestDay,
        busiestHour,
        monthlyGrowth,
        healthScore,
        healthBreakdown: { revenue: revScore, clients: cliScore, appointments: apptScore },
        flowByPeriod: {
          today: flowToday,
          week: flowWeek,
          month: flowMonth,
        },
        topServices,
        stats: { totalClients, growth, totalAppointments },
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar métricas del dashboard" };
  }
}
