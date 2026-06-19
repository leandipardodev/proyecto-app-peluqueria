import { fetchAppointments } from "@/lib/dashboard/appointment-queries";
import CalendarPageClient from "@/components/calendar/calendar-page-client";
import { createServerClient } from "@/lib/supabase/server";
import { getArgentinaWeekStart } from "@/lib/argentina-time";
import { fetchBusinessHours } from "@/lib/dashboard/business-actions";
import type { ActionResult } from "@/lib/types";

type AppointmentsData = Awaited<ReturnType<typeof fetchAppointments>> extends ActionResult<infer T> ? T : never;
type ServicesData = Array<{ id: string; name: string; price: number; duration_minutes: number }>;
type StaffData = Array<{ id: string; name: string | null; email: string | null; role: string; revenue: number; payModel: string; percentageRate: number; fixedAmount: number }>;
type BusinessHoursData = Awaited<ReturnType<typeof fetchBusinessHours>> extends ActionResult<infer T> ? T : never;

function isActionSuccess<T>(value: unknown): value is ActionResult<T> & { success: true; data?: T } {
  return typeof value === "object" && value !== null && "success" in value && (value as { success: boolean }).success === true;
}

export default async function CalendarSection({
  shopId,
  services,
  staff,
  customers,
  initialDateParam,
  initialAppointmentId,
  initialViewMode,
}: {
  shopId: string;
  services: ServicesData;
  staff: StaffData;
  customers: CustomersData;
  initialDateParam?: string;
  initialAppointmentId?: string;
  initialViewMode?: string;
}) {
  const weekStart = getArgentinaWeekStart();
  const rangeStart = new Date(weekStart);
  rangeStart.setUTCDate(weekStart.getUTCDate() - 7);
  const rangeEnd = new Date(weekStart);
  rangeEnd.setUTCDate(weekStart.getUTCDate() + 14);
  rangeEnd.setUTCHours(23, 59, 59, 999);

  let appointments: AppointmentsData = [];
  let businessHours: BusinessHoursData | null = null;
  let error: string | null = null;

  try {
    const [appointmentsResult, businessHoursResult] = await Promise.all([
      fetchAppointments(rangeStart.toISOString(), rangeEnd.toISOString(), shopId),
      fetchBusinessHours(shopId),
    ]);

    if (isActionSuccess<AppointmentsData>(appointmentsResult)) appointments = appointmentsResult.data ?? [];
    else error = "Error al cargar turnos";

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
      initialViewMode={initialViewMode}
    />
  );
}

export type CustomersData = Array<{ id: string; nombre: string | null; email: string | null; telefono: string | null }>;

export async function fetchCustomersByShop(shopId: string): Promise<CustomersData> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("customers")
      .select("id, nombre, email, telefono")
      .eq("shop_id", shopId)
      .order("nombre", { ascending: true })
      .returns<{ id: string; nombre: string | null; email: string | null; telefono: string | null }[]>();

    if (error) return [];
    return data.map((c) => ({ id: c.id, nombre: c.nombre, email: c.email, telefono: c.telefono }));
  } catch {
    return [];
  }
}
