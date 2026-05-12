import { fetchBusinessData } from "@/lib/dashboard/business-actions";
import { fetchDashboardSummary, fetchDashboardMetrics } from "@/lib/dashboard/dashboard-summary";
import BusinessClient from "./business-client";

export const dynamic = "force-dynamic";

export default async function BusinessPage() {
  let data: any = null;
  let error: string | null = null;
  let summaryStats: {
    appointmentsCount: number;
    revenue: number;
    lowStockCount: number;
  } | null = null;
  let metricStats: {
    totalClients: number;
    growth: number;
    topServicesCount: number;
    income: number;
    expenses: number;
  } | null = null;

  const [result, summaryResult, metricsResult] = await Promise.all([
    fetchBusinessData(),
    fetchDashboardSummary(),
    fetchDashboardMetrics(),
  ]);

  if (result.success) {
    data = result.data ?? null;
  } else {
    error = result.error;
  }

  if (summaryResult.success && summaryResult.data) {
    summaryStats = {
      appointmentsCount: summaryResult.data.appointmentsCount,
      revenue: summaryResult.data.revenue,
      lowStockCount: summaryResult.data.lowStockCount,
    };
  }

  if (metricsResult.success && metricsResult.data) {
    const latestRevenue = metricsResult.data.revenueChart[metricsResult.data.revenueChart.length - 1];
    metricStats = {
      totalClients: metricsResult.data.stats.totalClients,
      growth: metricsResult.data.stats.growth,
      topServicesCount: metricsResult.data.topServices.length,
      income: latestRevenue?.income ?? 0,
      expenses: latestRevenue?.expenses ?? 0,
    };
  }

  return (
    <BusinessClient
      initialData={data}
      initialError={error}
      summaryStats={summaryStats}
      metricStats={metricStats}
    />
  );
}
