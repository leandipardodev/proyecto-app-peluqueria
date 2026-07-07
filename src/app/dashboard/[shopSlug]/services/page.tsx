import { fetchServices, fetchServiceStaffMap } from "@/lib/dashboard/services/service-actions";
import { fetchCombos } from "@/lib/dashboard/services/combo-actions";
import { fetchStaffMembers } from "@/lib/dashboard/staff/staff-actions";
import ServicesList from "@/components/services/services-list";
import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth/server";
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
  const { data: membership } = await supabase
    .from("shop_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("shop_id", shopId)
    .maybeSingle();
  const role = membership?.role ?? "staff";

  const [servicesResult, combosResult, staffResult, staffMapResult] = await Promise.all([
    fetchServices(shopId),
    fetchCombos(shopId),
    fetchStaffMembers(shopId),
    fetchServiceStaffMap(shopId),
  ]);

  const services = servicesResult.success ? servicesResult.data ?? [] : [];
  const combos = combosResult.success ? combosResult.data ?? [] : [];
  const staffMembers = staffResult.success ? staffResult.data?.map((s) => ({ id: s.id, name: s.name })) ?? [] : [];
  const serviceStaffMap = staffMapResult.success ? staffMapResult.data ?? {} : {};

  const { data: shop } = await supabase.from("shops").select("industry").eq("id", shopId).maybeSingle();
  const industry = resolveIndustry((shop as { industry?: string | null } | null)?.industry || null);

  return (
    <ServicesList
      role={role}
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
