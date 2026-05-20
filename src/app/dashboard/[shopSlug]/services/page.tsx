import { fetchServices } from "@/lib/dashboard/service-actions";
import ServicesList from "@/components/services/services-list";
import { getAuthSession, getShopIdBySlug } from "@/lib/dashboard/auth-server";
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

  return <ServicesList shopId={shopId} shopSlug={shopSlug} initialServices={services} />;
}
