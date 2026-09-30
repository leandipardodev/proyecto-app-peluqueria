import { Suspense } from "react";
import { getCachedUser, getCachedShopIdBySlug, getShopId, createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { fetchActiveServices, fetchStaffMembers } from "@/lib/dashboard/appointments/queries";
import { fetchStaffMembers as fetchStaffMembersFull } from "@/lib/dashboard/staff/staff-actions";
import CalendarSection, { fetchCustomersByShop, type CustomersData } from "./calendar-section";
import AppointmentsTableSection from "./appointments-table-section";
import CalendarSkeleton from "@/components/calendar/calendar-skeleton";
import type { ActionResult } from "@/lib/types";

export const dynamic = "force-dynamic";

type ServicesData = Awaited<ReturnType<typeof fetchActiveServices>> extends ActionResult<infer T> ? T : never;
type StaffData = Awaited<ReturnType<typeof fetchStaffMembersFull>> extends ActionResult<infer T> ? T : never;

function isActionSuccess<T>(value: unknown): value is ActionResult<T> & { success: true; data?: T } {
  return typeof value === "object" && value !== null && "success" in value && (value as { success: boolean }).success === true;
}

export default async function CalendarByShopSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopSlug: string }>;
  searchParams?: Promise<{ date?: string; appointmentId?: string; view?: string }>;
}) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id) || (await getShopId({ user }));
  if (!shopId) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarPageContent
          shopId={shopId}
          userId={user.id}
          initialDateParam={resolvedSearchParams?.date}
          initialAppointmentId={resolvedSearchParams?.appointmentId}
          initialViewMode={resolvedSearchParams?.view}
        />
      </Suspense>
    </div>
  );
}

async function CalendarPageContent({
  shopId,
  userId,
  initialDateParam,
  initialAppointmentId,
  initialViewMode,
}: {
  shopId: string;
  userId: string;
  initialDateParam?: string;
  initialAppointmentId?: string;
  initialViewMode?: string;
}) {
  const [servicesResult, staffResult, customers, shopFlag] = await Promise.all([
    fetchActiveServices(shopId),
    fetchStaffMembersFull(shopId),
    fetchCustomersByShop(shopId),
    (async () => {
      const admin = await createServiceRoleClient();
      const { data: shop } = await admin
        .from("shops")
        .select("auto_complete_enabled, assign_staff_later, industry")
        .eq("id", shopId)
        .maybeSingle();
      const supabase = await createServerClient();
      const { data: membership } = await supabase
        .from("shop_memberships")
        .select("role")
        .eq("user_id", userId)
        .eq("shop_id", shopId)
        .maybeSingle();
      return {
        autoCompleteEnabled: shop?.auto_complete_enabled ?? false,
        assignStaffLater: shop?.assign_staff_later ?? false,
        isOwner: membership?.role === "owner",
      };
    })(),
  ]);

  let services: ServicesData = [];
  let staff: StaffData = [];
  if (isActionSuccess<ServicesData>(servicesResult)) services = servicesResult.data ?? [];
  if (isActionSuccess<StaffData>(staffResult)) staff = staffResult.data ?? [];

  const [calendarEl, tableEl] = await Promise.all([
    CalendarSection({ shopId, services, staff, customers, initialDateParam, initialAppointmentId, initialViewMode, autoCompleteEnabled: shopFlag.autoCompleteEnabled, assignStaffLater: shopFlag.assignStaffLater, isOwner: shopFlag.isOwner }),
    AppointmentsTableSection({ shopId }),
  ]);
  return <>{calendarEl}{tableEl}</>;
}
