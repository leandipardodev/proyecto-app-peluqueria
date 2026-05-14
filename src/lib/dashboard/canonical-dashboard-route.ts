import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient, getAuthSession } from "@/lib/dashboard/auth-server";

export async function redirectLegacyDashboardRoute(segment: string = "", search?: URLSearchParams): Promise<void> {
  const requestHeaders = await headers();
  const activeSlug = requestHeaders.get("x-shop-slug");
  const query = search && Array.from(search.keys()).length > 0 ? `?${search.toString()}` : "";
  const normalizedSegment = segment ? (segment.startsWith("/") ? segment : `/${segment}`) : "";
  if (activeSlug) {
    redirect(`/dashboard/${activeSlug}${normalizedSegment}${query}`);
  }

  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }

  const admin = await createServiceRoleClient();
  const { data: memberships } = await admin
    .from("shop_memberships")
    .select("shop_id")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "staff"])
    .limit(1);

  const shopId = memberships?.[0]?.shop_id;
  if (!shopId) {
    redirect("/landing");
  }

  const { data: shop } = await admin
    .from("shops")
    .select("slug")
    .eq("id", shopId)
    .maybeSingle();

  if (!shop?.slug) {
    redirect("/landing");
  }

  redirect(`/dashboard/${shop.slug}${normalizedSegment}${query}`);
}
