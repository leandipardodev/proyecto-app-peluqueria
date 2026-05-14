"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import { getArgentinaDateString, getArgentinaDayBounds } from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import "server-only";

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

    const supabase = await createServerClient();

    const todayDateStr = getArgentinaDateString();
    const { start: todayStart, end: todayEnd } = getArgentinaDayBounds(todayDateStr);
    const todayStartIso = todayStart.toISOString();
    const todayEndIso = todayEnd.toISOString();

    const [appointmentsToday, revenueToday, lowStock, loyaltyReady] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, start_time, status")
        .eq("shop_id", shopId)
        .gte("start_time", todayStartIso)
        .lte("start_time", todayEndIso)
        .in("status", ["scheduled", "confirmed", "completed"])
        .order("start_time", { ascending: true }),

      supabase
        .from("appointments")
        .select("id, status, is_paid, services(price)")
        .eq("shop_id", shopId)
        .gte("start_time", todayStartIso)
        .lte("start_time", todayEndIso)
        .in("status", ["scheduled", "confirmed", "completed"]),

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
    ]);

    if (appointmentsToday.error) return { success: false, error: appointmentsToday.error.message };
    if (revenueToday.error) return { success: false, error: revenueToday.error.message };
    if (lowStock.error) return { success: false, error: lowStock.error.message };
    if (loyaltyReady.error) return { success: false, error: loyaltyReady.error.message };

    const revenue = (revenueToday.data ?? []).reduce((sum, a) => {
      const serviceData = a.services as { price?: number } | Array<{ price?: number }> | null;
      const price = serviceData ? (Array.isArray(serviceData) ? serviceData[0]?.price : serviceData.price) : 0;
      return sum + (Number(price) || 0);
    }, 0);

    const nowIso = new Date().toISOString();

    const nextResult = await supabase
      .from("appointments")
      .select("*, customers(nombre, telefono), services(name, price)")
      .eq("shop_id", shopId)
      .gte("start_time", nowIso)
      .lte("start_time", todayEndIso)
      .in("status", ["scheduled", "confirmed"])
      .order("start_time", { ascending: true })
      .limit(5);

    if (nextResult.error) return { success: false, error: nextResult.error.message };

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

    const { data: shop } = await supabase
      .from("shops")
      .select("nombre, slug")
      .eq("id", shopId)
      .single();

    return {
      success: true,
      data: {
        appointmentsCount: (appointmentsToday.data ?? []).length,
        revenue,
        lowStockCount: (lowStock.data ?? []).length,
        nextAppointments,
        loyaltyRewardsReadyCount: (loyaltyReady.data ?? []).length,
        shopName: shop?.nombre || "",
        shopSlug: shop?.slug || "",
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar resumen" };
  }
}

async function createAdminClient() {
  return createServiceRoleClient();
}

export type DashboardMetrics = {
  revenueChart: Array<{ month: string; income: number; expenses: number }>;
  flowByPeriod: {
    today: { income: number; expenses: number };
    week: { income: number; expenses: number };
    month: { income: number; expenses: number };
  };
  topServices: Array<{ name: string; count: number }>;
  stats: { totalClients: number; growth: number };
};

