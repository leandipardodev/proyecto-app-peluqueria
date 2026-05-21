import { fetchBusinessData } from "@/lib/dashboard/business-actions";
import { fetchDashboardSummary, fetchDashboardMetrics } from "@/lib/dashboard/dashboard-summary";
import { fetchServices } from "@/lib/dashboard/service-actions";
import BusinessClient from "@/app/dashboard/business/business-client";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthSession, getShopIdBySlug } from "@/lib/dashboard/auth-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopBusinessPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  const { shopSlug } = await params;
  const shopId = await getShopIdBySlug(shopSlug, session.user.id);
  if (!shopId) redirect("/dashboard");

  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("shop_memberships")
    .select("role, is_active")
    .eq("user_id", session.user.id)
    .eq("shop_id", shopId)
    .maybeSingle();
  const canManageBilling = Boolean(membership?.is_active && membership.role === "owner");

  const [result, summaryResult, metricsResult, servicesResult] = await Promise.all([
    fetchBusinessData(shopId),
    fetchDashboardSummary(shopId),
    fetchDashboardMetrics(shopId),
    fetchServices(shopId),
  ]);

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
          topServicesCount: metricsResult.data.topServices.length,
          income: metricsResult.data.revenueChart.reduce((sum, point) => sum + point.income, 0),
          expenses: metricsResult.data.revenueChart.reduce((sum, point) => sum + point.expenses, 0),
        }
      : null;

  return (
    <BusinessClient
      initialData={result.success ? result.data ?? null : null}
      initialError={result.success ? null : result.error}
      summaryStats={summaryStats}
      metricStats={metricStats}
      canManageBilling={canManageBilling}
      shopSlug={shopSlug}
      initialServices={servicesResult.success ? servicesResult.data ?? [] : []}
    />
  );
}
