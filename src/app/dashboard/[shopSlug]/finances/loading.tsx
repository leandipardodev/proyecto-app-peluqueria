export default function ShopFinancesLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-7 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="h-5 w-16 bg-white/20 dark:bg-white/10 rounded-full" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-8 w-14 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="h-8 w-14 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="h-8 w-40 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="h-8 w-40 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="h-8 w-20 bg-white/20 dark:bg-white/10 rounded-full" />
      </div>
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 p-6">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 text-center">
              <div className="h-3 w-16 bg-white/20 dark:bg-white/10 rounded-full mx-auto" />
              <div className="h-6 w-24 bg-white/20 dark:bg-white/10 rounded-full mx-auto" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 bg-white/20 dark:bg-white/10 rounded-full" />
              <div>
                <div className="h-4 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
                <div className="mt-1 h-3 w-48 bg-white/20 dark:bg-white/10 rounded-full" />
              </div>
            </div>
            <div className="h-20 bg-white/10 dark:bg-white/[0.03] rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
