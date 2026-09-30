import { PageTitleSkeleton } from "@/components/ui/page-title";

export default function ShopInventoryLoading() {
  return (
    <div data-dashboard-skeleton className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <PageTitleSkeleton />
          {/* El subtitulo real es mt-2 text-xs: 16px de alto + 8px de margen. */}
          <div className="mt-2 h-4 w-56 bg-white/20 dark:bg-white/10 rounded-full" />
        </div>
        {/* El boton real es rounded-2xl (no un pill) y hay tres controles. */}
        <div className="flex items-center gap-2">
          <div className="h-9 w-32 bg-white/20 dark:bg-white/10 rounded-2xl" />
          <div className="h-9 w-24 bg-white/20 dark:bg-white/10 rounded-2xl" />
        </div>
      </div>

      {/* InventoryTabs: p-1.5 con botones text-xs -> 36px de alto. */}
      <div className="flex justify-center mb-6">
        <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-white/20 dark:bg-white/10">
          <div className="h-6 w-24 rounded-xl bg-white/20 dark:bg-white/10" />
          <div className="h-6 w-24 rounded-xl bg-white/20 dark:bg-white/10" />
        </div>
      </div>

      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden">
        <div className="divide-y divide-white/10">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 sm:px-6 py-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
                <div className="h-3 w-20 bg-white/20 dark:bg-white/10 rounded-full" />
              </div>
              <div className="h-4 w-12 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="h-4 w-16 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="h-8 w-8 bg-white/20 dark:bg-white/10 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
