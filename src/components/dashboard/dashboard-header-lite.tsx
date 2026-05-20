export default function DashboardHeaderLite() {
  return (
    <header className="h-16 sm:h-20 border-b border-white/15 dark:border-white/10 bg-white/20 dark:bg-black/20 backdrop-blur-xl px-4 sm:px-6 lg:px-8 flex items-center justify-between">
      <div className="h-6 w-36 rounded-full bg-white/40 dark:bg-white/10 animate-pulse" />
      <div className="hidden sm:block h-9 w-64 rounded-2xl bg-white/40 dark:bg-white/10 animate-pulse" />
      <div className="h-9 w-9 rounded-full bg-white/40 dark:bg-white/10 animate-pulse" />
    </header>
  );
}
