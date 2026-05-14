import {
  fetchAppointments,
  fetchActiveServices,
  fetchStaffMembers,
  fetchAllAppointmentsForTable,
} from "@/lib/dashboard/appointment-actions";
import CalendarPageClient from "@/components/calendar/calendar-page-client";
import AppointmentsTable from "@/app/dashboard/appointments/appointments-table";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthSession, getShopIdBySlug } from "@/lib/dashboard/auth-server";
import { getArgentinaWeekStart } from "@/lib/argentina-time";
import { fetchBusinessHours } from "@/lib/dashboard/business-actions";
import { fetchWhatsappTemplate } from "@/lib/dashboard/whatsapp-actions";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CalendarByShopSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopSlug: string }>;
  searchParams?: { date?: string; appointmentId?: string };
}) {
  const session = await getAuthSession();
  if (!session) notFound();

  const { shopSlug } = await params;
  const shopId = await getShopIdBySlug(shopSlug, session.user.id);
  if (!shopId) notFound();

  const weekStart = getArgentinaWeekStart();
  const rangeStart = new Date(weekStart);
  rangeStart.setUTCDate(weekStart.getUTCDate() - 14);
  const rangeEnd = new Date(weekStart);
  rangeEnd.setUTCDate(weekStart.getUTCDate() + 35);
  rangeEnd.setUTCHours(23, 59, 59, 999);

  let appointments: any[] = [];
  let services: any[] = [];
  let staff: any[] = [];
  let customers: Awaited<ReturnType<typeof fetchCustomersByShop>> = [];
  let businessHours: any = null;
  let whatsappTemplate = DEFAULT_WHATSAPP_TEMPLATE;
  let shopName = "";
  let shopPhone: string | null = null;
  let shopAddress: string | null = null;
  let canManageBilling = false;
  let appointmentsForTable: any[] = [];
  let error: string | null = null;

  try {
    const results = await Promise.allSettled([
      fetchAppointments(rangeStart.toISOString(), rangeEnd.toISOString(), shopId),
      fetchActiveServices(shopId),
      fetchStaffMembers(shopId),
      fetchCustomersByShop(shopId),
      fetchBusinessHours(shopId),
      fetchWhatsappTemplate(shopId),
      fetchShopNameById(shopId),
      fetchShopPhoneById(shopId),
      fetchAllAppointmentsForTable(shopId),
      fetchShopAddressById(shopId),
      fetchCanManageBilling(shopId, session.user.id),
    ]);

    if (results[0].status === "fulfilled" && results[0].value.success) appointments = (results[0].value as any).data ?? [];
    else console.error("Error fetching appointments:", results[0].status === "fulfilled" ? (results[0].value as any).error : results[0].reason);

    if (results[1].status === "fulfilled" && results[1].value.success) services = (results[1].value as any).data ?? [];
    else console.error("Error fetching services:", results[1].status === "fulfilled" ? (results[1].value as any).error : results[1].reason);

    if (results[2].status === "fulfilled" && results[2].value.success) staff = (results[2].value as any).data ?? [];
    else console.error("Error fetching staff:", results[2].status === "fulfilled" ? (results[2].value as any).error : results[2].reason);

    if (results[3].status === "fulfilled") customers = results[3].value;
    else console.error("Error fetching customers:", results[3].reason);

    if (results[4].status === "fulfilled" && results[4].value.success) businessHours = (results[4].value as any).data ?? null;
    else console.error("Error fetching business hours:", results[4].status === "fulfilled" ? (results[4].value as any).error : results[4].reason);

    if (results[5].status === "fulfilled" && (results[5].value as any).success) whatsappTemplate = (results[5].value as any).data ?? DEFAULT_WHATSAPP_TEMPLATE;

    if (results[6].status === "fulfilled") shopName = results[6].value;
    if (results[7].status === "fulfilled") shopPhone = results[7].value;
    if (results[8].status === "fulfilled" && results[8].value.success) appointmentsForTable = results[8].value.data ?? [];
    if (results[9].status === "fulfilled") shopAddress = results[9].value;
    if (results[10].status === "fulfilled") canManageBilling = results[10].value;

    const hasError = results.some((r) => r.status === "rejected");
    if (hasError) {
      error = "Error al cargar algunos datos. Verifica la consola.";
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Error al cargar datos";
  }

  return (
    <div className="space-y-6">
      <CalendarPageClient
        shopId={shopId}
        initialAppointments={appointments}
        services={services}
        staff={staff}
        customers={customers}
        error={error}
        businessHours={businessHours ?? undefined}
        whatsappTemplate={whatsappTemplate}
        shopName={shopName}
        shopPhone={shopPhone}
        initialDateParam={searchParams?.date}
        initialAppointmentId={searchParams?.appointmentId}
      />

      <AppointmentsTable
        shopId={shopId}
        initialAppointments={appointmentsForTable}
        services={services}
        staff={staff}
        customers={customers}
        shopName={shopName || "Mi Peluquería"}
        shopAddress={shopAddress}
        whatsappTemplate={whatsappTemplate || null}
        canManageBilling={canManageBilling}
        error={null}
      />
    </div>
  );
}

async function fetchCustomersByShop(shopId: string) {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, nombre, email, telefono")
    .eq("shop_id", shopId)
    .order("nombre", { ascending: true })
    .returns<{ id: string; nombre: string | null; email: string | null; telefono: string | null }[]>();

  if (error) throw error;
  return data.map((c) => ({ id: c.id, nombre: c.nombre, email: c.email, telefono: c.telefono }));
}

async function fetchShopNameById(shopId: string): Promise<string> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("shops")
    .select("nombre")
    .eq("id", shopId)
    .single();
  return data?.nombre || "";
}

async function fetchShopPhoneById(shopId: string): Promise<string | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("shops")
    .select("phone")
    .eq("id", shopId)
    .single();
  return data?.phone || null;
}

async function fetchShopAddressById(shopId: string): Promise<string | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("shops")
    .select("address")
    .eq("id", shopId)
    .single();
  return data?.address || null;
}

async function fetchCanManageBilling(shopId: string, userId: string): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("shop_memberships")
    .select("role, is_active")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.is_active && data.role === "owner");
}
