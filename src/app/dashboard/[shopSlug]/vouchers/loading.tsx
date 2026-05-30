export default function ShopVouchersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-8 bg-white/20 dark:bg-white/10 rounded-full" />
          <div className="flex-1 space-y-1">
            <div className="h-5 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
            <div className="h-3 w-48 bg-white/20 dark:bg-white/10 rounded-full" />
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="flex items-center justify-between px-4 py-3 bg-white/10 dark:bg-white/[0.03] rounded-xl">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-white/20 dark:bg-white/10 rounded-full" />
                <div className="space-y-1">
                  <div className="h-4 w-28 bg-white/20 dark:bg-white/10 rounded-full" />
                  <div className="h-3 w-20 bg-white/20 dark:bg-white/10 rounded-full" />
                </div>
              </div>
              <div className="h-6 w-16 bg-white/20 dark:bg-white/10 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
