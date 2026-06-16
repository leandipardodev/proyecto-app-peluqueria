import { Suspense } from "react";
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

export default function DashboardShopCustomersPage() {
  return (
    <Suspense fallback={<CustomersLoading />}>
      <DashboardCustomersPage />
    </Suspense>
  );
}
