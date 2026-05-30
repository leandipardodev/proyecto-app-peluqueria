export default function ShopCalendarLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
        <div className="flex items-center gap-3">
          <div className="h-5 w-24 bg-white/20 dark:bg-white/10 rounded-full" />
          <div className="h-8 w-40 bg-white/20 dark:bg-white/10 rounded-full" />
        </div>
      </div>

      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden p-4 sm:p-6">
        <div className="grid grid-cols-7 gap-px mb-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 py-3">
              <div className="h-3 w-10 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="h-7 w-7 bg-white/20 dark:bg-white/10 rounded-full" />
            </div>
          ))}
        </div>
        <div className="h-[500px] lg:h-[600px] bg-white/10 dark:bg-white/[0.03] rounded-2xl" />
      </div>

      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-white/10">
          <div className="h-5 w-44 bg-white/20 dark:bg-white/10 rounded-full" />
        </div>
        <div className="divide-y divide-white/10">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 sm:px-6 py-4">
              <div className="h-10 w-10 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-white/20 dark:bg-white/10 rounded-full" />
                <div className="h-3 w-24 bg-white/20 dark:bg-white/10 rounded-full" />
              </div>
              <div className="h-4 w-20 bg-white/20 dark:bg-white/10 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
