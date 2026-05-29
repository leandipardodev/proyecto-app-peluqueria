export default function DashboardShopHomeLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="h-7 w-72 bg-white/20 dark:bg-white/10 rounded-full" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-9 h-9 bg-white/20 dark:bg-white/10 rounded-full" />
            ))}
            <div className="h-9 w-32 bg-white/20 dark:bg-white/10 rounded-full ml-2" />
          </div>
          <div className="h-4 w-48 bg-white/20 dark:bg-white/10 rounded-full" />
        </div>
        <div className="hidden lg:block h-10 w-64 bg-white/20 dark:bg-white/10 rounded-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[124px] lg:min-h-[132px] bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-72 bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5" />
        <div className="lg:col-span-1 space-y-4">
          <div className="h-52 bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5" />
          <div className="h-52 bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5" />
        </div>
      </div>

      <div className="h-64 bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5" />
    </div>
  );
}
