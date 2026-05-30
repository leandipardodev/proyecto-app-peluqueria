import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { getAuthSession } from "@/lib/dashboard/auth-server";
import OnboardingClient from "./onboarding-client";

export default async function OnboardingWizardPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const admin = await createServiceRoleClient();
  const { data: memberships } = await admin
    .from("shop_memberships")
    .select("shop_id, role")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .limit(1);

  const shopId = memberships?.[0]?.shop_id;
  if (!shopId) redirect("/landing");
  const role = memberships[0]?.role;

  const { data: shop } = await admin
    .from("shops")
    .select("id, slug, nombre, description, address, phone, business_hours, mp_access_token")
    .eq("id", shopId)
    .maybeSingle();

  if (!shop) redirect("/landing");

  const hasBasicInfo = Boolean(shop.nombre?.trim() && shop.address?.trim() && shop.phone?.trim());

  const [{ count: servicesCount }, { count: staffCount }] = await Promise.all([
    admin.from("services").select("*", { count: "exact", head: true }).eq("shop_id", shopId),
    admin.from("shop_memberships").select("*", { count: "exact", head: true }).eq("shop_id", shopId).eq("role", "staff").eq("is_active", true),
  ]);

  if (hasBasicInfo && servicesCount && staffCount && shop.mp_access_token) {
    redirect(`/dashboard/${shop.slug}`);
  }

  return (
    <OnboardingClient
      shop={{ id: shop.id, slug: shop.slug, name: shop.nombre || "", address: shop.address || "", phone: shop.phone || "" }}
      hasServices={Boolean(servicesCount)}
      hasStaff={Boolean(staffCount)}
      isOwner={role === "owner"}
    />
  );
}
