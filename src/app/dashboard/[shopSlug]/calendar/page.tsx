import {
  fetchAppointments,
  fetchActiveServices,
  fetchStaffMembers,
  fetchAllAppointmentsForTable,
} from "@/lib/dashboard/appointment-actions";
import CalendarPageClient from "@/components/calendar/calendar-page-client";
import AppointmentsTable from "@/app/dashboard/appointments/appointments-table";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthSession, getShopId, getShopIdBySlug } from "@/lib/dashboard/auth-server";
import { getArgentinaWeekStart } from "@/lib/argentina-time";
import { fetchBusinessHours } from "@/lib/dashboard/business-actions";
import { fetchWhatsappTemplate } from "@/lib/dashboard/whatsapp-actions";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/types";

export const dynamic = "force-dynamic";

type AppointmentsData = Awaited<ReturnType<typeof fetchAppointments>> extends ActionResult<infer T> ? T : never;
type ServicesData = Awaited<ReturnType<typeof fetchActiveServices>> extends ActionResult<infer T> ? T : never;
type StaffData = Awaited<ReturnType<typeof fetchStaffMembers>> extends ActionResult<infer T> ? T : never;
type BusinessHoursData = Awaited<ReturnType<typeof fetchBusinessHours>> extends ActionResult<infer T> ? T : never;
type AppointmentsTableData = Awaited<ReturnType<typeof fetchAllAppointmentsForTable>> extends ActionResult<infer T> ? T : never;

function isActionSuccess<T>(value: unknown): value is ActionResult<T> & { success: true; data?: T } {
  return typeof value === "object" && value !== null && "success" in value && (value as { success: boolean }).success === true;
}

function isActionFailure(value: unknown): value is ActionResult<unknown> & { success: false; error: string } {
  return typeof value === "object" && value !== null && "success" in value && (value as { success: boolean }).success === false;
}

export default async function CalendarByShopSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopSlug: string }>;
  searchParams?: Promise<{ date?: string; appointmentId?: string }>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const { shopSlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const shopIdBySlug = await getShopIdBySlug(shopSlug, session.user.id);
  const shopId = shopIdBySlug || (await getShopId(session));
  if (!shopId) redirect("/dashboard");

  const weekStart = getArgentinaWeekStart();
  const rangeStart = new Date(weekStart);
  rangeStart.setUTCDate(weekStart.getUTCDate() - 14);
  const rangeEnd = new Date(weekStart);
  rangeEnd.setUTCDate(weekStart.getUTCDate() + 35);
  rangeEnd.setUTCHours(23, 59, 59, 999);

  let appointments: AppointmentsData = [];
  let services: ServicesData = [];
  let staff: StaffData = [];
  let customers: Awaited<ReturnType<typeof fetchCustomersByShop>> = [];
  let businessHours: BusinessHoursData | null = null;
  let whatsappTemplate = DEFAULT_WHATSAPP_TEMPLATE;
  let shopName = "";
  let shopAddress: string | null = null;
  let canManageBilling = false;
  let appointmentsForTable: AppointmentsTableData = [];
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
      fetchAllAppointmentsForTable(shopId, { upcomingOnly: true, limit: 10 }),
      fetchShopAddressById(shopId),
      fetchCanManageBilling(shopId, session.user.id),
    ]);

    if (results[0].status === "fulfilled" && isActionSuccess<AppointmentsData>(results[0].value)) appointments = results[0].value.data ?? [];
    else console.error("Error fetching appointments:", results[0].status === "rejected" ? results[0].reason : (isActionFailure(results[0].value) ? results[0].value.error : "Unknown error"));

    if (results[1].status === "fulfilled" && isActionSuccess<ServicesData>(results[1].value)) services = results[1].value.data ?? [];
    else console.error("Error fetching services:", results[1].status === "rejected" ? results[1].reason : (isActionFailure(results[1].value) ? results[1].value.error : "Unknown error"));

    if (results[2].status === "fulfilled" && isActionSuccess<StaffData>(results[2].value)) staff = results[2].value.data ?? [];
    else console.error("Error fetching staff:", results[2].status === "rejected" ? results[2].reason : (isActionFailure(results[2].value) ? results[2].value.error : "Unknown error"));

    if (results[3].status === "fulfilled") customers = results[3].value;
    else console.error("Error fetching customers:", results[3].reason);

    if (results[4].status === "fulfilled" && isActionSuccess<BusinessHoursData>(results[4].value)) businessHours = results[4].value.data ?? null;
    else console.error("Error fetching business hours:", results[4].status === "rejected" ? results[4].reason : (isActionFailure(results[4].value) ? results[4].value.error : "Unknown error"));

    if (results[5].status === "fulfilled" && isActionSuccess<string>(results[5].value)) whatsappTemplate = results[5].value.data ?? DEFAULT_WHATSAPP_TEMPLATE;

    if (results[6].status === "fulfilled") shopName = results[6].value;
    if (results[7].status === "fulfilled" && isActionSuccess<AppointmentsTableData>(results[7].value)) appointmentsForTable = results[7].value.data ?? [];
    if (results[8].status === "fulfilled") shopAddress = results[8].value;
    if (results[9].status === "fulfilled") canManageBilling = results[9].value;

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
        initialDateParam={resolvedSearchParams?.date}
        initialAppointmentId={resolvedSearchParams?.appointmentId}
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