async function fetchFlowRange(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  shopId: string,
  startIso: string,
  endIso: string
): Promise<{ income: number; expenses: number }> {
  const [appointmentsRes, financesRes] = await Promise.all([
    admin
      .from("appointments")
      .select("services!appointments_service_id_fkey(price)")
      .eq("shop_id", shopId)
      .gte("start_time", startIso)
      .lte("start_time", endIso)
      .in("status", ["scheduled", "confirmed", "completed"]),
    admin
      .from("finances")
      .select("amount, type")
      .eq("shop_id", shopId)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);

  if (appointmentsRes.error) throw new Error(appointmentsRes.error.message);
  if (financesRes.error) throw new Error(financesRes.error.message);

  const appointmentsIncome = (appointmentsRes.data ?? []).reduce((sum, row) => {
    const svc = Array.isArray(row.services) ? row.services[0] : row.services;
    return sum + Number(svc?.price || 0);
  }, 0);

  const extraIncome = (financesRes.data ?? [])
    .filter((f) => f.type === "income")
    .reduce((sum, f) => sum + Number(f.amount || 0), 0);

  const expenses = (financesRes.data ?? [])
    .filter((f) => f.type === "expense")
    .reduce((sum, f) => sum + Number(f.amount || 0), 0);

  return { income: appointmentsIncome + extraIncome, expenses };
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
    const admin = await createAdminClient();

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(dayStart);
    monthStart.setDate(monthStart.getDate() - 29);

    const [apptsRes, financesRes, clientsRes, flowToday, flowWeek, flowMonth] = await Promise.all([
      admin
        .from("appointments")
        .select("date_key_ar, service_id, services!appointments_service_id_fkey(price)")
        .eq("shop_id", shopId)
        .in("status", ["scheduled", "confirmed", "completed"]),
      admin
        .from("finances")
        .select("amount, type, created_at")
        .eq("shop_id", shopId),
      admin
        .from("customers")
        .select("created_at")
        .eq("shop_id", shopId),
      fetchFlowRange(admin, shopId, dayStart.toISOString(), dayEnd.toISOString()),
      fetchFlowRange(admin, shopId, weekStart.toISOString(), dayEnd.toISOString()),
      fetchFlowRange(admin, shopId, monthStart.toISOString(), dayEnd.toISOString()),
    ]);

    if (apptsRes.error) return { success: false, error: apptsRes.error.message };
    if (financesRes.error) return { success: false, error: financesRes.error.message };
    if (clientsRes.error) return { success: false, error: clientsRes.error.message };

    const incomeByMonth = new Map<string, number>();
    const expensesByMonth = new Map<string, number>();

    for (const apt of apptsRes.data ?? []) {
      const month = apt.date_key_ar;
      if (!month) continue;
      const svc = Array.isArray(apt.services) ? apt.services[0] : apt.services;
      incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + (svc?.price ?? 0));
    }

    for (const fin of financesRes.data ?? []) {
      const month = fin.created_at?.slice(0, 7);
      if (!month) continue;
      if (fin.type === "income") {
        incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + fin.amount);
      } else if (fin.type === "expense") {
        expensesByMonth.set(month, (expensesByMonth.get(month) ?? 0) + fin.amount);
      }
    }

    const allMonths = new Set([...incomeByMonth.keys(), ...expensesByMonth.keys()]);
    const revenueChart = [...allMonths].sort().map((month) => ({
      month,
      income: incomeByMonth.get(month) ?? 0,
      expenses: expensesByMonth.get(month) ?? 0,
    }));

    const { data: topRaw, error: topErr } = await admin
      .from("appointments")
      .select("service_id, services!appointments_service_id_fkey(name)")
      .eq("shop_id", shopId)
      .in("status", ["completed", "confirmed", "scheduled"]);

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

    const growthNow = new Date();
    const currentMonth = `${growthNow.getFullYear()}-${String(growthNow.getMonth() + 1).padStart(2, "0")}`;
    const prevDate = new Date(growthNow.getFullYear(), growthNow.getMonth() - 1, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    const currentMonthClients =
      clientsRes.data?.filter((c) => (c.created_at ?? "").startsWith(currentMonth)).length ?? 0;
    const prevMonthClients =
      clientsRes.data?.filter((c) => (c.created_at ?? "").startsWith(prevMonth)).length ?? 0;

    const growth =
      prevMonthClients > 0
        ? Math.round(((currentMonthClients - prevMonthClients) / prevMonthClients) * 100)
        : currentMonthClients > 0
          ? 100
          : 0;

    return {
      success: true,
      data: {
        revenueChart,
        flowByPeriod: {
          today: flowToday,
          week: flowWeek,
          month: flowMonth,
        },
        topServices,
        stats: { totalClients, growth },
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar métricas del dashboard" };
  }
}
