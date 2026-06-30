import { redirect } from "next/navigation";
import type { Metadata } from "next";
import dynamicImport from "next/dynamic";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";
import DashboardHeaderLoader from "@/components/dashboard/dashboard-header-loader";
import { logout } from "@/lib/dashboard/logout-action";
import { getCachedUser } from "@/lib/dashboard/auth-server";

const DashboardPageTransition = dynamicImport(() => import("@/components/dashboard/dashboard-page-transition"));
const PullToRefresh = dynamicImport(() => import("@/components/dashboard/pull-to-refresh"));
const ReleaseNotesModal = dynamicImport(() => import("@/components/dashboard/release-notes-modal"));
const BugReportModal = dynamicImport(() => import("@/components/dashboard/bug-report-modal"));
const HelpModal = dynamicImport(() => import("@/components/dashboard/help-modal"));

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedUser();
  if (!user) redirect("/login");
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
        <HelpModal />
        <DashboardHeaderLoader userEmail={user.email ?? ""} onLogout={logout} />

        <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 sm:p-6 lg:p-8">
          <PullToRefresh>
            <DashboardPageTransition>{children}</DashboardPageTransition>
          </PullToRefresh>
        </main>
      </div>
    </div>
  );
}
