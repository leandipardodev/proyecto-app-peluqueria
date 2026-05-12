"use client";

import { useMemo, useState } from "react";
import { Inter } from "next/font/google";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "700", "900"] });

type RevenueChartProps = {
  data: Array<{ month: string; income: number; expenses: number }>;
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

function CompactLabel(props: any) {
  const { x, y, value } = props;
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

export default function RevenueChart({ data }: RevenueChartProps) {
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  const totals = useMemo(() => {
    const lastMonth = data[data.length - 1];
    return {
      income: lastMonth?.income ?? 0,
      expenses: lastMonth?.expenses ?? 0,
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        className={`${inter.className} rounded-[2.5rem] border border-white/20 bg-white/40 p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_20px_40px_rgba(0,0,0,0.2)] backdrop-blur-2xl dark:border-slate-700/30 dark:bg-slate-800/40 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_20px_40px_rgba(0,0,0,0.4)]`}
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        <p className="py-12 text-center text-sm text-slate-500">Sin datos de ingresos aun</p>
      </div>
    );
  }

  return (
    <div
      className={`${inter.className} rounded-[2.5rem] border border-white/20 bg-white/40 p-6 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_10px_30px_rgba(0,0,0,0.03)] backdrop-blur-2xl dark:border-slate-700/30 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_10px_30px_rgba(0,0,0,0.2)]`}
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <h3 className="mb-1 text-sm font-medium text-slate-900 dark:text-white">Ingresos vs Gastos</h3>
      <p className="mb-8 text-xs text-slate-500">Evolucion mensual</p>

      <div className="mb-14 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
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
      </div>

      <div
        className="h-72 rounded-3xl px-2 pt-2 pb-1"
        style={{
          background: "transparent",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "none",
          boxShadow: "none",
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
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
        </ResponsiveContainer>
      </div>
      <style>{`
        @keyframes premiumFlow {
          0% { filter: brightness(0.96) saturate(0.96); }
          50% { filter: brightness(1.08) saturate(1.02); }
          100% { filter: brightness(0.96) saturate(0.96); }
        }
      `}</style>
    </div>
  );
}
