"use client";

import { useMemo, useState } from "react";

type ClientPoint = { month: string; clients: number; growthPct: number | null };
type RevenuePoint = { month: string; income: number };

type GrowthMode = "clients" | "revenue";

type DisplayPoint = {
  month: string;
  value: number;
  growthPct: number | null;
};

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-AR", { month: "short" });
}

function computeRevenueGrowth(data: RevenuePoint[]): DisplayPoint[] {
  const ordered = data
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);

  return ordered.map((point, index, arr) => {
    if (index === 0) return { month: point.month, value: point.income, growthPct: null };
    const prev = arr[index - 1].income;
    const growthPct = prev > 0 ? Math.round(((point.income - prev) / prev) * 100) : null;
    return { month: point.month, value: point.income, growthPct };
  });
}

export default function MonthlyGrowthCard({
  clientsData,
  revenueData,
}: {
  clientsData: ClientPoint[];
  revenueData: RevenuePoint[];
}) {
  const [mode, setMode] = useState<GrowthMode>("clients");

  const clientSeries = useMemo<DisplayPoint[]>(
    () => clientsData.slice(-6).map((item) => ({ month: item.month, value: item.clients, growthPct: item.growthPct })),
    [clientsData],
  );

  const revenueSeries = useMemo<DisplayPoint[]>(() => computeRevenueGrowth(revenueData), [revenueData]);

  const activeSeries = mode === "clients" ? clientSeries : revenueSeries;
  const latest = activeSeries[activeSeries.length - 1];
  const maxValue = Math.max(1, ...activeSeries.map((item) => item.value));
  const latestGrowth = latest?.growthPct ?? null;

  return (
    <div className="glass-sheen-card relative z-10 min-h-[290px] bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Crecimiento mensual</p>
          <p className="text-xl font-bold tracking-tighter text-gray-900 dark:text-white">
            {latestGrowth === null ? "N/D" : `${latestGrowth >= 0 ? "+" : ""}${latestGrowth}%`}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Comparado contra el mes anterior</p>
        </div>

        <div className="inline-flex rounded-full border border-white/40 bg-white/50 p-1 dark:border-white/10 dark:bg-black/30">
          <button
            type="button"
            onClick={() => setMode("clients")}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${mode === "clients" ? "bg-violet-600 text-white" : "text-zinc-600 hover:bg-white/70 dark:text-zinc-300 dark:hover:bg-white/10"}`}
          >
            Clientes
          </button>
          <button
            type="button"
            onClick={() => setMode("revenue")}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${mode === "revenue" ? "bg-violet-600 text-white" : "text-zinc-600 hover:bg-white/70 dark:text-zinc-300 dark:hover:bg-white/10"}`}
          >
            Dinero
          </button>
        </div>
      </div>

      {activeSeries.length === 0 ? (
        <div className="flex h-[190px] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">Sin datos mensuales aun</div>
      ) : (
        <div className="mt-4 flex h-[190px] items-end gap-2">
          {activeSeries.map((point) => {
            const barHeight = Math.max(14, Math.round((point.value / maxValue) * 100));
            const positive = (point.growthPct ?? 0) >= 0;
            return (
              <div key={`${mode}-${point.month}`} className="flex flex-1 flex-col items-center gap-2">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {point.growthPct === null ? "-" : `${point.growthPct >= 0 ? "+" : ""}${point.growthPct}%`}
                </div>
                <div className="relative flex w-full items-end justify-center rounded-xl bg-zinc-100/70 px-1 dark:bg-zinc-800/50" style={{ height: 120 }}>
                  <div
                    className={`w-full rounded-lg ${positive ? "bg-gradient-to-t from-emerald-500 to-emerald-300" : "bg-gradient-to-t from-rose-500 to-rose-300"}`}
                    style={{ height: `${barHeight}%` }}
                  />
                </div>
                <div className="text-[10px] font-medium uppercase text-zinc-500 dark:text-zinc-400">{formatMonth(point.month)}</div>
                <div className="text-[10px] text-zinc-600 dark:text-zinc-300">
                  {mode === "revenue" ? `$${Math.round(point.value).toLocaleString("es-AR")}` : point.value}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
