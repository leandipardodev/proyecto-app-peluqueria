"use server";

import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { requireShopId } from "@/lib/dashboard/auth-server";
import { getArgentinaDateString, getArgentinaDayBounds } from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import "server-only";

type NextAppointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  customers: { name: string; phone: string | null } | null;
  services: { name: string } | null;
};

type DashboardSummary = {
  appointmentsCount: number;
  revenue: number;
  lowStockCount: number;
  nextAppointments: NextAppointment[];
  shopName: string;
  shopSlug: string;
};

export async function fetchDashboardSummary(): Promise<ActionResult<DashboardSummary>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const supabase = await createServerClient();

    const todayDateStr = getArgentinaDateString();
    const { start: todayStart, end: todayEnd } = getArgentinaDayBounds(todayDateStr);
    const todayStartIso = todayStart.toISOString();
    const todayEndIso = todayEnd.toISOString();

    const [appointmentsToday, revenueToday, lowStock] = await Promise.all([
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
        .select("id, status, is_paid, services!appointments_service_id_fkey(price)")
        .eq("shop_id", shopId)
        .gte("start_time", todayStartIso)
        .lte("start_time", todayEndIso)
        .in("status", ["scheduled", "confirmed", "completed"]),

      supabase
        .from("stock")
        .select("id, name, quantity")
        .eq("shop_id", shopId)
        .lt("quantity", 5),
    ]);

    if (appointmentsToday.error) return { success: false, error: appointmentsToday.error.message };
    if (revenueToday.error) return { success: false, error: revenueToday.error.message };
    if (lowStock.error) return { success: false, error: lowStock.error.message };

    const revenue = (revenueToday.data ?? []).reduce((sum, a) => {
      const svc = Array.isArray(a.services) ? a.services[0] : a.services;
      return sum + (svc?.price ?? 0);
    }, 0);

    const nextResult = await supabase
      .from("appointments")
      .select("id, start_time, end_time, status, customers!appointments_customer_id_fkey(name, phone), services!appointments_service_id_fkey(name)")
      .eq("shop_id", shopId)
      .gte("start_time", todayStartIso)
      .lte("start_time", todayEndIso)
      .in("status", ["scheduled", "confirmed", "completed"])
      .order("start_time", { ascending: true })
      .limit(5);

    if (nextResult.error) return { success: false, error: nextResult.error.message };

    const nextAppointments: NextAppointment[] = (nextResult.data ?? []).map((a: Record<string, unknown>) => ({
      id: a.id as string,
      start_time: a.start_time as string,
      end_time: a.end_time as string,
      status: a.status as string,
      customers: Array.isArray(a.customers) ? (a.customers as { name: string; phone: string | null }[])[0] ?? null : (a.customers as { name: string; phone: string | null } | null),
      services: Array.isArray(a.services) ? (a.services as { name: string }[])[0] ?? null : (a.services as { name: string } | null),
    }));

    const { data: shop } = await supabase
      .from("shops")
      .select("name, slug")
      .eq("id", shopId)
      .single();

    return {
      success: true,
      data: {
        appointmentsCount: (appointmentsToday.data ?? []).length,
        revenue,
        lowStockCount: (lowStock.data ?? []).length,
        nextAppointments,
        shopName: shop?.name || "",
        shopSlug: shop?.slug || "",
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar resumen" };
  }
}

function createAdminClient() {
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll() { return []; }, setAll() {} },
    }
  );
}

export type DashboardMetrics = {
  revenueChart: Array<{ month: string; income: number; expenses: number }>;
  topServices: Array<{ name: string; count: number }>;
  stats: { totalClients: number; growth: number };
};

export async function fetchDashboardMetrics(): Promise<ActionResult<DashboardMetrics>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = createAdminClient();

    const [apptsRes, financesRes, clientsRes] = await Promise.all([
      admin
        .from("appointments")
        .select("date_key_ar, service_id, services!appointments_service_id_fkey(price)")
        .eq("shop_id", shopId)
        .eq("status", "completed"),
      admin
        .from("finances")
        .select("amount, type, created_at")
        .eq("shop_id", shopId),
      admin
        .from("customers")
        .select("created_at")
        .eq("shop_id", shopId),
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

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
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
        topServices,
        stats: { totalClients, growth },
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar métricas del dashboard" };
  }
}
