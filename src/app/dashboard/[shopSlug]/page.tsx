import { DashboardHomeContent } from "@/app/dashboard/page";
import { getAuthSession, getShopIdBySlug } from "@/lib/dashboard/auth-server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopHomePage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const session = await getAuthSession();
  if (!session) notFound();
  const { shopSlug } = await params;
  const shopId = await getShopIdBySlug(shopSlug, session.user.id);
  if (!shopId) notFound();
  return await DashboardHomeContent(shopId, shopSlug);
}
