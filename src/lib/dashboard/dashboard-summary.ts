"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import "server-only";

export async function fetchDashboardSummary() {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStart = tomorrow.toISOString();

  const [appointmentsToday, revenueToday, lowStock] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, start_time, status")
      .eq("shop_id", shopId)
      .gte("start_time", todayStart)
      .lt("start_time", tomorrowStart)
      .order("start_time", { ascending: true })
      .returns<{ id: string; start_time: string; status: string }[]>(),

    supabase
      .from("appointments")
      .select("id, status, is_paid, services!appointments_service_id_fkey(price)")
      .eq("shop_id", shopId)
      .gte("start_time", todayStart)
      .lt("start_time", tomorrowStart)
      .eq("status", "completed")
      .eq("is_paid", true)
      .returns<
        {
          id: string;
          status: string;
          is_paid: boolean;
          services: { price: number } | null;
        }[]
      >(),

    supabase
      .from("stock")
      .select("id, name, quantity")
      .eq("shop_id", shopId)
      .lt("quantity", 5)
      .returns<
        {
          id: string;
          name: string;
          quantity: number;
        }[]
      >(),
  ]);

  const revenue = (revenueToday.data ?? []).reduce((sum, a) => {
    const svc = Array.isArray(a.services) ? a.services[0] : a.services;
    return sum + (svc?.price ?? 0);
  }, 0);

  const nextResult = await supabase
    .from("appointments")
    .select(
      `
      id,
      start_time,
      end_time,
      status,
      customers!appointments_customer_id_fkey(name),
      services!appointments_service_id_fkey(name)
      `
    )
    .eq("shop_id", shopId)
    .gte("start_time", todayStart)
    .lt("start_time", tomorrowStart)
    .not("status", "eq", "cancelled")
    .order("start_time", { ascending: true })
    .limit(5);

  console.log("[fetchDashboardSummary] nextAppointments error:", nextResult.error);
  console.log("[fetchDashboardSummary] nextAppointments data:", JSON.stringify(nextResult.data));

  const nextAppointments = (nextResult.data ?? []).map((a: Record<string, unknown>) => ({
    id: a.id as string,
    start_time: a.start_time as string,
    end_time: a.end_time as string,
    status: a.status as string,
    customers: Array.isArray(a.customers) ? (a.customers as { name: string }[])[0] ?? null : (a.customers as { name: string } | null),
    services: Array.isArray(a.services) ? (a.services as { name: string }[])[0] ?? null : (a.services as { name: string } | null),
  }));

  return {
    appointmentsCount: (appointmentsToday.data ?? []).length,
    revenue,
    lowStockCount: (lowStock.data ?? []).length,
    nextAppointments,
  };
}
