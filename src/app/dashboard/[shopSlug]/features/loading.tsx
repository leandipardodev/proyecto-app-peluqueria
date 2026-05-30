export default function ShopFeaturesLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-56 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="mt-1 h-4 w-72 bg-white/20 dark:bg-white/10 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 px-5 py-4">
            <div className="flex-1 space-y-1">
              <div className="h-4 w-32 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="h-3 w-56 bg-white/20 dark:bg-white/10 rounded-full" />
            </div>
            <div className="h-6 w-10 bg-white/20 dark:bg-white/10 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
