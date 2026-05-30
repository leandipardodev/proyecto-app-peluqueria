export default function ShopStaffLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div className="h-7 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="h-9 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
      </div>
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden">
        <div className="divide-y divide-white/10">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 sm:px-6 py-4">
              <div className="h-10 w-10 bg-white/20 dark:bg-white/10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
                <div className="h-3 w-48 bg-white/20 dark:bg-white/10 rounded-full" />
              </div>
              <div className="h-6 w-20 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="h-8 w-8 bg-white/20 dark:bg-white/10 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
