import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { getAuthSession } from "@/lib/dashboard/auth/server";
import { BILLING_LABELS } from "@/lib/billing/plans";
import { getBillingPrice } from "@/lib/admin/site-settings";
import BillingClient from "./billing-client";

export default async function BillingPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const { shopSlug } = await params;
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const admin = await createServiceRoleClient();

  const { data: shopBySlug } = await admin
    .from("shops")
    .select("id")
    .eq("slug", shopSlug)
    .maybeSingle();

  if (!shopBySlug) redirect(`/dashboard/${shopSlug}`);

  const { data: membership } = await admin
    .from("shop_memberships")
    .select("shop_id, role")
    .eq("user_id", session.user.id)
    .eq("shop_id", shopBySlug.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (!membership) redirect(`/dashboard/${shopSlug}`);

  const shopId = membership.shop_id;

  const [shopResult, eventsResult, subResult] = await Promise.all([
    admin.from("shops").select("nombre, plan_expiry, active").eq("id", shopId).maybeSingle(),
    admin
      .from("shop_billing_events")
      .select("id, event_type, payload, created_at")
      .eq("shop_id", shopId)
      .in("event_type", ["subscription_payment_applied", "subscription_checkout_created"])
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("shop_subscriptions")
      .select("id, status, next_charge_date, created_at")
      .eq("shop_id", shopId)
      .maybeSingle(),
  ]);

  const shop = shopResult.data;
  if (!shop) redirect(`/dashboard/${shopSlug}`);

  const monthlyPrice = await getBillingPrice();

  return (
    <BillingClient
      shopId={shopId}
      shopName={shop.nombre || ""}
      planExpiry={shop.plan_expiry}
      active={shop.active ?? false}
      subscription={subResult.data ? { status: subResult.data.status, nextChargeDate: subResult.data.next_charge_date } : null}
      events={(eventsResult.data || []).map((e) => ({
        id: e.id,
        type: e.event_type,
        amount: (e.payload as { amount?: number })?.amount ?? monthlyPrice,
        paymentId: (e.payload as { payment_id?: string | null })?.payment_id ?? null,
        createdAt: e.created_at,
      }))}
    />
  );
}
