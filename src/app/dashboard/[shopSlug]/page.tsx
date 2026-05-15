import { DashboardHomeContent } from "@/app/dashboard/page";
import { getAuthSession, getShopIdBySlug } from "@/lib/dashboard/auth-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopHomePage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  const { shopSlug } = await params;
  const shopId = await getShopIdBySlug(shopSlug, session.user.id);
  if (!shopId) redirect("/dashboard");
  return await DashboardHomeContent(shopId, shopSlug);
}
