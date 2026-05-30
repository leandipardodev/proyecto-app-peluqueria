export default function ShopFidelizacionLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[1.5rem] border border-white/10 dark:border-white/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2.5">
              <div className="h-8 w-8 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
                <div className="h-3 w-48 bg-white/20 dark:bg-white/10 rounded-full" />
              </div>
            </div>
            <div className="p-5 space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-white/20 dark:bg-white/10 rounded-full shrink-0" />
                  <div className="flex-1 h-4 bg-white/20 dark:bg-white/10 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[2rem] border border-white/10 dark:border-white/5 overflow-hidden">
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="h-9 w-9 bg-white/20 dark:bg-white/10 rounded-full" />
          <div className="flex-1 space-y-1">
            <div className="h-5 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
            <div className="h-3 w-56 bg-white/20 dark:bg-white/10 rounded-full" />
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="h-10 bg-white/10 dark:bg-white/[0.03] rounded-xl" />
          <div className="h-10 bg-white/10 dark:bg-white/[0.03] rounded-xl" />
          <div className="h-10 bg-white/10 dark:bg-white/[0.03] rounded-xl" />
        </div>
      </div>
    </div>
  );
}
