import {
  fetchActiveServices,
  fetchStaffMembers,
  fetchAllAppointmentsForTable,
} from "@/lib/dashboard/appointment-actions";
import AppointmentsTable from "@/app/dashboard/appointments/appointments-table";
import { createServerClient } from "@/lib/supabase/server";
import { fetchWhatsappTemplate } from "@/lib/dashboard/whatsapp-actions";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import type { ActionResult } from "@/lib/types";

type ServicesData = Awaited<ReturnType<typeof fetchActiveServices>> extends ActionResult<infer T> ? T : never;
type StaffData = Awaited<ReturnType<typeof fetchStaffMembers>> extends ActionResult<infer T> ? T : never;
type AppointmentsTableData = Awaited<ReturnType<typeof fetchAllAppointmentsForTable>> extends ActionResult<infer T> ? T : never;

function isActionSuccess<T>(value: unknown): value is ActionResult<T> & { success: true; data?: T } {
  return typeof value === "object" && value !== null && "success" in value && (value as { success: boolean }).success === true;
}

export default async function AppointmentsTableSection({ shopId }: { shopId: string }) {
  let appointmentsForTable: AppointmentsTableData = [];
  let services: ServicesData = [];
  let staff: StaffData = [];
  let customers: Awaited<ReturnType<typeof fetchCustomersByShop>> = [];
  let shopName = "";
  let shopAddress: string | null = null;
  let whatsappTemplate = DEFAULT_WHATSAPP_TEMPLATE;
  let error: string | null = null;

  try {
    const [appointmentsResult, servicesResult, staffResult, customersResult, whatsappTemplateResult, shopResult] = await Promise.all([
      fetchAllAppointmentsForTable(shopId, { upcomingOnly: true, limit: 10 }),
      fetchActiveServices(shopId),
      fetchStaffMembers(shopId),
      fetchCustomersByShop(shopId),
      fetchWhatsappTemplate(shopId),
      fetchShopData(shopId),
    ]);

    if (isActionSuccess<AppointmentsTableData>(appointmentsResult)) appointmentsForTable = appointmentsResult.data ?? [];
    if (isActionSuccess<ServicesData>(servicesResult)) services = servicesResult.data ?? [];
    if (isActionSuccess<StaffData>(staffResult)) staff = staffResult.data ?? [];
    customers = customersResult;
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

async function fetchShopData(shopId: string): Promise<{ name: string; address: string | null }> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("shops")
    .select("nombre, address")
    .eq("id", shopId)
    .single();
  return { name: data?.nombre || "", address: data?.address || null };
}
