import { fetchBusinessData, fetchBusinessHours } from "@/lib/dashboard/business-actions";
import { fetchDashboardSummary, fetchDashboardMetrics } from "@/lib/dashboard/dashboard-summary";
import { fetchServices } from "@/lib/dashboard/service-actions";
import { fetchBookingTheme } from "@/lib/dashboard/booking-theme-actions";
import { fetchVoucherWhatsappTemplate } from "@/lib/dashboard/voucher-actions";
import BusinessClient from "@/app/dashboard/business/business-client";
import { createServerClient } from "@/lib/supabase/server";
import { getCachedUser, getCachedShopIdBySlug, createServiceRoleClient } from "@/lib/dashboard/auth-server";
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

  const [result, summaryResult, metricsResult, servicesResult, businessHoursResult, bookingThemeResult, voucherTemplateResult, staffResult] = await Promise.all([
    fetchBusinessData(shopId),
    fetchDashboardSummary(shopId),
    fetchDashboardMetrics(shopId),
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

  const summaryStats =
    summaryResult.success && summaryResult.data
      ? {
          appointmentsCount: summaryResult.data.appointmentsCount,
          revenue: summaryResult.data.revenue,
          lowStockCount: summaryResult.data.lowStockCount,
        }
      : null;

  const metricStats =
    metricsResult.success && metricsResult.data
      ? {
          totalClients: metricsResult.data.stats.totalClients,
          totalAppointments: metricsResult.data.stats.totalAppointments,
          growth: metricsResult.data.stats.growth,
          topServicesCount: servicesResult.success && servicesResult.data ? servicesResult.data.length : 0,
          income: metricsResult.data.revenueChart.reduce((sum, point) => sum + point.income, 0),
          expenses: metricsResult.data.revenueChart.reduce((sum, point) => sum + point.expenses, 0),
          busiestDay: metricsResult.data.busiestDay,
          busiestHour: metricsResult.data.busiestHour,
        }
      : null;

  return (
    <BusinessClient
      role={role}
      initialData={result.success ? result.data ?? null : null}
      initialError={result.success ? null : result.error}
      summaryStats={summaryStats}
      metricStats={metricStats}
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
