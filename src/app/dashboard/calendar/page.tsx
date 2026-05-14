import { redirectLegacyDashboardRoute } from "@/lib/dashboard/canonical-dashboard-route";

export const dynamic = "force-dynamic";

export default async function CalendarLegacyRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; appointmentId?: string }>;
}) {
  const params = (await searchParams) || {};
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.appointmentId) query.set("appointmentId", params.appointmentId);
  await redirectLegacyDashboardRoute("/calendar", query);
  return null;
}
