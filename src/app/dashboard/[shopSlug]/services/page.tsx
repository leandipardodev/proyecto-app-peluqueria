import { fetchServices } from "@/lib/dashboard/service-actions";
import { fetchCombos } from "@/lib/dashboard/combo-actions";
import { fetchStaffMembers } from "@/lib/dashboard/staff-actions";
import ServicesList from "@/components/services/services-list";
import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth-server";
import { createServerClient } from "@/lib/supabase/server";
import { resolveIndustry } from "@/lib/industry/resolve";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopServicesPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");

  const supabase = await createServerClient();
  const [servicesResult, combosResult, staffResult] = await Promise.all([
    fetchServices(shopId),
    fetchCombos(shopId),
    fetchStaffMembers(shopId),
  ]);

  const services = servicesResult.success ? servicesResult.data ?? [] : [];
  const combos = combosResult.success ? combosResult.data ?? [] : [];
  const staffMembers = staffResult.success ? staffResult.data?.map((s) => ({ id: s.id, name: s.name })) ?? [] : [];

  const { data: serviceStaffRows } = await supabase
    .from("staff_services")
    .select("service_id, staff_id");

  const serviceStaffMap: Record<string, string[]> = {};
  if (serviceStaffRows) {
    for (const row of serviceStaffRows) {
      if (!serviceStaffMap[row.service_id]) serviceStaffMap[row.service_id] = [];
      serviceStaffMap[row.service_id].push(row.staff_id);
    }
  }

  const { data: shop } = await supabase.from("shops").select("industry").eq("id", shopId).maybeSingle();
  const industry = resolveIndustry((shop as { industry?: string | null } | null)?.industry || null);

  return (
    <ServicesList
      shopId={shopId}
      shopSlug={shopSlug}
      industry={industry}
      initialServices={services}
      initialCombos={combos}
      initialStaffMembers={staffMembers}
      initialServiceStaffMap={serviceStaffMap}
    />
  );
}
