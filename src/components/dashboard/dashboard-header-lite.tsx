export default function DashboardHeaderLite() {
  return (
    <header className="dashboard-mobile-header sticky top-0 z-50 shrink-0 flex items-center gap-4 bg-white/30 dark:bg-black/30 backdrop-blur-xl shadow-sm border-b border-white/10 dark:border-white/5 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:px-6 lg:pt-2.5">
      <div className="min-[1367px]:hidden w-9 shrink-0" />
      <div className="flex items-center gap-2 shrink-0">
        <div className="h-7 w-32 sm:w-40 rounded-xl bg-white/40 dark:bg-white/10 animate-pulse" />
      </div>
      <div className="hidden md:flex items-center gap-3 flex-1">
        <div className="h-9 w-full max-w-md rounded-2xl bg-white/40 dark:bg-white/10 animate-pulse" />
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <div className="hidden sm:block h-9 w-64 rounded-2xl bg-white/40 dark:bg-white/10 animate-pulse" />
        <div className="h-9 w-9 rounded-full bg-white/40 dark:bg-white/10 animate-pulse" />
      </div>
    </header>
  );
}
