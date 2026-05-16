import { createServerClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";
import DashboardHeader from "@/components/dashboard/dashboard-header";
import DashboardPageTransition from "@/components/dashboard/dashboard-page-transition";
import ReleaseNotesModal from "@/components/dashboard/release-notes-modal";
import { getTenantAndUser } from "@/lib/dashboard/get-tenant-and-user";
import { logout } from "@/lib/dashboard/logout-action";
import { getArgentinaNow } from "@/lib/argentina-time";
import { createServiceRoleClient, getShopId } from "@/lib/dashboard/auth-server";
import { APPOINTMENT_STATUS_NEEDS_CONFIRMATION } from "@/lib/dashboard/appointment-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

async function getUserOrRedirect() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

async function getNotifications() {
  try {
    const supabase = await createServerClient();
    const authUser = (await supabase.auth.getUser()).data?.user;
    if (!authUser) return { urgentAppointments: false, lowStock: false };

    const shopId = await getShopId({ user: { id: authUser.id } });
    if (!shopId) return { urgentAppointments: false, lowStock: false };

    const admin = await createServiceRoleClient();

    const nowAr = getArgentinaNow();
    const oneHourFromNow = new Date(nowAr.getTime() + 60 * 60 * 1000).toISOString();

    const [urgentRes, stockRes] = await Promise.all([
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .in("status", APPOINTMENT_STATUS_NEEDS_CONFIRMATION as unknown as string[])
        .gte("start_time", nowAr.toISOString())
        .lte("start_time", oneHourFromNow),
      admin
        .from("stock")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .lt("quantity", 5),
    ]);

    return {
      urgentAppointments: (urgentRes.count || 0) > 0,
      lowStock: (stockRes.count || 0) > 0,
    };
  } catch {
    return { urgentAppointments: false, lowStock: false };
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserOrRedirect();
  const { shopName, userName } = await getTenantAndUser();
  const notifications = await getNotifications();
  const requestHeaders = await headers();
  const activeShopSlug = requestHeaders.get("x-shop-slug") || null;
  const managedShops = await getManagedShops(user.id);

  return (
    <div className="flex h-[100dvh] bg-transparent transition-colors relative overflow-hidden">
      {/* Persistent background orbs — never re-render on page navigation */}
      <div className="fixed top-[-15%] left-[-8%] w-[600px] h-[600px] rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
      <div className="fixed bottom-[-15%] right-[-8%] w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className="fixed top-[40%] right-[-5%] w-[300px] h-[300px] rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      <div className="hidden lg:flex lg:w-64 lg:flex-shrink-0 overflow-hidden relative z-10">
        <DashboardSidebar userName={userName} onLogout={logout} notifications={notifications} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 min-h-0 relative z-10">
        <ReleaseNotesModal />
        <DashboardHeader
          shopName={shopName}
          userName={userName}
          userEmail={user.email ?? ""}
          onLogout={logout}
          activeShopSlug={activeShopSlug}
          managedShops={managedShops}
        />

        <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 sm:p-6 lg:p-8">
          <DashboardPageTransition>{children}</DashboardPageTransition>
        </main>
      </div>
    </div>
  );
}

async function getManagedShops(userId: string): Promise<Array<{ slug: string; nombre: string }>> {
  const admin = await createServiceRoleClient();
  const { data: memberships } = await admin
    .from("shop_memberships")
    .select("shop_id")
    .eq("user_id", userId)
    .eq("is_active", true);

  const shopIds = (memberships || []).map((m) => m.shop_id).filter(Boolean);
  if (shopIds.length === 0) return [];

  const { data: shops } = await admin
    .from("shops")
    .select("slug, nombre")
    .in("id", shopIds)
    .order("nombre", { ascending: true });

  return (shops || []).filter((s) => !!s.slug).map((s) => ({ slug: s.slug, nombre: s.nombre || "Local" }));
}
