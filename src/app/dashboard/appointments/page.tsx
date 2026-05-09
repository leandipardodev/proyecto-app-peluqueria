import { fetchAllAppointmentsForTable, fetchActiveServices, fetchStaffMembers } from "@/lib/dashboard/appointment-actions";
import AppointmentsTable from "./appointments-table";

export const dynamic = "force-dynamic";

async function fetchCustomers(shopId: string) {
  const { createServerClient: createSsrClient } = await import("@supabase/ssr");
  const admin = createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll() { return []; }, setAll() {} } }
  );

  const { data } = await admin
    .from("customers")
    .select("id, name, email, phone")
    .eq("shop_id", shopId)
    .order("name", { ascending: true });

  return (data || []).map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone }));
}

async function fetchShopName(shopId: string) {
  const { createServerClient } = await import("@/lib/supabase/server");
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("shops")
    .select("name")
    .eq("id", shopId)
    .single();
  return data?.name || "Mi Peluquería";
}

async function fetchWhatsappTemplate(shopId: string) {
  const { createServerClient: createSsrClient } = await import("@supabase/ssr");
  const admin = createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll() { return []; }, setAll() {} } }
  );
  const { data, error } = await admin
    .from("shops")
    .select("whatsapp_template")
    .eq("id", shopId)
    .single();
  if (error || !data?.whatsapp_template) return null;
  return data.whatsapp_template as string;
}

export default async function AppointmentsPage() {
  let appointments: Awaited<ReturnType<typeof fetchAllAppointmentsForTable>> = [];
  let services: Awaited<ReturnType<typeof fetchActiveServices>> = [];
  let staff: Awaited<ReturnType<typeof fetchStaffMembers>> = [];
  let customers: Awaited<ReturnType<typeof fetchCustomers>> = [];
  let shopName = "Mi Peluquería";
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
    ]);

    if (results[0].status === "fulfilled") appointments = results[0].value;
    else { console.error("[AppointmentsPage] appointments error:", results[0].reason); error = "Error al cargar turnos"; }

    if (results[1].status === "fulfilled") services = results[1].value;
    else console.error("[AppointmentsPage] services error:", results[1].reason);

    if (results[2].status === "fulfilled") staff = results[2].value;
    else console.error("[AppointmentsPage] staff error:", results[2].reason);

    if (results[3].status === "fulfilled") customers = results[3].value;
    else console.error("[AppointmentsPage] customers error:", results[3].reason);

    if (results[4].status === "fulfilled") shopName = results[4].value;
    else console.error("[AppointmentsPage] shopName error:", results[4].reason);

    if (results[5].status === "fulfilled") whatsappTemplate = results[5].value;
    else console.error("[AppointmentsPage] whatsappTemplate error:", results[5].reason);
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
      whatsappTemplate={whatsappTemplate}
      error={error}
    />
  );
}
