import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";
import DashboardHeaderLoader from "@/components/dashboard/dashboard-header-loader";
import DashboardPageTransition from "@/components/dashboard/dashboard-page-transition";
import ReleaseNotesModal from "@/components/dashboard/release-notes-modal";
import BugReportModal from "@/components/dashboard/bug-report-modal";
import { logout } from "@/lib/dashboard/logout-action";

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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserOrRedirect();
  const userName = user.email || "Usuario";

  return (
    <div className="flex h-[100dvh] bg-transparent transition-colors relative overflow-hidden">
      {/* Persistent background orbs — never re-render on page navigation */}
      <div className="fixed top-[-15%] left-[-8%] w-[600px] h-[600px] rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
      <div className="fixed bottom-[-15%] right-[-8%] w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className="fixed top-[40%] right-[-5%] w-[300px] h-[300px] rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      <div className="hidden lg:flex lg:w-64 lg:flex-shrink-0 overflow-hidden relative z-10">
        <DashboardSidebar userName={userName} onLogout={logout} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 min-h-0 relative z-10">
        <ReleaseNotesModal />
        <BugReportModal />
        <DashboardHeaderLoader userEmail={user.email ?? ""} onLogout={logout} />

        <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 sm:p-6 lg:p-8">
          <DashboardPageTransition>{children}</DashboardPageTransition>
        </main>
      </div>
    </div>
  );
}
