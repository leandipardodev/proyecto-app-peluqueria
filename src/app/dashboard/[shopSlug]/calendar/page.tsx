import { Suspense } from "react";
import { getCachedUser, getCachedShopIdBySlug, getShopId } from "@/lib/dashboard/auth-server";
import { redirect } from "next/navigation";
import CalendarSection from "./calendar-section";
import AppointmentsTableSection from "./appointments-table-section";
import DashboardSectionLoading from "@/components/dashboard/dashboard-section-loading";

export const dynamic = "force-dynamic";

export default async function CalendarByShopSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopSlug: string }>;
  searchParams?: Promise<{ date?: string; appointmentId?: string }>;
}) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id) || (await getShopId({ user }));
  if (!shopId) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <Suspense fallback={<DashboardSectionLoading />}>
        <CalendarSection
          shopId={shopId}
          initialDateParam={resolvedSearchParams?.date}
          initialAppointmentId={resolvedSearchParams?.appointmentId}
        />
      </Suspense>

      <Suspense fallback={<DashboardSectionLoading />}>
        <AppointmentsTableSection shopId={shopId} />
      </Suspense>
    </div>
  );
}
