import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";
import DashboardHeader from "@/components/dashboard/dashboard-header";
import { getTenantAndUser } from "@/lib/dashboard/get-tenant-and-user";
import { logout } from "@/lib/dashboard/logout-action";
import { getTodayArgentinaBounds } from "@/lib/argentina-time";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";

export const dynamic = "force-dynamic";

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
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("shop_id")
      .eq("user_id", (await supabase.auth.getUser()).data?.user?.id || "")
      .single();

    if (!profile?.shop_id) return { urgentAppointments: false, lowStock: false };

    const admin = await createServiceRoleClient();

    const { start: dayStart } = getTodayArgentinaBounds();
    const tomorrow = new Date(dayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayEnd = tomorrow.toISOString();

    const oneHourFromNow = new Date(getTodayArgentinaBounds().start.getTime() + 60 * 60 * 1000).toISOString();

    const [urgentRes, stockRes] = await Promise.all([
      admin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", profile.shop_id)
        .eq("status", "scheduled")
        .gte("start_time", dayStart.toISOString())
        .lte("start_time", oneHourFromNow),
      admin
        .from("stock")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", profile.shop_id)
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

  return (
    <div className="flex h-screen bg-transparent transition-colors relative overflow-hidden">
      {/* Persistent background orbs — never re-render on page navigation */}
      <div className="fixed top-[-15%] left-[-8%] w-[600px] h-[600px] rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
      <div className="fixed bottom-[-15%] right-[-8%] w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className="fixed top-[40%] right-[-5%] w-[300px] h-[300px] rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      <div className="hidden lg:flex lg:w-64 lg:flex-shrink-0 overflow-hidden relative z-10">
        <DashboardSidebar userName={userName} onLogout={logout} notifications={notifications} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 relative z-10">
        <DashboardHeader
          shopName={shopName}
          userName={userName}
          onLogout={logout}
        />

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
