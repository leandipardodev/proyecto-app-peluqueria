import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { getAuthSession } from "@/lib/dashboard/auth-server";
import BillingClient from "./billing-client";

export default async function BillingPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const { shopSlug } = await params;
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const admin = await createServiceRoleClient();

  const { data: membership } = await admin
    .from("shop_memberships")
    .select("shop_id, role")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (!membership) redirect(`/dashboard/${shopSlug}`);

  const shopId = membership.shop_id;

  const [shopResult, eventsResult] = await Promise.all([
    admin.from("shops").select("nombre, plan_expiry, active").eq("id", shopId).maybeSingle(),
    admin
      .from("shop_billing_events")
      .select("id, event_type, payload, created_at")
      .eq("shop_id", shopId)
      .in("event_type", ["subscription_payment_applied", "subscription_checkout_created"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const shop = shopResult.data;
  if (!shop) redirect(`/dashboard/${shopSlug}`);

  return (
    <BillingClient
      shopName={shop.nombre || ""}
      planExpiry={shop.plan_expiry}
      active={shop.active ?? false}
      events={(eventsResult.data || []).map((e) => ({
        id: e.id,
        type: e.event_type,
        amount: (e.payload as any)?.amount ?? 500,
        paymentId: (e.payload as any)?.payment_id ?? null,
        createdAt: e.created_at,
      }))}
    />
  );
}
