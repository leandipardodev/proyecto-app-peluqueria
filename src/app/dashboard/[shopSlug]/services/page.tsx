import { fetchServices } from "@/lib/dashboard/service-actions";
import { fetchCombos } from "@/lib/dashboard/combo-actions";
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

  const [servicesResult, combosResult] = await Promise.all([fetchServices(shopId), fetchCombos(shopId)]);
  const services = servicesResult.success ? servicesResult.data ?? [] : [];
  const combos = combosResult.success ? combosResult.data ?? [] : [];
  const supabase = await createServerClient();
  const { data: shop } = await supabase.from("shops").select("industry").eq("id", shopId).maybeSingle();
  const industry = resolveIndustry((shop as { industry?: string | null } | null)?.industry || null);

  return <ServicesList shopId={shopId} shopSlug={shopSlug} industry={industry} initialServices={services} initialCombos={combos} />;
}
