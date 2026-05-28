import { fetchStockItems } from "@/lib/dashboard/inventory-actions";
import InventoryPageClient from "@/components/inventory/inventory-page-client";
import { getAuthSession, getShopIdBySlug } from "@/lib/dashboard/auth-server";
import { redirect } from "next/navigation";
import { getShopFeatures } from "@/lib/industry/features";

export const dynamic = "force-dynamic";

export default async function DashboardShopInventoryPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  const { shopSlug } = await params;
  const shopId = await getShopIdBySlug(shopSlug, session.user.id);
  if (!shopId) redirect("/dashboard");

  const features = await getShopFeatures(shopId);
  if (!features.inventory) {
    redirect(`/dashboard/${shopSlug}`);
  }

  const result = await fetchStockItems(shopId);
  return <InventoryPageClient shopId={shopId} initialItems={result.success ? result.data ?? [] : []} />;
}
