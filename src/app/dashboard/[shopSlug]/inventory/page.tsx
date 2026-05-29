import { fetchStockItems } from "@/lib/dashboard/inventory-actions";
import InventoryPageClient from "@/components/inventory/inventory-page-client";
import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth-server";
import { redirect } from "next/navigation";
import { getShopFeatures } from "@/lib/industry/features";

export const dynamic = "force-dynamic";

export default async function DashboardShopInventoryPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");

  const features = await getShopFeatures(shopId);
  if (!features.inventory) {
    redirect(`/dashboard/${shopSlug}`);
  }

  const result = await fetchStockItems(shopId);
  return <InventoryPageClient shopId={shopId} initialItems={result.success ? result.data ?? [] : []} />;
}
