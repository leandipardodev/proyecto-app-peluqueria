"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";

type RevenueChartProps = {
  data: Array<{ month: string; income: number; expenses: number }>;
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

function formatMonthLabel(value: string): string {
  const [y, m] = value.split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

type CompactLabelProps = {
  x?: number;
  y?: number;
  value?: number | string;
};

function CompactLabel({ x, y, value }: CompactLabelProps) {
  if (typeof x !== "number" || typeof y !== "number") return null;
  const txt = new Intl.NumberFormat("es-AR", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));

  return (
    <text
      x={x}
      y={y - 10}
      textAnchor="middle"
      fill="#64748b"
      fontFamily="Inter, sans-serif"
      fontSize={12}
      fontWeight={600}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {txt}
    </text>
  );
}

export default function RevenueChart({ data, flowByPeriod }: RevenueChartProps) {
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const chartHostRef = useRef<HTMLDivElement | null>(null);
  const [canRenderChart, setCanRenderChart] = useState(false);

  useEffect(() => {
    const node = chartHostRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      const hasWidth = rect.width > 0;
      const isVisible = node.offsetParent !== null;
      setCanRenderChart(hasWidth && isVisible);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const totals = useMemo(() => {
    const lastMonth = data[data.length - 1];
    const fallback = {
      today: { income: lastMonth?.income ?? 0, expenses: lastMonth?.expenses ?? 0 },
      week: { income: lastMonth?.income ?? 0, expenses: lastMonth?.expenses ?? 0 },
      month: { income: lastMonth?.income ?? 0, expenses: lastMonth?.expenses ?? 0 },
    };
    const source = flowByPeriod ?? fallback;

    return {
      income: source[period].income,
      expenses: source[period].expenses,
    };
  }, [data, flowByPeriod, period]);

  const netResult = totals.income - totals.expenses;

  if (data.length === 0) {
    return (
      <div
        className="rounded-[2.5rem] border border-white/20 bg-white/40 p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_20px_40px_rgba(0,0,0,0.2)] backdrop-blur-2xl dark:border-slate-700/30 dark:bg-slate-800/40 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_20px_40px_rgba(0,0,0,0.4)]"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        <p className="py-12 text-center text-sm text-slate-500">Sin datos de ingresos aun</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[2.5rem] border border-white/20 bg-white/40 p-6 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_10px_30px_rgba(0,0,0,0.03)] backdrop-blur-2xl dark:border-slate-700/30 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_10px_30px_rgba(0,0,0,0.2)]"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <h3 className="mb-1 text-sm font-medium text-slate-900 dark:text-white">Ingresos vs Gastos</h3>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Resultado neto por periodo</p>
        <div className="inline-flex rounded-full border border-white/20 bg-white/50 p-1 dark:border-slate-700/40 dark:bg-slate-900/45">
          {([
            ["today", "Hoy"],
            ["week", "Semana"],
            ["month", "Mes"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                period === key
                  ? "bg-[#0071E3] text-white"
                  : "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-14 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
        <div className="rounded-3xl border border-white/20 bg-white/40 px-4 py-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_20px_40px_rgba(0,0,0,0.2)] backdrop-blur-2xl dark:border-slate-700/30 dark:bg-slate-800/40 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_20px_40px_rgba(0,0,0,0.4)]">
          <p className="text-[10px] font-bold tracking-[0.1em] text-slate-500 dark:text-slate-300">INGRESOS</p>
          <p className="mt-1 text-4xl font-black text-emerald-500" style={{ fontWeight: 900, letterSpacing: "-0.05em", fontVariantNumeric: "tabular-nums" }}>
            <span className="mr-0.5 align-top text-[60%] opacity-40">$</span>
            {formatMoney(totals.income).replace("ARS", "").replace("$", "").trim()}
          </p>
        </div>

        <div className="rounded-3xl border border-white/20 bg-white/40 px-4 py-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_20px_40px_rgba(0,0,0,0.2)] backdrop-blur-2xl dark:border-slate-700/30 dark:bg-slate-800/40 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_20px_40px_rgba(0,0,0,0.4)]">
          <p className="text-[10px] font-bold tracking-[0.1em] text-slate-500 dark:text-slate-300">GASTOS</p>
          <p className="mt-1 text-4xl font-black text-rose-500" style={{ fontWeight: 900, letterSpacing: "-0.05em", fontVariantNumeric: "tabular-nums" }}>
            <span className="mr-0.5 align-top text-[60%] opacity-40">$</span>
            {formatMoney(totals.expenses).replace("ARS", "").replace("$", "").trim()}
          </p>
        </div>

        <div className="rounded-3xl border border-white/20 bg-white/40 px-4 py-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_20px_40px_rgba(0,0,0,0.2)] backdrop-blur-2xl dark:border-slate-700/30 dark:bg-slate-800/40 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_20px_40px_rgba(0,0,0,0.4)]">
          <p className="text-[10px] font-bold tracking-[0.1em] text-slate-500 dark:text-slate-300">RESULTADO</p>
          <p className={`mt-1 text-4xl font-black ${netResult >= 0 ? "text-emerald-500" : "text-rose-500"}`} style={{ fontWeight: 900, letterSpacing: "-0.05em", fontVariantNumeric: "tabular-nums" }}>
            <span className="mr-0.5 align-top text-[60%] opacity-40">$</span>
            {formatMoney(Math.abs(netResult)).replace("ARS", "").replace("$", "").trim()}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{netResult >= 0 ? "Superavit" : "Deficit"}</p>
        </div>
      </div>

      <div
        ref={chartHostRef}
        className="analytics-chart-wave h-72 min-h-[18rem] min-w-0 w-full overflow-hidden rounded-3xl px-2 pt-2 pb-1"
        style={{
          background: "transparent",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "none",
          boxShadow: "none",
        }}
      >
        <div className="analytics-metric-waves" aria-hidden="true">
          <svg viewBox="0 0 1000 260" preserveAspectRatio="none" className="analytics-metric-wave-svg analytics-metric-wave-svg-a">
            <path d="M0,170 C90,152 180,184 270,166 C360,148 450,188 540,170 C630,152 720,190 810,168 C890,150 950,176 1000,164" />
          </svg>
          <svg viewBox="0 0 1000 260" preserveAspectRatio="none" className="analytics-metric-wave-svg analytics-metric-wave-svg-b">
            <path d="M0,194 C100,176 200,208 300,190 C400,172 500,212 600,194 C700,176 800,214 900,192 C950,182 980,188 1000,186" />
          </svg>
        </div>
        {canRenderChart && <ResponsiveContainer width="100%" height={260} minWidth={280} minHeight={220}>
          <BarChart data={data} margin={{ top: 20, right: 8, left: -8, bottom: 0 }} barGap={8} barCategoryGap="20%">
            <defs>
              <linearGradient id="income-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(52,211,153,0.9)" />
                <stop offset="50%" stopColor="rgba(16,185,129,0.75)" />
                <stop offset="100%" stopColor="rgba(5,150,105,0.72)" />
              </linearGradient>
              <linearGradient id="expense-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(251,146,160,0.88)" />
                <stop offset="50%" stopColor="rgba(244,114,182,0.74)" />
                <stop offset="100%" stopColor="rgba(225,29,72,0.72)" />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tickMargin={15}
              tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 500, fontFamily: "Inter" }}
              tickFormatter={formatMonthLabel}
            />

            <YAxis hide />

            <Bar
              dataKey="income"
              fill="url(#income-grad)"
              radius={[10, 10, 0, 0]}
              barSize={34}
              isAnimationActive
              animationBegin={0}
              animationDuration={700}
              animationEasing="ease-out"
            >
              <LabelList dataKey="income" position="top" content={<CompactLabel />} />
              {data.map((entry, index) => {
                const key = `income-${index}`;
                const isHovered = hoveredBar === key;
                const hasHover = hoveredBar !== null;
                return (
                  <Cell
                    key={`${entry.month}-income-${index}`}
                    onMouseEnter={() => setHoveredBar(key)}
                    onMouseLeave={() => setHoveredBar(null)}
                    fillOpacity={hasHover ? (isHovered ? 1 : 0.4) : 1}
                    style={{
                      filter: isHovered ? "brightness(1.2)" : "brightness(1)",
                      transform: isHovered ? "translateY(-5px)" : "translateY(0)",
                      transformOrigin: "center bottom",
                      animation: isHovered ? "none" : `premiumFlow 2.8s ease-in-out ${index * 140}ms infinite`,
                      transition: "transform 240ms cubic-bezier(.43,.13,.23,.96), opacity 240ms cubic-bezier(.43,.13,.23,.96), filter 240ms cubic-bezier(.43,.13,.23,.96)",
                    }}
                  />
                );
              })}
            </Bar>

            <Bar
              dataKey="expenses"
              fill="url(#expense-grad)"
              radius={[10, 10, 0, 0]}
              barSize={34}
              isAnimationActive
              animationBegin={0}
              animationDuration={700}
              animationEasing="ease-out"
            >
              <LabelList dataKey="expenses" position="top" content={<CompactLabel />} />
              {data.map((entry, index) => {
                const key = `expenses-${index}`;
                const isHovered = hoveredBar === key;
                const hasHover = hoveredBar !== null;
                return (
                  <Cell
                    key={`${entry.month}-expenses-${index}`}
                    onMouseEnter={() => setHoveredBar(key)}
                    onMouseLeave={() => setHoveredBar(null)}
                    fillOpacity={hasHover ? (isHovered ? 1 : 0.4) : 1}
                    style={{
                      filter: isHovered ? "brightness(1.2)" : "brightness(1)",
                      transform: isHovered ? "translateY(-5px)" : "translateY(0)",
                      transformOrigin: "center bottom",
                      animation: isHovered ? "none" : `premiumFlow 3.1s ease-in-out ${index * 170}ms infinite`,
                      transition: "transform 240ms cubic-bezier(.43,.13,.23,.96), opacity 240ms cubic-bezier(.43,.13,.23,.96), filter 240ms cubic-bezier(.43,.13,.23,.96)",
                    }}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>}
      </div>
      <style>{`
        .analytics-chart-wave {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .analytics-metric-waves {
          position: absolute;
          inset: 14px 8px 8px;
          border-radius: 1.1rem;
          pointer-events: none;
          z-index: 0;
          opacity: 0.62;
        }
        .analytics-metric-wave-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
          transform: translate3d(0, 0, 0);
          will-change: transform, opacity;
        }
        .analytics-metric-wave-svg-a {
          stroke: rgba(16,185,129,0.2);
          stroke-width: 2.1;
          filter: drop-shadow(0 0 4px rgba(16,185,129,0.08));
          animation: metricWaveFloatA 12.8s ease-in-out infinite;
        }
        .analytics-metric-wave-svg-b {
          stroke: rgba(244,114,182,0.18);
          stroke-width: 1.9;
          filter: drop-shadow(0 0 4px rgba(244,114,182,0.07));
          animation: metricWaveFloatB 14.4s ease-in-out infinite;
        }
        .analytics-chart-wave::before {
          content: "";
          position: absolute;
          inset: -10% -12%;
          pointer-events: none;
          border-radius: inherit;
          background:
            radial-gradient(90% 55% at 8% 100%, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0.03) 48%, transparent 72%),
            radial-gradient(92% 56% at 92% 0%, rgba(244,114,182,0.14) 0%, rgba(244,114,182,0.03) 48%, transparent 72%);
          background-size: 160% 120%, 160% 120%;
          background-position: 0% 100%, 100% 0%;
          animation: chartWaveDrift 14s linear infinite;
          opacity: 0.42;
          z-index: 0;
        }
        .analytics-chart-wave::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: inherit;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.12) 48%, transparent 100%);
          background-size: 220% 100%;
          animation: chartSheenPass 17s linear infinite;
          opacity: 0.16;
          z-index: 0;
        }
        .analytics-chart-wave :global(.recharts-wrapper) {
          position: relative;
          z-index: 1;
        }
        @keyframes premiumFlow {
          0% { filter: brightness(0.96) saturate(0.96); }
          50% { filter: brightness(1.08) saturate(1.02); }
          100% { filter: brightness(0.96) saturate(0.96); }
        }
        @keyframes chartWaveDrift {
          0% { background-position: 0% 100%, 100% 0%; }
          100% { background-position: 100% 100%, 0% 0%; }
        }
        @keyframes chartSheenPass {
          0% { background-position: 150% 0; }
          100% { background-position: -130% 0; }
        }
        @keyframes metricWaveFloatA {
          0% { transform: translateY(1px); opacity: 0.5; }
          50% { transform: translateY(-2px); opacity: 0.72; }
          100% { transform: translateY(1px); opacity: 0.5; }
        }
        @keyframes metricWaveFloatB {
          0% { transform: translateY(-1px); opacity: 0.42; }
          50% { transform: translateY(2px); opacity: 0.62; }
          100% { transform: translateY(-1px); opacity: 0.42; }
        }
      `}</style>
    </div>
  );
}
