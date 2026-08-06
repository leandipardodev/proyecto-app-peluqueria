export default function ShopStoreLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-7 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="h-9 w-44 bg-white/20 dark:bg-white/10 rounded-full" />
      </div>
      <div className="inline-flex gap-1 p-1 rounded-2xl bg-white/20 dark:bg-white/10">
        <div className="h-9 w-24 rounded-xl bg-white/20 dark:bg-white/10" />
        <div className="h-9 w-24 rounded-xl bg-white/20 dark:bg-white/10" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-2xl border border-white/10 dark:border-white/5 p-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/20 dark:bg-white/10" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-28 bg-white/20 dark:bg-white/10 rounded-full" />
                <div className="h-3 w-16 bg-white/20 dark:bg-white/10 rounded-full" />
                <div className="h-5 w-20 bg-white/20 dark:bg-white/10 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
