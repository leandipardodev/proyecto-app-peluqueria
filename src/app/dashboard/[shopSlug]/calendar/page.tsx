import { Suspense } from "react";
import { getCachedUser, getCachedShopIdBySlug, getShopId } from "@/lib/dashboard/auth-server";
import { redirect } from "next/navigation";
import { fetchActiveServices, fetchStaffMembers } from "@/lib/dashboard/appointment-queries";
import { fetchStaffMembers as fetchStaffMembersFull } from "@/lib/dashboard/staff-actions";
import CalendarSection, { fetchCustomersByShop, type CustomersData } from "./calendar-section";
import AppointmentsTableSection from "./appointments-table-section";
import type { ActionResult } from "@/lib/types";

export const dynamic = "force-dynamic";

type ServicesData = Awaited<ReturnType<typeof fetchActiveServices>> extends ActionResult<infer T> ? T : never;
type StaffData = Awaited<ReturnType<typeof fetchStaffMembersFull>> extends ActionResult<infer T> ? T : never;

function isActionSuccess<T>(value: unknown): value is ActionResult<T> & { success: true; data?: T } {
  return typeof value === "object" && value !== null && "success" in value && (value as { success: boolean }).success === true;
}

function CombinedSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-7 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
          <div className="flex items-center gap-3">
            <div className="h-5 w-24 bg-white/20 dark:bg-white/10 rounded-full" />
            <div className="h-8 w-40 bg-white/20 dark:bg-white/10 rounded-full" />
          </div>
        </div>
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden p-4 sm:p-6">
          <div className="grid grid-cols-7 gap-px mb-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2 py-3">
                <div className="h-3 w-10 bg-white/20 dark:bg-white/10 rounded-full" />
                <div className="h-7 w-7 bg-white/20 dark:bg-white/10 rounded-full" />
              </div>
            ))}
          </div>
          <div className="h-[500px] lg:h-[600px] bg-white/10 dark:bg-white/[0.03] rounded-2xl" />
        </div>
      </div>
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-white/10">
          <div className="h-5 w-44 bg-white/20 dark:bg-white/10 rounded-full" />
        </div>
        <div className="divide-y divide-white/10">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 sm:px-6 py-4">
              <div className="h-10 w-10 bg-white/20 dark:bg-white/10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-white/20 dark:bg-white/10 rounded-full" />
                <div className="h-3 w-24 bg-white/20 dark:bg-white/10 rounded-full" />
              </div>
              <div className="h-4 w-20 bg-white/20 dark:bg-white/10 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
      <Suspense fallback={<CombinedSkeleton />}>
        <CalendarPageContent
          shopId={shopId}
          initialDateParam={resolvedSearchParams?.date}
          initialAppointmentId={resolvedSearchParams?.appointmentId}
        />
      </Suspense>
    </div>
  );
}

async function CalendarPageContent({
  shopId,
  initialDateParam,
  initialAppointmentId,
}: {
  shopId: string;
  initialDateParam?: string;
  initialAppointmentId?: string;
}) {
  const [servicesResult, staffResult, customers] = await Promise.all([
    fetchActiveServices(shopId),
    fetchStaffMembersFull(shopId),
    fetchCustomersByShop(shopId),
  ]);

  let services: ServicesData = [];
  let staff: StaffData = [];
  if (isActionSuccess<ServicesData>(servicesResult)) services = servicesResult.data ?? [];
  if (isActionSuccess<StaffData>(staffResult)) staff = staffResult.data ?? [];

  const [calendarEl, tableEl] = await Promise.all([
    CalendarSection({ shopId, services, staff, customers, initialDateParam, initialAppointmentId }),
    AppointmentsTableSection({ shopId, services, staff, customers }),
  ]);
  return <>{calendarEl}{tableEl}</>;
}
