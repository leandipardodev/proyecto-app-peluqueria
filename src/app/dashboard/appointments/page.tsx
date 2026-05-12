import { fetchAllAppointmentsForTable, fetchActiveServices, fetchStaffMembers } from "@/lib/dashboard/appointment-actions";
import AppointmentsTable from "./appointments-table";

export const dynamic = "force-dynamic";

async function fetchCustomers(shopId: string) {
  const { createServiceRoleClient } = await import("@/lib/dashboard/auth-server");
  const admin = await createServiceRoleClient();

  const { data } = await admin
    .from("customers")
    .select("id, nombre, email, telefono")
    .eq("shop_id", shopId)
    .order("nombre", { ascending: true });

  return (data || []).map(c => ({ id: c.id, nombre: c.nombre, email: c.email, telefono: c.telefono }));
}

async function fetchShopName(shopId: string) {
  const { createServerClient } = await import("@/lib/supabase/server");
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("shops")
    .select("nombre")
    .eq("id", shopId)
    .single();
  return data?.nombre || "Mi Peluquería";
}

async function fetchShopAddress(shopId: string) {
  const { createServerClient } = await import("@/lib/supabase/server");
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("shops")
    .select("address")
    .eq("id", shopId)
    .single();
  return data?.address || null;
}

async function fetchWhatsappTemplate(shopId: string) {
  const { createServiceRoleClient } = await import("@/lib/dashboard/auth-server");
  const admin = await createServiceRoleClient();
  const { data, error } = await admin
    .from("shops")
    .select("whatsapp_template")
    .eq("id", shopId)
    .single();
  if (error || !data?.whatsapp_template) return null;
  return data.whatsapp_template as string;
}

export default async function AppointmentsPage() {
  let appointments: any[] = [];
  let services: any[] = [];
  let staff: any[] = [];
  let customers: Awaited<ReturnType<typeof fetchCustomers>> = [];
  let shopName = "Mi Peluquería";
  let shopAddress: string | null = null;
  let whatsappTemplate: string | null = null;
  let error: string | null = null;

  try {
    const { createServerClient } = await import("@/lib/supabase/server");
    const supabase = await createServerClient();
    const session = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("shop_id")
      .eq("user_id", session?.data?.user?.id || "")
      .single();

    const shopId = profile?.shop_id || "";

    const results = await Promise.allSettled([
      fetchAllAppointmentsForTable(),
      fetchActiveServices(),
      fetchStaffMembers(),
      fetchCustomers(shopId),
      fetchShopName(shopId),
      fetchWhatsappTemplate(shopId),
      fetchShopAddress(shopId),
    ]);

    if (results[0].status === "fulfilled" && (results[0].value as any).success) appointments = (results[0].value as any).data ?? [];
    else { console.error("[AppointmentsPage] appointments error:", results[0].status === "fulfilled" ? (results[0].value as any).error : results[0].reason); error = "Error al cargar turnos"; }

    if (results[1].status === "fulfilled" && (results[1].value as any).success) services = (results[1].value as any).data ?? [];
    else console.error("[AppointmentsPage] services error:", results[1].status === "fulfilled" ? (results[1].value as any).error : results[1].reason);

    if (results[2].status === "fulfilled" && (results[2].value as any).success) staff = (results[2].value as any).data ?? [];
    else console.error("[AppointmentsPage] staff error:", results[2].status === "fulfilled" ? (results[2].value as any).error : results[2].reason);

    if (results[3].status === "fulfilled") customers = results[3].value;
    else console.error("[AppointmentsPage] customers error:", results[3].reason);

    if (results[4].status === "fulfilled") shopName = results[4].value;
    else console.error("[AppointmentsPage] shopName error:", results[4].reason);

    if (results[5].status === "fulfilled") whatsappTemplate = results[5].value;
    else console.error("[AppointmentsPage] whatsappTemplate error:", results[5].reason);

    if (results[6].status === "fulfilled") shopAddress = results[6].value;
    else console.error("[AppointmentsPage] shopAddress error:", results[6].reason);
  } catch (e) {
    console.error("[AppointmentsPage] error:", e);
    error = e instanceof Error ? e.message : "Error al cargar datos";
  }

  return (
    <AppointmentsTable
      initialAppointments={appointments}
      services={services}
      staff={staff}
      customers={customers}
      shopName={shopName}
      shopAddress={shopAddress}
      whatsappTemplate={whatsappTemplate}
      error={error}
    />
  );
}
