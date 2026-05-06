import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";
import DashboardHeader from "@/components/dashboard/dashboard-header";
import { getTenantAndUser } from "@/lib/dashboard/get-tenant-and-user";
import { logout } from "@/lib/dashboard/logout-action";

export const dynamic = "force-dynamic";

async function getSessionOrRedirect() {
  const supabase = await createServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionOrRedirect();
  const { shopName, userName } = await getTenantAndUser();

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="hidden lg:flex lg:w-64 lg:flex-shrink-0">
        <DashboardSidebar userName={userName} onLogout={logout} />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <DashboardHeader
          shopName={shopName}
          userName={userName}
          onLogout={logout}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
