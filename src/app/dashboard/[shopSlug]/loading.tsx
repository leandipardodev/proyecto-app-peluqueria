import { PageTitleSkeleton } from "@/components/ui/page-title";

const BAR = "bg-white/20 dark:bg-white/10 rounded-full";

export default function DashboardShopHomeLoading() {
  return (
    <div data-dashboard-skeleton className="space-y-6 animate-pulse">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          {/* El titulo real de Inicio es text-3xl sm:text-4xl con leading-tight:
              30/36px * 1.25 + el pt-2 = 46/53. */}
          <PageTitleSkeleton className="h-[46px] sm:h-[53px]" />
          {/* Los botones reales son w-10 h-10, no 36px. */}
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`w-10 h-10 ${BAR}`} />
            ))}
          </div>
          <div className={`h-5 w-48 ${BAR}`} />
        </div>
        {/* El nombre real del local es text-6xl xl:text-7xl: 60/72px. */}
        <div className="hidden lg:block">
          <div className={`h-[60px] xl:h-[72px] w-64 xl:w-80 ${BAR}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[124px] lg:min-h-[132px] bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-72 bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5" />
        <div className="lg:col-span-1 space-y-4">
          <div className="h-52 bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5" />
          <div className="h-52 bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5" />
        </div>
      </div>

      <div className="h-64 bg-white/20 dark:bg-white/5 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5" />
    </div>
  );
}
