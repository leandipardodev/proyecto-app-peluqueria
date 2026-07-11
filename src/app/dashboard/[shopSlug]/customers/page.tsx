import { Suspense } from "react";
import { getCachedUser, getCachedShopIdBySlug, createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { redirect } from "next/navigation";
import DashboardCustomersPage from "@/app/dashboard/customers/customers-client";
import { fetchCustomersPage } from "@/lib/dashboard/clients/customers-actions";

export const dynamic = "force-dynamic";

function CustomersLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 bg-slate-200 dark:bg-zinc-700 rounded-full animate-pulse" />
      <div className="h-5 w-64 bg-slate-200 dark:bg-zinc-700 rounded-full animate-pulse" />
      <div className="h-10 w-32 bg-slate-200 dark:bg-zinc-700 rounded-xl animate-pulse" />
      <div className="h-10 max-w-md bg-slate-200 dark:bg-zinc-700 rounded-full animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 bg-slate-200 dark:bg-zinc-700 rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default async function DashboardShopCustomersPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");

  const [initialCustomerData, { data: shopData }] = await Promise.all([
    fetchCustomersPage(shopId, { page: 1, pageSize: 50 }),
    (await createServiceRoleClient()).from("shops").select("loyalty_enabled, loyalty_cuts_required").eq("id", shopId).maybeSingle(),
  ]);

  const initialPage = initialCustomerData.success && initialCustomerData.data ? initialCustomerData.data.page : 1;
  const initialCustomers = initialCustomerData.success && initialCustomerData.data ? initialCustomerData.data.customers : [];
  const initialTotalPages = initialCustomerData.success && initialCustomerData.data ? initialCustomerData.data.totalPages : 1;
  const initialTotal = initialCustomerData.success && initialCustomerData.data ? initialCustomerData.data.total : 0;
  const initialError = initialCustomerData.success ? null : initialCustomerData.error;

  const initialLoyaltyEnabled = shopData?.loyalty_enabled !== false;
  const initialLoyaltyCutsRequired = Math.max(1, Number(shopData?.loyalty_cuts_required || 10));

  return (
    <Suspense fallback={<CustomersLoading />}>
      <DashboardCustomersPage
        shopId={shopId}
        shopSlug={shopSlug}
        initialCustomers={initialCustomers}
        initialPage={initialPage}
        initialTotalPages={initialTotalPages}
        initialTotal={initialTotal}
        initialError={initialError}
        initialLoyaltyEnabled={initialLoyaltyEnabled}
        initialLoyaltyCutsRequired={initialLoyaltyCutsRequired}
      />
    </Suspense>
  );
}
