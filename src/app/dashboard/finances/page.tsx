import { fetchDailyFinanceSummary } from "@/lib/dashboard/finances-actions";
import FinancesClient from "./finances-client";
import { DollarSign, TrendingUp, TrendingDown, Wallet } from "lucide-react";

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 capitalize">{today}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Resumen de caja diaria</p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex items-center gap-4 transition-colors">
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950">
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Ingresos (completados)</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
              ${(summary?.totalIncome ?? 0).toFixed(2)}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{summary?.appointmentsCount ?? 0} turnos</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex items-center gap-4 transition-colors">
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950">
            <TrendingDown className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Gastos</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
              ${(summary?.totalExpenses ?? 0).toFixed(2)}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{summary?.expenses.length ?? 0} registros</p>
          </div>
        </div>

        <div className={`bg-white dark:bg-gray-900 rounded-xl border p-5 flex items-center gap-4 transition-colors ${
          (summary?.netBalance ?? 0) >= 0 ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800"
        }`}>
          <div className={`p-3 rounded-lg ${
            (summary?.netBalance ?? 0) >= 0 ? "bg-green-50" : "bg-red-50"
          }`}>
            <Wallet className={`w-5 h-5 ${
              (summary?.netBalance ?? 0) >= 0 ? "text-green-600" : "text-red-600"
            }`} />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Balance Neto</p>
            <p className={`text-xl font-bold ${
              (summary?.netBalance ?? 0) >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
            }`}>
              ${(summary?.netBalance ?? 0).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <FinancesClient initialExpenses={summary?.expenses ?? []} />
    </div>
  );
}
