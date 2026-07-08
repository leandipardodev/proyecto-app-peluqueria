"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

type Props = {
  showStats: boolean;
  setShowStats: (v: boolean) => void;
  maskValue: (v: string) => string;
  incomeValue: number;
  expenseValue: number;
  incomePct: number;
  expensePct: number;
  netValue: number;
  metricStats: {
    totalClients: number;
    totalAppointments: number;
    growth: number | null;
    topServicesCount: number;
    busiestDay: { day: string; count: number } | null;
    busiestHour: { hour: string; count: number } | null;
  } | null;
  summaryStats: { lowStockCount: number } | null;
  customerPlural: string;
  servicePlural: string;
};

export default function BusinessStatsSection({
  showStats,
  setShowStats,
  maskValue,
  incomeValue,
  expenseValue,
  incomePct,
  expensePct,
  netValue,
  metricStats,
  summaryStats,
  customerPlural,
  servicePlural,
}: Props) {
  return (
    <section id="estadisticas" className="glass-sheen-card bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors">
      <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Estadísticas del Negocio</h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">Indicadores acumulados desde el inicio del local</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowStats(!showStats)}
            className="ui-btn-ghost inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
            aria-label={showStats ? "Ocultar estadísticas" : "Mostrar estadísticas"}
          >
            {showStats ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {showStats ? "Visible" : "Oculto"}
          </button>
          <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">Histórico</span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showStats && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="glass-sheen-stagger p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <div className="glass-sheen-card sm:col-span-2 lg:col-span-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                <span>Flujo financiero</span>
                <span>Ingresos vs Gastos</span>
              </div>
              <div className="group/flow space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-emerald-700 dark:text-emerald-300 font-medium">Ingresos</span>
                    <span className="text-zinc-600 dark:text-zinc-300">{maskValue(`$${incomeValue.toFixed(2)}`)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-emerald-100/55 dark:bg-emerald-900/20 overflow-hidden">
                    <div
                      className="h-full rounded-full flow-bar flow-bar-emerald opacity-70 group-hover/flow:opacity-95 transition-opacity duration-300"
                      style={{ width: `${incomePct}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-rose-700 dark:text-rose-300 font-medium">Gastos</span>
                    <span className="text-zinc-600 dark:text-zinc-300">{maskValue(`$${expenseValue.toFixed(2)}`)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-rose-100/55 dark:bg-rose-900/20 overflow-hidden">
                    <div
                      className="h-full rounded-full flow-bar flow-bar-rose opacity-70 group-hover/flow:opacity-95 transition-opacity duration-300"
                      style={{ width: `${expensePct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <StatCard label="Turnos totales" value={maskValue(String(metricStats?.totalAppointments ?? "-"))} bgClass="bg-sky-100 dark:bg-sky-900/30" barClass="bg-gradient-to-r from-sky-400 to-sky-300 dark:from-sky-500 dark:to-sky-400" barWidth="w-3/4" />
            <StatCard label="Ingresos totales" value={maskValue(`$${incomeValue.toFixed(2)}`)} bgClass="bg-emerald-100 dark:bg-emerald-900/30" barClass="bg-gradient-to-r from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-400" barWidth="w-4/5" />
            <StatCard label={customerPlural + " totales"} value={maskValue(String(metricStats?.totalClients ?? "-"))} bgClass="bg-indigo-100 dark:bg-indigo-900/30" barClass="bg-gradient-to-r from-indigo-400 to-indigo-300 dark:from-indigo-500 dark:to-indigo-400" barWidth="w-2/3" />
            <GrowthCard growth={metricStats?.growth ?? null} maskValue={maskValue} />
            <StatCard
              label="Día con más turnos"
              value={metricStats?.busiestDay ? maskValue(`${metricStats.busiestDay.day} (${metricStats.busiestDay.count})`) : "-"}
              bgClass="bg-orange-100 dark:bg-orange-900/30"
              barClass="bg-gradient-to-r from-orange-400 to-orange-300 dark:from-orange-500 dark:to-orange-400"
              barWidth="w-3/5"
            />
            <StatCard
              label="Horario con más turnos"
              value={metricStats?.busiestHour ? maskValue(`${metricStats.busiestHour.hour} (${metricStats.busiestHour.count})`) : "-"}
              bgClass="bg-teal-100 dark:bg-teal-900/30"
              barClass="bg-gradient-to-r from-teal-400 to-teal-300 dark:from-teal-500 dark:to-teal-400"
              barWidth="w-3/5"
            />
            <StatCard label="Alertas de stock" value={maskValue(String(summaryStats?.lowStockCount ?? "-"))} bgClass="bg-amber-100 dark:bg-amber-900/30" barClass="bg-gradient-to-r from-amber-400 to-amber-300 dark:from-amber-500 dark:to-amber-400" barWidth="w-1/2" />
            <StatCard label={servicePlural + " activos"} value={maskValue(String(metricStats?.topServicesCount ?? "-"))} bgClass="bg-cyan-100 dark:bg-cyan-900/30" barClass="bg-gradient-to-r from-cyan-400 to-cyan-300 dark:from-cyan-500 dark:to-cyan-400" barWidth="w-3/5" />

            <div className="glass-sheen-card h-full min-h-[118px] md:min-h-[124px] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-4 flex flex-col sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Balance neto histórico</p>
              <p className={`mt-1 text-2xl font-bold tracking-tight ${netValue >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                {maskValue(`${netValue >= 0 ? "+" : "-"}$${Math.abs(netValue).toFixed(2)}`)}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Ingresos acumulados menos gastos acumulados.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <style>{`
        .flow-bar {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .flow-bar::before {
          content: "";
          position: absolute;
          inset: -35%;
          border-radius: inherit;
          background:
            linear-gradient(112deg, transparent 24%, rgba(255,255,255,0.3) 50%, transparent 76%),
            linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.02) 52%, rgba(0,0,0,0.12) 100%);
          background-size: 220% 100%, 100% 100%;
          animation: flowBarSheen 5.6s cubic-bezier(0.28, 0.16, 0.2, 1) infinite;
          mix-blend-mode: screen;
          pointer-events: none;
        }
        .flow-bar::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0));
          opacity: 0.38;
          pointer-events: none;
        }
        .flow-bar-emerald {
          background: linear-gradient(90deg, rgba(52,211,153,0.7) 0%, rgba(16,185,129,0.82) 100%);
        }
        .flow-bar-rose {
          background: linear-gradient(90deg, rgba(251,146,160,0.7) 0%, rgba(244,114,182,0.8) 100%);
        }
        @keyframes flowBarSheen {
          0% { background-position: 170% 0, 0 0; }
          55% { background-position: 18% 0, 0 0; }
          100% { background-position: -90% 0, 0 0; }
        }
      `}</style>
    </section>
  );
}

function StatCard({ label, value, bgClass, barClass, barWidth }: { label: string; value: string; bgClass: string; barClass: string; barWidth: string }) {
  return (
    <div className="glass-sheen-card h-full min-h-[118px] md:min-h-[124px] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-4 flex flex-col">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{value}</p>
      <div className="mt-auto pt-3 h-1.5 rounded-full overflow-hidden">
        <div className={`h-full ${barWidth} ${barClass}`} />
      </div>
    </div>
  );
}

function GrowthCard({ growth, maskValue }: { growth: number | null; maskValue: (v: string) => string }) {
  return (
    <div className="glass-sheen-card h-full min-h-[118px] md:min-h-[124px] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-4 flex flex-col">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Crecimiento mensual</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${growth === null ? "text-zinc-600 dark:text-zinc-300" : growth >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
        {maskValue(growth === null ? "N/D" : `${growth >= 0 ? "+" : ""}${growth}%`)}
      </p>
      <div className="mt-auto pt-3 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div
          className={`h-full ${growth === null || growth >= 0 ? "bg-gradient-to-r from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-400" : "bg-gradient-to-r from-rose-400 to-rose-300 dark:from-rose-500 dark:to-rose-400"}`}
          style={{ width: `${growth === null ? 18 : Math.min(Math.max(Math.abs(growth), 10), 100)}%` }}
        />
      </div>
    </div>
  );
}
