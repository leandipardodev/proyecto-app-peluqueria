"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, LabelList } from "recharts";
import { StatePanel } from "@/components/ui/state-panel";

type RevenueChartProps = {
  data: Array<{ month: string; income: number; expenses: number }>;
  dailyBreakdown: Array<{ dateKey: string; income: number; expenses: number }>;
  hourlyBreakdown: Array<{ hour: string; income: number; expenses: number }>;
  weeklyBreakdown: Array<{ weekKey: string; income: number; expenses: number }>;
  flowByPeriod?: {
    today: { income: number; expenses: number };
    week: { income: number; expenses: number };
    month: { income: number; expenses: number };
  };
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function formatMonthLabel(value: string): string {
  const [y, m] = value.split("-");
  return `${MONTH_LABELS[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

function formatDayLabel(value: string): string {
  const d = new Date(value + "T12:00:00-03:00");
  return DAY_LABELS[d.getUTCDay()];
}

function formatHourLabel(value: string): string {
  return `${value}:00`;
}

function formatWeekLabel(value: string): string {
  const d = new Date(value + "T12:00:00-03:00");
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

export default function RevenueChart({ data, dailyBreakdown, hourlyBreakdown, weeklyBreakdown, flowByPeriod }: RevenueChartProps) {
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const [canRenderChart, setCanRenderChart] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    income: number;
    expenses: number;
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = chartHostRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      const hasWidth = rect.width > 0;
      const isVisible = node.offsetParent !== null;
      setCanRenderChart(hasWidth && isVisible);
      if (hasWidth && isVisible) {
        setChartReady(true);
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const chartData = useMemo(() => {
    if (period === "today") return dailyBreakdown;
    if (period === "week") return weeklyBreakdown;
    return data;
  }, [period, data, dailyBreakdown, weeklyBreakdown]);

  const tickFormatter = useMemo(() => {
    if (period === "today") return formatDayLabel;
    if (period === "week") return formatWeekLabel;
    return formatMonthLabel;
  }, [period]);

  const hasData = chartData.length > 0 && chartData.some((d) => d.income > 0 || d.expenses > 0);

  const totals = useMemo(() => {
    const lastMonth = data[data.length - 1];
    const fallback = {
      today: { income: lastMonth?.income ?? 0, expenses: lastMonth?.expenses ?? 0 },
      week: { income: lastMonth?.income ?? 0, expenses: lastMonth?.expenses ?? 0 },
      month: { income: lastMonth?.income ?? 0, expenses: lastMonth?.expenses ?? 0 },
    };
    return {
      income: (flowByPeriod ?? fallback)[period].income,
      expenses: (flowByPeriod ?? fallback)[period].expenses,
    };
  }, [data, flowByPeriod, period]);

  const netResult = totals.income - totals.expenses;

  if (!hasData && period === "month" && data.length === 0) {
    return (
      <div className="flex flex-col h-full rounded-xl rounded-tr-none border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <StatePanel title="Sin datos de ingresos" description="Todavía no hay datos de ingresos para mostrar." />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full rounded-xl rounded-tr-none border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">Ingresos vs Gastos</h3>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">Resultado neto por periodo</p>
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
          {([
            ["today", "Hoy"],
            ["week", "Semana"],
            ["month", "Mes"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                period === key
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3 shrink-0">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800">
          <p className="text-[10px] font-semibold tracking-widest text-zinc-500 dark:text-zinc-400">INGRESOS</p>
          <p className="mt-0.5 text-2xl font-bold text-blue-600 dark:text-blue-400" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatMoney(totals.income).replace("ARS", "").trim()}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800">
          <p className="text-[10px] font-semibold tracking-widest text-zinc-500 dark:text-zinc-400">GASTOS</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-600 dark:text-slate-400" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatMoney(totals.expenses).replace("ARS", "").trim()}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800">
          <p className="text-[10px] font-semibold tracking-widest text-zinc-500 dark:text-zinc-400">RESULTADO</p>
          <p className={`mt-0.5 text-2xl font-bold ${netResult >= 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatMoney(Math.abs(netResult)).replace("ARS", "").trim()}
          </p>
          <p className="text-[11px] text-zinc-500">{netResult >= 0 ? "Superavit" : "Deficit"}</p>
        </div>
      </div>

      <div
        ref={chartHostRef}
        className="analytics-bg relative flex-1 min-h-0 min-w-0 w-full overflow-hidden rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800"
      >
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
          <div className="analytics-grid size-full" />
          <div className="analytics-scan size-full" />
        </div>
        {!chartReady && (
          <div className="absolute inset-3 rounded-xl bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        )}
        {canRenderChart && (
          <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={180}>
            <BarChart data={chartData as Array<Record<string, unknown>>} margin={{ top: 20, right: 4, left: -8, bottom: 0 }} barGap={2} barCategoryGap="8%">
              <XAxis
                dataKey={period === "today" ? "dateKey" : period === "week" ? "weekKey" : "month"}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                tick={{ fontSize: 11, fill: "#a1a1aa", fontWeight: 500, fontFamily: "Inter" }}
                tickFormatter={tickFormatter}
              />
              <YAxis hide />

              <Bar
                dataKey="income"
                fill="#3b82f6"
                radius={[2, 2, 0, 0]}
                barSize={10}
                isAnimationActive
                animationBegin={0}
                animationDuration={500}
                animationEasing="ease-out"
              >
                <LabelList
                  dataKey="income"
                  position="top"
                  formatter={(value) => formatMoney(Number(value)).replace("ARS", "").trim()}
                  style={{ fontSize: 10, fill: "#3b82f6", fontWeight: 600, fontFamily: "Inter" }}
                />
                {chartData.map((entry: Record<string, unknown>, index) => {
                  const key = `income-${index}`;
                  const isHovered = hoveredBar === key;
                  const hasHover = hoveredBar !== null;
                  const label = (entry.month || entry.weekKey || entry.dateKey || entry.hour) as string;
                  return (
                    <Cell
                      key={`${label}-income-${index}`}
                      onMouseEnter={(e) => {
                        setHoveredBar(key);
                        setTooltip({
                          x: e.clientX,
                          y: e.clientY,
                          label,
                          income: entry.income as number,
                          expenses: entry.expenses as number,
                        });
                      }}
                      onMouseMove={(e) => {
                        if (tooltipRef.current) {
                          tooltipRef.current.style.left = `${e.clientX + 12}px`;
                          tooltipRef.current.style.top = `${e.clientY - 10}px`;
                        }
                      }}
                      onMouseLeave={() => {
                        setHoveredBar(null);
                        setTooltip(null);
                      }}
                      fill={isHovered ? "#2563eb" : "#3b82f6"}
                      fillOpacity={hasHover ? (isHovered ? 1 : 0.25) : 0.85}
                      style={{
                        transition: "fill 200ms, fill-opacity 200ms",
                        cursor: "pointer",
                      }}
                    />
                  );
                })}
              </Bar>

              <Bar
                dataKey="expenses"
                fill="#64748b"
                radius={[2, 2, 0, 0]}
                barSize={10}
                isAnimationActive
                animationBegin={0}
                animationDuration={500}
                animationEasing="ease-out"
              >
                <LabelList
                  dataKey="expenses"
                  position="top"
                  formatter={(value) => formatMoney(Number(value)).replace("ARS", "").trim()}
                  style={{ fontSize: 10, fill: "#64748b", fontWeight: 600, fontFamily: "Inter" }}
                />
                {chartData.map((entry: Record<string, unknown>, index) => {
                  const key = `expenses-${index}`;
                  const isHovered = hoveredBar === key;
                  const hasHover = hoveredBar !== null;
                  const label = (entry.month || entry.weekKey || entry.dateKey || entry.hour) as string;
                  return (
                    <Cell
                      key={`${label}-expenses-${index}`}
                      onMouseEnter={(e) => {
                        setHoveredBar(key);
                        setTooltip({
                          x: e.clientX,
                          y: e.clientY,
                          label,
                          income: entry.income as number,
                          expenses: entry.expenses as number,
                        });
                      }}
                      onMouseMove={(e) => {
                        if (tooltipRef.current) {
                          tooltipRef.current.style.left = `${e.clientX + 12}px`;
                          tooltipRef.current.style.top = `${e.clientY - 10}px`;
                        }
                      }}
                      onMouseLeave={() => {
                        setHoveredBar(null);
                        setTooltip(null);
                      }}
                      fill={isHovered ? "#475569" : "#64748b"}
                      fillOpacity={hasHover ? (isHovered ? 1 : 0.25) : 0.85}
                      style={{
                        transition: "fill 200ms, fill-opacity 200ms",
                        cursor: "pointer",
                      }}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <style>{`
        .analytics-bg {
          isolation: isolate;
        }
        .analytics-grid {
          background-image:
            linear-gradient(rgba(0,0,0,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px);
          background-size: 24px 24px;
          opacity: 0.6;
        }
        .analytics-scan {
          background: linear-gradient(
            120deg,
            transparent 0%,
            transparent 30%,
            rgba(59,130,246,0.04) 45%,
            rgba(99,102,241,0.06) 50%,
            rgba(59,130,246,0.04) 55%,
            transparent 70%,
            transparent 100%
          );
          background-size: 100% 100%;
        }
        .dark .analytics-grid {
          background-image:
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
        }
        .dark .analytics-scan {
          background: linear-gradient(
            120deg,
            transparent 0%,
            transparent 30%,
            rgba(96,165,250,0.06) 45%,
            rgba(129,140,248,0.08) 50%,
            rgba(96,165,250,0.06) 55%,
            transparent 70%,
            transparent 100%
          );
          background-size: 100% 100%;
        }
      `}</style>

      {tooltip && typeof window !== "undefined" && createPortal(
        <div
          ref={tooltipRef}
          style={{ position: "fixed", left: tooltip.x + 12, top: tooltip.y - 10, zIndex: 9999, pointerEvents: "none" }}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="mb-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {period === "today" ? formatDayLabel(tooltip.label) : period === "week" ? "Semana del " + formatWeekLabel(tooltip.label) : formatMonthLabel(tooltip.label)}
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
              <span className="text-zinc-600 dark:text-zinc-400">Ingresos:</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {formatMoney(tooltip.income).replace("ARS", "").trim()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-slate-500" />
              <span className="text-zinc-600 dark:text-zinc-400">Gastos:</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {formatMoney(tooltip.expenses).replace("ARS", "").trim()}
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
