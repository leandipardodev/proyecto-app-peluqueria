import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth/server";
import { redirect } from "next/navigation";
import MyScheduleClient from "@/app/dashboard/my-schedule/my-schedule-client";

export const dynamic = "force-dynamic";

export default async function MySchedulePage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");

  return <MyScheduleClient shopId={shopId} shopSlug={shopSlug} />;
}
