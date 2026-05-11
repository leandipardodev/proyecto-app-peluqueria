"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import { getArgentinaDateString, getArgentinaDayBounds } from "@/lib/argentina-time";
import "server-only";

export async function fetchDashboardSummary() {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

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
      .order("start_time", { ascending: true })
      .returns<{ id: string; start_time: string; status: string }[]>(),

    supabase
      .from("appointments")
      .select("id, status, is_paid, services!appointments_service_id_fkey(price)")
      .eq("shop_id", shopId)
      .gte("start_time", todayStartIso)
      .lte("start_time", todayEndIso)
      .in("status", ["scheduled", "confirmed", "completed"])
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
    .gte("start_time", todayStartIso)
    .lte("start_time", todayEndIso)
    .in("status", ["scheduled", "confirmed", "completed"])
    .order("start_time", { ascending: true })
    .limit(5);

  const nextAppointments = (nextResult.data ?? []).map((a: Record<string, unknown>) => ({
    id: a.id as string,
    start_time: a.start_time as string,
    end_time: a.end_time as string,
    status: a.status as string,
    customers: Array.isArray(a.customers) ? (a.customers as { name: string }[])[0] ?? null : (a.customers as { name: string } | null),
    services: Array.isArray(a.services) ? (a.services as { name: string }[])[0] ?? null : (a.services as { name: string } | null),
  }));

  const { data: shop } = await supabase
    .from("shops")
    .select("name, slug")
    .eq("id", shopId)
    .single();

  return {
    appointmentsCount: (appointmentsToday.data ?? []).length,
    revenue,
    lowStockCount: (lowStock.data ?? []).length,
    nextAppointments,
    shopName: shop?.name || "",
    shopSlug: shop?.slug || "",
  };
}
