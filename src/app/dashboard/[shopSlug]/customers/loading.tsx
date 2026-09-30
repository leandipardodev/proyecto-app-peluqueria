import { PageTitleSkeleton } from "@/components/ui/page-title";

const BAR = "bg-white/20 dark:bg-white/10 rounded-full";

export default function ShopCustomersLoading() {
  return (
    <div data-dashboard-skeleton className="space-y-6 animate-pulse">
      <div>
        <PageTitleSkeleton />
        <div className={`mt-1 h-5 w-72 ${BAR}`} />
      </div>

      {/* El boton real es rounded-full px-6 py-2 text-sm: 36px, y es uno solo. */}
      <div className="flex gap-2">
        <div className={`h-9 w-40 ${BAR}`} />
      </div>

      {/* El input real es py-2 text-sm con borde: 36px de alto, no 40. */}
      <div className="relative max-w-md">
        <div className={`h-9 w-full ${BAR}`} />
      </div>

      {/* Paginacion: venia ausente del skeleton y aparecia al cargar. */}
      <div className="flex items-center justify-between gap-4">
        <div className={`h-4 w-24 ${BAR}`} />
        <div className="flex items-center gap-2">
          <div className={`h-8 w-20 rounded-lg ${BAR}`} />
          <div className={`h-4 w-12 ${BAR}`} />
          <div className={`h-8 w-20 rounded-lg ${BAR}`} />
        </div>
      </div>

      {/* Movil: tarjetas sueltas con space-y-3, no una lista con divide-y. */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`space-y-2 rounded-2xl p-4 ${BAR}`}>
            <div className={`h-4 w-2/5 ${BAR}`} />
            <div className={`h-3 w-1/3 ${BAR}`} />
          </div>
        ))}
      </div>

      {/* Escritorio: la tabla entera no estaba en el skeleton. */}
      <div className="hidden md:block overflow-hidden rounded-3xl bg-white/20 dark:bg-white/[0.06]">
        <div className={`flex items-center gap-6 border-b border-white/10 px-6 py-3 ${BAR}`} />
        <div className="divide-y divide-white/10">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 px-6 py-4">
              <div className={`h-4 w-40 ${BAR}`} />
              <div className={`h-4 w-52 ${BAR}`} />
              <div className={`h-4 w-32 ${BAR}`} />
              <div className={`h-4 w-24 ${BAR}`} />
              <div className={`h-4 flex-1 ${BAR}`} />
              <div className={`h-6 w-20 rounded-full ${BAR}`} />
              <div className={`h-4 w-16 ${BAR}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
