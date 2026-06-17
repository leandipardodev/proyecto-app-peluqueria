import { fetchStockItems } from "@/lib/dashboard/inventory-actions";
import InventoryPageClient from "@/components/inventory/inventory-page-client";
import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth-server";
import { createServerClient } from "@/lib/supabase/server";
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

  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("shop_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("shop_id", shopId)
    .maybeSingle();
  const role = membership?.role ?? "staff";

  const result = await fetchStockItems(shopId);
  return <InventoryPageClient role={role} shopId={shopId} initialItems={result.success ? result.data ?? [] : []} />;
}
