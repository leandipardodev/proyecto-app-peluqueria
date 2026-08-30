import { fetchBusinessData, fetchBusinessHours } from "@/lib/dashboard/shop/business-actions";
import { fetchServices } from "@/lib/dashboard/services/service-actions";
import { fetchBookingTheme } from "@/lib/dashboard/shop/booking-theme-actions";
import { fetchVoucherWhatsappTemplate } from "@/lib/dashboard/vouchers/voucher-actions";
import BusinessClient from "@/app/dashboard/business/business-client";
import { createServerClient } from "@/lib/supabase/server";
import { getCachedUser, getCachedShopIdBySlug, createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { getShopFeatures } from "@/lib/industry/features";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopBusinessPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");

  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("shop_memberships")
    .select("role, is_active")
    .eq("user_id", user.id)
    .eq("shop_id", shopId)
    .maybeSingle();
  const role = membership?.role ?? "staff";
  const canManageBilling = Boolean(membership?.is_active && membership.role === "owner");

  const adminClient = await createServiceRoleClient();
  const staffPromise = adminClient
    .from("shop_memberships")
    .select("user_id, role")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .in("role", ["owner", "staff", "admin"]);

  const sellablePromise = adminClient
    .from("stock")
    .select("id")
    .eq("shop_id", shopId)
    .eq("for_sale", true);

  const [result, servicesResult, businessHoursResult, bookingThemeResult, voucherTemplateResult, staffResult, sellableResult, features] = await Promise.all([
    fetchBusinessData(shopId),
    fetchServices(shopId),
    fetchBusinessHours(shopId),
    fetchBookingTheme(shopId),
    fetchVoucherWhatsappTemplate(shopId),
    staffPromise,
    sellablePromise,
    getShopFeatures(shopId),
  ]);
  const storeProductCount = sellableResult.data?.length ?? 0;

  const memberIds = (staffResult.data || []).map((m) => m.user_id).filter(Boolean);
  const staffNames: { id: string; name: string }[] = [];
  if (memberIds.length > 0) {
    const { data: profiles } = await adminClient
      .from("user_profiles")
      .select("user_id, name")
      .in("user_id", memberIds);
    for (const p of profiles || []) {
      staffNames.push({ id: p.user_id, name: p.name || "Sin nombre" });
    }
  }

  return (
    <BusinessClient
      role={role}
      initialData={result.success ? result.data ?? null : null}
      initialError={result.success ? null : result.error}
      canManageBilling={canManageBilling}
      shopId={shopId}
      shopSlug={shopSlug}
      initialServices={servicesResult.success ? servicesResult.data ?? [] : []}
      initialBusinessHours={businessHoursResult.success ? businessHoursResult.data ?? null : null}
      initialBookingTheme={bookingThemeResult.success ? bookingThemeResult.data ?? null : null}
      initialVoucherWhatsappTemplate={voucherTemplateResult.success ? voucherTemplateResult.data ?? null : null}
      initialStaff={staffNames}
      userEmail={user.email}
      storeEnabled={features.store}
      storeProductCount={storeProductCount}
    />
  );
}
