"use client";

import { useEffect, useState } from "react";
import DashboardHeader from "@/components/dashboard/dashboard-header";
import DashboardHeaderLite from "@/components/dashboard/dashboard-header-lite";

type ManagedShop = { id: string; slug: string; nombre: string; active: boolean | null; plan_expiry: string | null };
type BillingStatus = { daysRemaining: number | null; graceDaysRemaining: number | null; isExpired: boolean; inGrace: boolean };

export default function DashboardHeaderLoader({
  userEmail,
  onLogout,
}: {
  userEmail: string;
  onLogout: () => Promise<void>;
}) {
  const [state, setState] = useState<{
    loading: boolean;
    shopName: string;
    userName: string;
    managedShops: ManagedShop[];
    billingStatus: BillingStatus;
  }>({
    loading: true,
    shopName: "Mi Negocio",
    userName: userEmail || "Usuario",
    managedShops: [],
    billingStatus: { daysRemaining: null, graceDaysRemaining: null, isExpired: false, inGrace: false },
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard/header-context", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as {
          shopName?: string;
          userName?: string;
          managedShops?: ManagedShop[];
          billingStatus?: BillingStatus;
        };
        if (!mounted) return;
        setState({
          loading: false,
          shopName: data.shopName || "Mi Negocio",
          userName: data.userName || userEmail || "Usuario",
          managedShops: data.managedShops || [],
          billingStatus: data.billingStatus || { daysRemaining: null, graceDaysRemaining: null, isExpired: false, inGrace: false },
        });
      } catch {
        if (!mounted) return;
        setState((prev) => ({ ...prev, loading: false }));
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [userEmail]);

  if (state.loading) return <DashboardHeaderLite />;

  return (
    <DashboardHeader
      shopName={state.shopName}
      userName={state.userName}
      userEmail={userEmail}
      onLogout={onLogout}
      activeShopSlug={null}
      managedShops={state.managedShops}
      billingStatus={state.billingStatus}
    />
  );
}
