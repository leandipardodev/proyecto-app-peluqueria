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

  const revenue = (revenueToday.data ?? []).reduce(
    (sum, a) => sum + (a.services?.price ?? 0),
    0
  );

  const nextAppointments = (
    await supabase
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
      .limit(5)
      .returns<
        {
          id: string;
          start_time: string;
          end_time: string;
          status: string;
          customers: { name: string } | null;
          services: { name: string } | null;
        }[]
      >()
  ).data ?? [];

  return {
    appointmentsCount: (appointmentsToday.data ?? []).length,
    revenue,
    lowStockCount: (lowStock.data ?? []).length,
    nextAppointments,
  };
}
