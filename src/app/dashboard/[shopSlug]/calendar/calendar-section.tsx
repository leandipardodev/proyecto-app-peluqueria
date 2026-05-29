import {
  fetchAppointments,
  fetchActiveServices,
  fetchStaffMembers,
} from "@/lib/dashboard/appointment-actions";
import CalendarPageClient from "@/components/calendar/calendar-page-client";
import { createServerClient } from "@/lib/supabase/server";
import { getArgentinaWeekStart } from "@/lib/argentina-time";
import { fetchBusinessHours } from "@/lib/dashboard/business-actions";
import type { ActionResult } from "@/lib/types";

type AppointmentsData = Awaited<ReturnType<typeof fetchAppointments>> extends ActionResult<infer T> ? T : never;
type ServicesData = Awaited<ReturnType<typeof fetchActiveServices>> extends ActionResult<infer T> ? T : never;
type StaffData = Awaited<ReturnType<typeof fetchStaffMembers>> extends ActionResult<infer T> ? T : never;
type BusinessHoursData = Awaited<ReturnType<typeof fetchBusinessHours>> extends ActionResult<infer T> ? T : never;

function isActionSuccess<T>(value: unknown): value is ActionResult<T> & { success: true; data?: T } {
  return typeof value === "object" && value !== null && "success" in value && (value as { success: boolean }).success === true;
}

export default async function CalendarSection({
  shopId,
  initialDateParam,
  initialAppointmentId,
}: {
  shopId: string;
  initialDateParam?: string;
  initialAppointmentId?: string;
}) {
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
  let error: string | null = null;

  try {
    const [appointmentsResult, servicesResult, staffResult, customersResult, businessHoursResult] = await Promise.all([
      fetchAppointments(rangeStart.toISOString(), rangeEnd.toISOString(), shopId),
      fetchActiveServices(shopId),
      fetchStaffMembers(shopId),
      fetchCustomersByShop(shopId),
      fetchBusinessHours(shopId),
    ]);

    if (isActionSuccess<AppointmentsData>(appointmentsResult)) appointments = appointmentsResult.data ?? [];
    else error = "Error al cargar turnos";

    if (isActionSuccess<ServicesData>(servicesResult)) services = servicesResult.data ?? [];
    if (isActionSuccess<StaffData>(staffResult)) staff = staffResult.data ?? [];
    customers = customersResult;
    if (isActionSuccess<BusinessHoursData>(businessHoursResult)) businessHours = businessHoursResult.data ?? null;
  } catch {
    error = "Error al cargar datos del calendario";
  }

  return (
    <CalendarPageClient
      shopId={shopId}
      initialAppointments={appointments}
      services={services}
      staff={staff}
      customers={customers}
      error={error}
      businessHours={businessHours ?? undefined}
      initialDateParam={initialDateParam}
      initialAppointmentId={initialAppointmentId}
    />
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
