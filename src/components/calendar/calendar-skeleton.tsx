import { PageTitleSkeleton } from "@/components/ui/page-title";

const BAR = "bg-white/20 dark:bg-white/10 rounded-full";

/**
 * Skeleton unico del calendario. Estaba triplicado (loading.tsx, el
 * CombinedSkeleton de page.tsx y el CalendarSkeleton del cliente) y cada copia
 * se fue drifting de las otras: la del cliente no tenia ni la tabla de turnos de
 * abajo, y la de page.tsx metia un `space-y-4` de mas que el contenido real no
 * tiene. Con uno solo, el skeleton y la pagina miden lo mismo.
 *
 * `withTable` existe porque la tabla de turnos la arma el servidor como hermano
 * del calendario (page.tsx), no el cliente: cuando el cliente se hidrata todavia
 * la tabla real esta en pantalla, y pintar tambien su skeleton la duplicaba.
 */
export default function CalendarSkeleton({ withTable = true }: { withTable?: boolean }) {
  return (
    <div data-dashboard-skeleton className="space-y-6 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <PageTitleSkeleton className="lg:h-[68px]" />
        {/* Las pills reales son text-xs con px-2.5 py-1 dentro de un p-1.5:
            24px de alto, no 32. */}
        <div className="flex items-center gap-1 p-1.5 rounded-2xl border border-white/10 dark:border-white/5">
          <div className={`h-6 w-14 ${BAR}`} />
          <div className={`h-6 w-20 ${BAR}`} />
        </div>
      </div>

      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden p-4 sm:p-6">
        <div className="grid grid-cols-7 gap-px mb-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 py-3">
              <div className={`h-3 w-10 ${BAR}`} />
              <div className={`h-7 w-7 ${BAR}`} />
            </div>
          ))}
        </div>
        <div className="h-[500px] lg:h-[600px] bg-white/10 dark:bg-white/[0.03] rounded-2xl" />
      </div>

      {withTable && (
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-white/10">
            <div className={`h-5 w-44 ${BAR}`} />
          </div>
          <div className="divide-y divide-white/10">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 sm:px-6 py-4">
                <div className={`h-10 w-10 shrink-0 ${BAR}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-4 w-40 ${BAR}`} />
                  <div className={`h-3 w-24 ${BAR}`} />
                </div>
                <div className={`h-4 w-20 ${BAR}`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
