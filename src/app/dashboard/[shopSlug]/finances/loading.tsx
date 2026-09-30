import { PageTitleSkeleton } from "@/components/ui/page-title";

const BAR = "bg-white/20 dark:bg-white/10 rounded-full";

export default function ShopFinancesLoading() {
  return (
    <div data-dashboard-skeleton className="space-y-5 animate-pulse">
      <div className="flex items-center gap-3">
        <PageTitleSkeleton />
        <div className={`h-5 w-16 ${BAR}`} />
      </div>
      {/* Los botones reales son text-xs con px-2.5 py-1.5: 28px, no 32. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={`h-7 w-14 ${BAR}`} />
        <div className={`h-7 w-16 ${BAR}`} />
        <div className={`h-7 w-14 ${BAR}`} />
        <div className={`h-7 w-28 ${BAR}`} />
        <div className={`h-7 w-28 ${BAR}`} />
        <div className={`h-7 w-20 ${BAR}`} />
      </div>
      {/* La tarjeta real es rounded-3xl con p-4, no rounded-[2.5rem] con p-6. */}
      <div className="rounded-3xl bg-white/20 dark:bg-black/20 backdrop-blur-2xl border border-white/10 dark:border-white/5 p-4">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 text-center">
              <div className={`h-3 w-16 ${BAR} mx-auto`} />
              {/* text-sm sm:text-lg: 20px en movil, 28px desde sm. */}
              <div className="h-5 sm:h-7 w-24 mx-auto rounded-full bg-white/20 dark:bg-white/10" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-7 w-7 ${BAR}`} />
              <div>
                <div className={`h-4 w-36 ${BAR}`} />
                <div className={`mt-1 h-3 w-48 ${BAR}`} />
              </div>
            </div>
            {/* El grafico real mide h-32; el skeleton ponia h-20. */}
            <div className="h-32 bg-white/10 dark:bg-white/[0.03] rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
