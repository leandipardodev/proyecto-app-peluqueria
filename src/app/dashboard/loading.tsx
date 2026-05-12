export default function DashboardLoading() {
  const skeletonCard = (
    <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 transition-colors animate-pulse">
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-xl bg-white/20 dark:bg-black/20">
          <div className="w-5 h-5 rounded" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 bg-white/20 dark:bg-black/20 rounded-full" />
          <div className="h-5 w-16 bg-white/20 dark:bg-black/20 rounded-full" />
        </div>
      </div>
    </div>
  );

  const glassBlock = (
    <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 transition-colors animate-pulse">
      <div className="h-4 w-32 bg-white/20 dark:bg-black/20 rounded-full mb-2" />
      <div className="h-3 w-24 bg-white/20 dark:bg-black/20 rounded-full mb-6" />
      <div className="space-y-4">
        <div className="h-3 w-full bg-white/20 dark:bg-black/20 rounded-full" />
        <div className="h-3 w-4/5 bg-white/20 dark:bg-black/20 rounded-full" />
        <div className="h-3 w-3/5 bg-white/20 dark:bg-black/20 rounded-full" />
        <div className="h-3 w-5/5 bg-white/20 dark:bg-black/20 rounded-full" />
        <div className="h-3 w-2/5 bg-white/20 dark:bg-black/20 rounded-full" />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="animate-pulse space-y-2">
        <div className="h-7 w-64 bg-white/20 dark:bg-black/20 rounded-full" />
        <div className="h-4 w-40 bg-white/20 dark:bg-black/20 rounded-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>{skeletonCard}</div>
        ))}
      </div>

      <div className="h-20 bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 transition-colors animate-pulse" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">{glassBlock}</div>
        <div className="lg:col-span-1">{glassBlock}</div>
      </div>

      <div className="animate-pulse">{glassBlock}</div>
    </div>
  );
}
