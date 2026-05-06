import {
  fetchAppointments,
  fetchActiveServices,
  fetchStaffMembers,
} from "@/lib/dashboard/appointment-actions";
import CalendarPageClient from "@/components/calendar/calendar-page-client";
import { createClient } from "@supabase/supabase-js";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  let appointments: Awaited<ReturnType<typeof fetchAppointments>> = [];
  let services: Awaited<ReturnType<typeof fetchActiveServices>> = [];
  let staff: Awaited<ReturnType<typeof fetchStaffMembers>> = [];
  let customers: Awaited<ReturnType<typeof fetchCustomers>> = [];

  try {
    [appointments, services, staff, customers] = await Promise.all([
      fetchAppointments(startOfMonth, endOfMonth),
      fetchActiveServices(),
      fetchStaffMembers(),
      fetchCustomers(),
    ]);
  } catch {
    // Return empty arrays on error
  }

  return (
    <CalendarPageClient
      initialAppointments={appointments}
      services={services}
      staff={staff}
      customers={customers}
    />
  );
}

async function fetchCustomers() {
  const session = await getAuthSession();
  if (!session) return [];
  const shopId = await getShopId(session);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("customers")
    .select("id, name, email, phone")
    .eq("shop_id", shopId)
    .order("name", { ascending: true })
    .returns<{ id: string; name: string; email: string | null; phone: string | null }[]>();

  if (error) throw error;
  return data;
}
