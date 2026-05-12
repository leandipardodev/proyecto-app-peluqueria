"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type RevenueChartProps = {
  data: Array<{ month: string; income: number; expenses: number }>;
};

function useIsDark(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/80 dark:bg-black/80 backdrop-blur-xl rounded-2xl border border-white/30 dark:border-white/10 px-4 py-3 shadow-xl shadow-black/10 text-sm">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5 font-medium uppercase tracking-wider">
        {label}
      </p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-zinc-600 dark:text-zinc-300 capitalize">
            {entry.name}:
          </span>
          <span className="font-semibold text-gray-900 dark:text-white">
            ${entry.value.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function RevenueChart({ data }: RevenueChartProps) {
  const isDark = useIsDark();

  if (data.length === 0) {
    return (
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 transition-colors">
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
          Sin datos de ingresos aún
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 transition-colors">
      <h3 className="text-sm font-medium text-gray-900 dark:text-white tracking-tight mb-1">
        Ingresos vs Gastos
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        Evolución mensual
      </p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
            barGap={4}
            barCategoryGap="20%"
          >
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: isDark ? "#a1a1aa" : "#71717a" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: string) => {
                const [y, m] = v.split("-");
                const months = [
                  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
                  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
                ];
                return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: isDark ? "#a1a1aa" : "#71717a" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span className="text-zinc-500 dark:text-zinc-400">
                  {value === "income" ? "Ingresos" : "Gastos"}
                </span>
              )}
            />
            <Bar
              dataKey="income"
              fill="url(#incomeGrad)"
              radius={[6, 6, 0, 0]}
              maxBarSize={32}
              name="income"
            />
            <Bar
              dataKey="expenses"
              fill="url(#expenseGrad)"
              radius={[6, 6, 0, 0]}
              maxBarSize={32}
              name="expenses"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
