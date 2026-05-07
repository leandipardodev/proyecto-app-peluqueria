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
  let error: string | null = null;

  try {
    const results = await Promise.allSettled([
      fetchAppointments(startOfMonth, endOfMonth),
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
    .from("customers")
    .select("id, name, email, phone")
    .eq("shop_id", shopId)
    .order("name", { ascending: true })
    .returns<{ id: string; name: string; email: string | null; phone: string | null }[]>();

  if (error) throw error;
  return data;
}
