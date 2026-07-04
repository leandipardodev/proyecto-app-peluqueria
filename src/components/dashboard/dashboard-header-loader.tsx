"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const lastFetchedSlugRef = useRef<string | null>(null);
  const [state, setState] = useState<{
    loading: boolean;
    shopName: string;
    userName: string;
    managedShops: ManagedShop[];
    billingStatus: BillingStatus;
    lastPaymentDate: string | null;
  }>({
    loading: true,
    shopName: "Mi Negocio",
    userName: userEmail || "Usuario",
    managedShops: [],
    billingStatus: { daysRemaining: null, graceDaysRemaining: null, isExpired: false, inGrace: false },
    lastPaymentDate: null,
  });

  useEffect(() => {
    const slugMatch = pathname.match(/^\/dashboard\/([^\/]+)/);
    const currentSlug = slugMatch?.[1] || "";
    // Only re-fetch when the shop slug actually changes, not on every page navigation
    if (currentSlug === lastFetchedSlugRef.current && !state.loading) return;
    lastFetchedSlugRef.current = currentSlug;

    let mounted = true;
    const load = async () => {
      try {
        const url = `/api/dashboard/header-context${currentSlug ? `?shop_slug=${encodeURIComponent(currentSlug)}` : ""}`;
        const res = await fetch(url, {
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
          lastPaymentDate?: string | null;
        };
        if (!mounted) return;
        setState({
          loading: false,
          shopName: data.shopName || "Mi Negocio",
          userName: data.userName || userEmail || "Usuario",
          managedShops: data.managedShops || [],
          billingStatus: data.billingStatus || { daysRemaining: null, graceDaysRemaining: null, isExpired: false, inGrace: false },
          lastPaymentDate: data.lastPaymentDate ?? null,
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
  }, [userEmail, pathname]);

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
        lastPaymentDate={state.lastPaymentDate}
      />
  );
}