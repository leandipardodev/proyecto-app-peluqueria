import { Suspense } from "react";
import { fetchBusinessData, fetchBusinessHours } from "@/lib/dashboard/shop/business-actions";
import { fetchServices } from "@/lib/dashboard/services/service-actions";
import { fetchBookingTheme } from "@/lib/dashboard/shop/booking-theme-actions";
import { fetchVoucherWhatsappTemplate } from "@/lib/dashboard/vouchers/voucher-actions";
import BusinessClient from "@/app/dashboard/business/business-client";
import { createServerClient } from "@/lib/supabase/server";
import { getCachedUser, getCachedShopIdBySlug, createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function BusinessSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-8 w-40 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="h-4 w-64 bg-white/20 dark:bg-white/10 rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="h-24 bg-white/20 dark:bg-white/10 rounded-2xl" />
        <div className="h-24 bg-white/20 dark:bg-white/10 rounded-2xl" />
      </div>
      <div className="space-y-4">
        <div className="h-16 bg-white/20 dark:bg-white/10 rounded-[2rem]" />
        <div className="h-16 bg-white/20 dark:bg-white/10 rounded-[2rem]" />
        <div className="h-16 bg-white/20 dark:bg-white/10 rounded-[2rem]" />
        <div className="h-16 bg-white/20 dark:bg-white/10 rounded-[2rem]" />
      </div>
    </div>
  );
}

export default async function DashboardShopBusinessPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");

  return (
    <Suspense fallback={<BusinessSkeleton />}>
      <BusinessContent shopId={shopId} shopSlug={shopSlug} />
    </Suspense>
  );
}

async function BusinessContent({ shopId, shopSlug }: { shopId: string; shopSlug: string }) {
  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("shop_memberships")
    .select("role, is_active")
    .eq("user_id", (await getCachedUser())!.id)
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

  const [result, servicesResult, businessHoursResult, bookingThemeResult, voucherTemplateResult, staffResult] = await Promise.all([
    fetchBusinessData(shopId),
    fetchServices(shopId),
    fetchBusinessHours(shopId),
    fetchBookingTheme(shopId),
    fetchVoucherWhatsappTemplate(shopId),
    staffPromise,
  ]);

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
      summaryStats={null}
      metricStats={null}
      canManageBilling={canManageBilling}
      shopId={shopId}
      shopSlug={shopSlug}
      initialServices={servicesResult.success ? servicesResult.data ?? [] : []}
      initialBusinessHours={businessHoursResult.success ? businessHoursResult.data ?? null : null}
      initialBookingTheme={bookingThemeResult.success ? bookingThemeResult.data ?? null : null}
      initialVoucherWhatsappTemplate={voucherTemplateResult.success ? voucherTemplateResult.data ?? null : null}
      initialStaff={staffNames}
    />
  );
}
