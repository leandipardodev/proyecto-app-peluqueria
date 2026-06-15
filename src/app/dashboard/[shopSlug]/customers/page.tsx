import { Suspense } from "react";
import DashboardCustomersPage from "@/app/dashboard/customers/customers-client";
import ShopCustomersLoading from "./loading";

export const dynamic = "force-dynamic";

export default function DashboardShopCustomersPage() {
  return (
    <Suspense fallback={<ShopCustomersLoading />}>
      <DashboardCustomersPage />
    </Suspense>
  );
}
