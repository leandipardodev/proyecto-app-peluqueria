import { fetchServices } from "@/lib/dashboard/service-actions";
import ServicesList from "@/components/services/services-list";
import { getAuthSession, getShopIdBySlug } from "@/lib/dashboard/auth-server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopServicesPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const session = await getAuthSession();
  if (!session) notFound();
  const { shopSlug } = await params;
  const shopId = await getShopIdBySlug(shopSlug, session.user.id);
  if (!shopId) notFound();

  const result = await fetchServices(shopId);
  const services = result.success ? result.data ?? [] : [];

  return <ServicesList shopId={shopId} initialServices={services} />;
}
