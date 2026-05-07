import {
  fetchAppointments,
  fetchActiveServices,
  fetchStaffMembers,
} from "@/lib/dashboard/appointment-actions";
import CalendarPageClient from "@/components/calendar/calendar-page-client";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const rangeStart = new Date(weekStart);
  rangeStart.setDate(weekStart.getDate() - 7);
  const rangeEnd = new Date(weekStart);
  rangeEnd.setDate(weekStart.getDate() + 14);
  rangeEnd.setHours(23, 59, 59, 999);

  let appointments: Awaited<ReturnType<typeof fetchAppointments>> = [];
  let services: Awaited<ReturnType<typeof fetchActiveServices>> = [];
  let staff: Awaited<ReturnType<typeof fetchStaffMembers>> = [];
  let customers: Awaited<ReturnType<typeof fetchCustomers>> = [];
  let error: string | null = null;

  try {
    const results = await Promise.allSettled([
      fetchAppointments(rangeStart.toISOString(), rangeEnd.toISOString()),
      fetchActiveServices(),
      fetchStaffMembers(),
      fetchCustomers(),
    ]);

    if (results[0].status === "fulfilled") appointments = results[0].value;
    else console.error("Error fetching appointments:", results[0].reason);

    if (results[1].status === "fulfilled") services = results[1].value;
    else console.error("Error fetching services:", results[1].reason);

    if (results[2].status === "fulfilled") staff = results[2].value;
    else console.error("Error fetching staff:", results[2].reason);

    if (results[3].status === "fulfilled") customers = results[3].value;
    else console.error("Error fetching customers:", results[3].reason);

    const hasError = results.some(r => r.status === "rejected");
    if (hasError) {
      error = "Error al cargar algunos datos. Verifica la consola.";
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Error al cargar datos";
  }

  return (
    <CalendarPageClient
      initialAppointments={appointments}
      services={services}
      staff={staff}
      customers={customers}
      error={error}
    />
  );
}

async function fetchCustomers() {
  const session = await getAuthSession();
  if (!session) return [];
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id, name, email, phone")
    .eq("shop_id", shopId)
    .in("role", ["customer"])
    .order("name", { ascending: true })
    .returns<{ user_id: string; name: string; email: string | null; phone: string | null }[]>();

  if (error) throw error;
  return data.map(c => ({ id: c.user_id, name: c.name, email: c.email, phone: c.phone }));
}
