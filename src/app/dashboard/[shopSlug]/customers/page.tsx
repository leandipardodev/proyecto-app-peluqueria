import { Suspense } from "react";
import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth/server";
import { redirect } from "next/navigation";
import DashboardCustomersPage from "@/app/dashboard/customers/customers-client";

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

  return (
    <Suspense fallback={<CustomersLoading />}>
      <DashboardCustomersPage shopId={shopId} shopSlug={shopSlug} />
    </Suspense>
  );
}
