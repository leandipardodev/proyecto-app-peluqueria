import { redirectLegacyDashboardRoute } from "@/lib/dashboard/canonical-dashboard-route";

export const dynamic = "force-dynamic";

export default async function VouchersLegacyRedirectPage() {
  await redirectLegacyDashboardRoute("/fidelizacion");
  return null;
}
