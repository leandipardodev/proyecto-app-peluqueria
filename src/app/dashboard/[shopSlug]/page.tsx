import { DashboardHomeContent } from "@/app/dashboard/page";
import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopHomePage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const { shopSlug } = await params;
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");
  return await DashboardHomeContent(shopId, shopSlug);
}
