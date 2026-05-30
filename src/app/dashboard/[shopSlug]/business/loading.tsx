export default function ShopBusinessLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-48 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="mt-1 h-4 w-72 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="mt-3 flex gap-2">
          <div className="h-9 w-32 bg-white/20 dark:bg-white/10 rounded-full" />
          <div className="h-9 w-40 bg-white/20 dark:bg-white/10 rounded-full" />
          <div className="h-9 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5" />
        ))}
      </div>
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden p-5">
        <div className="space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-5 w-40 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="h-16 bg-white/10 dark:bg-white/[0.03] rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
