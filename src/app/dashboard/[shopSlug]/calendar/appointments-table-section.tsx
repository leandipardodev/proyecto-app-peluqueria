import { fetchAllAppointmentsForTable } from "@/lib/dashboard/appointment-actions";
import AppointmentsTable from "@/app/dashboard/appointments/appointments-table";
import { createServerClient } from "@/lib/supabase/server";
import { fetchWhatsappTemplate } from "@/lib/dashboard/whatsapp-actions";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import type { ActionResult } from "@/lib/types";
import type { CustomersData } from "./calendar-section";

type AppointmentsTableData = Awaited<ReturnType<typeof fetchAllAppointmentsForTable>> extends ActionResult<infer T> ? T : never;

export default async function AppointmentsTableSection({
  shopId,
  services,
  staff,
  customers,
}: {
  shopId: string;
  services: Array<{ id: string; name: string; price: number; duration_minutes: number }>;
  staff: Array<{ id: string; name: string | null; email: string | null; role: string; revenue: number; payModel: string; percentageRate: number; fixedAmount: number }>;
  customers: CustomersData;
}) {
  let appointmentsForTable: AppointmentsTableData = [];
  let shopName = "";
  let shopAddress: string | null = null;
  let whatsappTemplate = DEFAULT_WHATSAPP_TEMPLATE;
  let error: string | null = null;

  try {
    const [appointmentsResult, whatsappTemplateResult, shopResult] = await Promise.all([
      fetchAllAppointmentsForTable(shopId, { upcomingOnly: true, limit: 10 }),
      fetchWhatsappTemplate(shopId),
      fetchShopData(shopId),
    ]);

    if (isActionSuccess<AppointmentsTableData>(appointmentsResult)) appointmentsForTable = appointmentsResult.data ?? [];
    if (isActionSuccess<string>(whatsappTemplateResult)) whatsappTemplate = whatsappTemplateResult.data ?? DEFAULT_WHATSAPP_TEMPLATE;
    shopName = shopResult.name;
    shopAddress = shopResult.address;
  } catch {
    error = "Error al cargar datos de la tabla";
  }

  return (
    <AppointmentsTable
      shopId={shopId}
      initialAppointments={appointmentsForTable}
      services={services}
      staff={staff}
      customers={customers}
      shopName={shopName || "Mi Peluquería"}
      shopAddress={shopAddress}
      whatsappTemplate={whatsappTemplate || null}
      error={error}
    />
  );
}

function isActionSuccess<T>(value: unknown): value is ActionResult<T> & { success: true; data?: T } {
  return typeof value === "object" && value !== null && "success" in value && (value as { success: boolean }).success === true;
}

async function fetchShopData(shopId: string): Promise<{ name: string; address: string | null }> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("shops")
    .select("nombre, address")
    .eq("id", shopId)
    .single();
  return { name: data?.nombre || "", address: data?.address || null };
}
