import { fetchDailyFinanceSummary } from "@/lib/dashboard/finances-actions";
import FinancesClient from "./finances-client";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import HoverScale from "@/components/ui/hover-scale";

export const dynamic = "force-dynamic";

export default async function FinancesPage() {
  let summary: Awaited<ReturnType<typeof fetchDailyFinanceSummary>> | null = null;
  let error: string | null = null;

  try {
    summary = await fetchDailyFinanceSummary();
  } catch (e) {
    console.error("[FinancesPage] error:", e);
    error = e instanceof Error ? e.message : "Error al cargar finanzas";
  }

  const today = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white capitalize tracking-tight">{today}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Resumen de caja diaria</p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HoverScale>
          <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 flex items-center gap-4 transition-colors">
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/50">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Ingresos (completados)</p>
              <p className="text-xl font-bold tracking-tighter text-gray-900 dark:text-white">
                ${(summary?.totalIncome ?? 0).toFixed(2)}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">{summary?.appointmentsCount ?? 0} turnos</p>
            </div>
          </div>
        </HoverScale>

        <HoverScale>
          <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 flex items-center gap-4 transition-colors">
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Gastos</p>
              <p className="text-xl font-bold tracking-tighter text-gray-900 dark:text-white">
                ${(summary?.totalExpenses ?? 0).toFixed(2)}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">{summary?.expenses.length ?? 0} registros</p>
            </div>
          </div>
        </HoverScale>

        <HoverScale>
          <div className={`bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 flex items-center gap-4 transition-colors ${
            (summary?.netBalance ?? 0) >= 0 ? "border-green-300/60 dark:border-green-500/20" : "border-red-300/60 dark:border-red-500/20"
          }`}>
            <div className={`p-3 rounded-xl ${
              (summary?.netBalance ?? 0) >= 0 ? "bg-green-50 dark:bg-green-950/50" : "bg-red-50 dark:bg-red-950/50"
            }`}>
              <Wallet className={`w-5 h-5 ${
                (summary?.netBalance ?? 0) >= 0 ? "text-green-600" : "text-red-600"
              }`} />
            </div>
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Balance Neto</p>
              <p className={`text-xl font-bold tracking-tighter ${
                (summary?.netBalance ?? 0) >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
              }`}>
                ${(summary?.netBalance ?? 0).toFixed(2)}
              </p>
            </div>
          </div>
        </HoverScale>
      </div>

      <FinancesClient initialExpenses={summary?.expenses ?? []} />
    </div>
  );
}
