import { fetchServices } from "@/lib/dashboard/service-actions";
import ServicesList from "@/components/services/services-list";
import { getAuthSession, getShopIdBySlug } from "@/lib/dashboard/auth-server";
import { createServerClient } from "@/lib/supabase/server";
import { resolveIndustry } from "@/lib/industry/resolve";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopServicesPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  const { shopSlug } = await params;
  const shopId = await getShopIdBySlug(shopSlug, session.user.id);
  if (!shopId) redirect("/dashboard");

  const result = await fetchServices(shopId);
  const services = result.success ? result.data ?? [] : [];
  const supabase = await createServerClient();
  const { data: shop } = await supabase.from("shops").select("industry").eq("id", shopId).maybeSingle();
  const industry = resolveIndustry((shop as { industry?: string | null } | null)?.industry || null);

  return <ServicesList shopId={shopId} shopSlug={shopSlug} industry={industry} initialServices={services} />;
}
