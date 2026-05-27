import { fetchAdminAnalytics } from "@/lib/admin/analytics";
import { fetchGrowthMetrics } from "@/lib/analytics/growth-metrics";
import AdminDashboardTabs from "@/components/admin/admin-dashboard-tabs";

export const dynamic = "force-dynamic";

type AdminTab = "resumen" | "crecimiento" | "operacion" | "top";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tabRaw = resolvedSearchParams?.tab;
  const initialTab: AdminTab =
    tabRaw === "crecimiento" || tabRaw === "operacion" || tabRaw === "top" ? tabRaw : "resumen";

  const [analytics, growth] = await Promise.all([fetchAdminAnalytics(), fetchGrowthMetrics(90)]);

  return <AdminDashboardTabs analytics={analytics} growth={growth} initialTab={initialTab} />;
}
