"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

type ClientPoint = { month: string; clients: number; growthPct: number | null };
type RevenuePoint = { month: string; income: number };
type HealthBreakdown = { revenue: number; clients: number; appointments: number };

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-AR", { month: "short" });
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

const healthLabel = (score: number) => {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Bueno";
  if (score >= 40) return "Estable";
  if (score >= 20) return "Atención";
  return "Crítico";
};

const healthColor = (score: number) => {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  if (score >= 20) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
};

export default function MonthlyGrowthCard({
  clientsData,
  revenueData,
  healthScore,
  healthBreakdown,
  totalClients,
}: {
  clientsData: ClientPoint[];
  revenueData: RevenuePoint[];
  healthScore: number | null;
  healthBreakdown: HealthBreakdown | null;
  totalClients: number;
}) {
  const latestClients = clientsData[clientsData.length - 1]?.clients ?? 0;
  const latestRevenue = revenueData[revenueData.length - 1]?.income ?? 0;

  const prevClients = clientsData.length >= 2 ? clientsData[clientsData.length - 2]?.clients ?? 0 : 0;

  const revenueGrowth = useMemo(() => {
    const sorted = [...revenueData].sort((a, b) => a.month.localeCompare(b.month));
    if (sorted.length < 2) return null;
    const last2 = sorted.slice(-2);
    const [prev, curr] = last2;
    if (!prev || prev.income <= 0) return null;
    return Math.round(((curr.income - prev.income) / prev.income) * 100);
  }, [revenueData]);

  const components = useMemo(() => {
    if (!healthBreakdown) return null;
    return [
      { label: "Dinero", value: healthBreakdown.revenue, weight: 40, color: "bg-blue-500" },
      { label: "Clientes", value: healthBreakdown.clients, weight: 30, color: "bg-violet-500" },
      { label: "Turnos", value: healthBreakdown.appointments, weight: 30, color: "bg-cyan-500" },
    ];
  }, [healthBreakdown]);

  return (
    <div className="rounded-xl rounded-bl-none border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      {healthScore !== null ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Rendimiento</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold tracking-tight ${healthColor(healthScore)}`}>
                  {healthScore}
                  <span className="text-sm font-normal text-zinc-400">/100</span>
                </span>
                <span className={`text-xs font-medium ${healthColor(healthScore)}`}>
                  {healthLabel(healthScore)}
                </span>
              </div>
            </div>
          </div>

          {components && (
            <div className="space-y-2.5">
              {components.map((c) => (
                <div key={c.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400">{c.label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {Math.min(c.value, 100)}%
                      </span>
                      <span className="text-zinc-400">({c.weight}%)</span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <motion.div
                      className={`h-full rounded-full ${c.color}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(c.value, 100)}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      style={{ opacity: 0.8 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800">
              <p className="text-[10px] font-semibold tracking-wider text-zinc-500 dark:text-zinc-400 uppercase">Base clientes</p>
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{totalClients}</p>
              {latestClients > 0 && (
                <p className="text-[10px] font-medium text-green-600">
                  +{latestClients} este mes
                </p>
              )}
            </div>
            <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800">
              <p className="text-[10px] font-semibold tracking-wider text-zinc-500 dark:text-zinc-400 uppercase">Ingresos</p>
              <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{formatMoney(latestRevenue).replace("ARS", "").trim()}</p>
              {revenueGrowth !== null && (
                <p className={`text-[10px] font-medium ${revenueGrowth >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {revenueGrowth >= 0 ? "+" : ""}{revenueGrowth}%
                </p>
              )}
            </div>
            <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800">
              <p className="text-[10px] font-semibold tracking-wider text-zinc-500 dark:text-zinc-400 uppercase">Score</p>
              <p className={`text-sm font-bold ${healthColor(healthScore)}`}>{healthScore}/100</p>
              <p className={`text-[10px] font-medium ${healthColor(healthScore)}`}>{healthLabel(healthScore)}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-[220px] items-center justify-center text-sm text-zinc-500">
          Sin datos suficientes aun
        </div>
      )}
    </div>
  );
}
