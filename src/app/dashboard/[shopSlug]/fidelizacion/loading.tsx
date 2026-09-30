import { PageTitleSkeleton } from "@/components/ui/page-title";

export default function ShopFidelizacionLoading() {
  return (
    <div data-dashboard-skeleton className="space-y-6 animate-pulse">
      {/* El titulo no estaba: la pagina crecia ~56px cuando entraba la data. */}
      <PageTitleSkeleton />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[1.5rem] border border-white/10 dark:border-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2.5">
            <div className="h-8 w-8 bg-white/20 dark:bg-white/10 rounded-full" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="h-3 w-48 bg-white/20 dark:bg-white/10 rounded-full" />
            </div>
          </div>
          <div className="p-5 space-y-3">
            {/* Count pill real: px-3 py-1.5 text-xs -> 28px. */}
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 dark:bg-white/10 px-3 py-1.5">
              <div className="h-3 w-20 rounded-full bg-white/20 dark:bg-white/10" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div
                  key={j}
                  className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2"
                >
                  <div className="h-4 w-32 bg-white/20 dark:bg-white/10 rounded-full" />
                  <div className="h-4 w-12 bg-white/20 dark:bg-white/10 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* La segunda tarjeta real es un parrafo mas un toggle, no una lista. */}
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[1.5rem] border border-white/10 dark:border-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2.5">
            <div className="h-8 w-8 bg-white/20 dark:bg-white/10 rounded-full" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-36 bg-white/20 dark:bg-white/10 rounded-full" />
              <div className="h-3 w-48 bg-white/20 dark:bg-white/10 rounded-full" />
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="h-4 w-full bg-white/20 dark:bg-white/10 rounded-full" />
            <div className="h-4 w-4/5 bg-white/20 dark:bg-white/10 rounded-full" />
            <div className="pt-1">
              <div className="inline-flex h-9 w-40 items-center justify-center rounded-full bg-white/20 dark:bg-white/10" />
            </div>
          </div>
        </div>
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
          {/* Antes eran 3 barras h-10 contra 6+ bloques reales, uno de ellos con
              un grid de 2 columnas: el bloque crecia al cargar. */}
          <div className="rounded-2xl border border-white/10 px-4 py-3 space-y-2">
            <div className="h-4 w-full bg-white/20 dark:bg-white/10 rounded-full" />
            <div className="h-4 w-3/4 bg-white/20 dark:bg-white/10 rounded-full" />
          </div>
          <div className="inline-flex h-9 w-44 items-center justify-center rounded-full bg-white/20 dark:bg-white/10" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="h-10 rounded-xl bg-white/10 dark:bg-white/[0.03]" />
            <div className="h-10 rounded-xl bg-white/10 dark:bg-white/[0.03]" />
          </div>
        </div>
      </div>
    </div>
  );
}
