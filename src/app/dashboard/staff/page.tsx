import { redirectLegacyDashboardRoute } from "@/lib/dashboard/canonical-dashboard-route";

export const dynamic = "force-dynamic";

export default async function StaffLegacyRedirectPage() {
  await redirectLegacyDashboardRoute("/staff");
  return null;
}
