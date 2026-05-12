"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, Plus, Minus, Share2, Inbox, Wallet,
  X, Trash2,
} from "lucide-react";
import { fetchFinanceData, createExpense, deleteExpense } from "@/lib/dashboard/finances-actions";

type Movement = {
  id: string;
  amount: number;
  description: string;
  created_at: string;
  type: "income" | "expense";
  status: string | null;
};

type Expense = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  created_at: string;
};

type FinanceData = {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  appointmentsCount: number;
  recentMovements: Movement[];
  expenses: Expense[];
};

const EXPENSE_CATEGORIES = [
  "Alquiler", "Insumos", "Sueldos", "Servicios",
  "Publicidad", "Mantenimiento", "Impuestos", "Otros",
];

function getArgentinaDate(): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "numeric", day: "numeric",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  const y = get("year");
  const m = get("month").padStart(2, "0");
  const d = get("day").padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonthBounds(dateStr: string) {
  const [y, m] = dateStr.split("-").map(Number);
  const from = `${dateStr.slice(0, 7)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${dateStr.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export default function FinancesClient({
  initialData,
  initialFrom,
  initialTo,
  initialError,
}: {
  initialData: FinanceData | null;
  initialFrom: string;
  initialTo: string;
  initialError: string | null;
}) {
  const today = getArgentinaDate();
  const monthBounds = getMonthBounds(today);

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [isPending, startTransition] = useTransition();
  const [expenses, setExpenses] = useState(initialData?.expenses || []);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  const isToday = from === today && to === today;
  const isMonth = from === monthBounds.from && to === monthBounds.to;

  function loadData(newFrom: string, newTo: string) {
    setFrom(newFrom);
    setTo(newTo);
    startTransition(async () => {
      try {
        const result = await fetchFinanceData(newFrom, newTo);
        if (result.success && result.data) {
          setData(result.data);
          setError(null);
          setExpenses(result.data.expenses);
        } else if (!result.success) {
          setError(result.error ?? "Error al cargar datos");
        } else {
          setError("Error al cargar datos");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar datos");
      }
    });
  }

  function handlePreset(preset: "today" | "month") {
    if (preset === "today") {
      loadData(today, today);
    } else {
      loadData(monthBounds.from, monthBounds.to);
    }
  }

  function shiftMonth(delta: number) {
    const [y, m] = from.split("-").map(Number);
    const d = Math.min(parseInt(from.split("-")[2] || "1"), 28);
    const dt = new Date(y, m - 1 + delta, d);
    const ny = dt.getFullYear();
    const nm = String(dt.getMonth() + 1).padStart(2, "0");
    const nd = String(dt.getDate()).padStart(2, "0");
    const newFrom = `${ny}-${nm}-${nd}`;
    const lastDay = String(new Date(ny, dt.getMonth() + 1, 0).getDate()).padStart(2, "0");
    const newTo = `${ny}-${nm}-${lastDay}`;
    loadData(newFrom, newTo);
  }

  function applyCustomRange() {
    const f = from || today;
    const t = to || today;
    const sortedFrom = f <= t ? f : t;
    const sortedTo = f <= t ? t : f;
    loadData(sortedFrom, sortedTo);
  }

  async function handleExpenseSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setExpenseError(null);
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get("amount") as string);
    const category = formData.get("category") as string;
    const description = formData.get("description") as string || null;

    const tempId = crypto.randomUUID();
    const optimistic: Expense = {
      id: tempId, amount, category, description,
      created_at: new Date().toISOString(),
    };
    setExpenses((prev) => [optimistic, ...prev]);
    setShowExpenseForm(false);

    const result = await createExpense(formData);
    if (!result.success) {
      setExpenses((prev) => prev.filter((e) => e.id !== tempId));
      setExpenseError(result.error ?? "Error al crear gasto");
    } else {
      loadData(from, to);
    }
  }

  async function handleExpenseDelete(id: string) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    const result = await deleteExpense(id);
    if (!result.success) {
      setExpenseError(result.error ?? "Error al eliminar gasto");
    } else {
      loadData(from, to);
    }
  }

  async function handleExport() {
    if (navigator.share) {
      await navigator.share({
        title: "Resumen Financiero",
        text: `Ingresos: $${(data?.totalIncome ?? 0).toFixed(2)}\nGastos: $${(data?.totalExpenses ?? 0).toFixed(2)}\nBalance: $${(data?.netBalance ?? 0).toFixed(2)}`,
      });
    }
  }

  const rangeKey = `${from}-${to}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">
          Finanzas
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {isToday
            ? "Resumen de hoy"
            : isMonth
              ? "Resumen del mes"
              : `Del ${from} al ${to}`}
        </p>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => handlePreset("today")}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all cursor-pointer select-none ${
            isToday
              ? "bg-white/40 dark:bg-[#1c1c1e] backdrop-blur-md border border-white/20 dark:border-zinc-700 text-gray-900 dark:text-white shadow-sm"
              : "bg-white/10 dark:bg-[#1c1c1e]/70 border border-white/10 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-300 hover:bg-white/20 dark:hover:bg-white/10"
          }`}
        >
          Hoy
        </button>
        <button
          onClick={() => handlePreset("month")}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all cursor-pointer select-none ${
            isMonth
              ? "bg-white/40 dark:bg-[#1c1c1e] backdrop-blur-md border border-white/20 dark:border-zinc-700 text-gray-900 dark:text-white shadow-sm"
              : "bg-white/10 dark:bg-[#1c1c1e]/70 border border-white/10 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-300 hover:bg-white/20 dark:hover:bg-white/10"
          }`}
        >
          Este mes
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-full text-zinc-500 dark:text-zinc-400 hover:bg-white/20 dark:hover:bg-white/10 transition-colors cursor-pointer select-none"
            title="Mes anterior"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            onClick={() => shiftMonth(1)}
            className="p-2 rounded-full text-zinc-500 dark:text-zinc-400 hover:bg-white/20 dark:hover:bg-white/10 transition-colors cursor-pointer select-none"
            title="Mes siguiente"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <span className="hidden sm:inline text-zinc-300 dark:text-zinc-600 select-none">|</span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-full sm:w-auto rounded-full bg-white/40 dark:bg-[#1c1c1e] backdrop-blur-md border border-white/20 dark:border-zinc-700 px-4 py-2 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-50 [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
        />
        <span className="hidden sm:inline text-zinc-400 text-xs select-none">→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-full sm:w-auto rounded-full bg-white/40 dark:bg-[#1c1c1e] backdrop-blur-md border border-white/20 dark:border-zinc-700 px-4 py-2 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-50 [color-scheme:light] dark:[color-scheme:dark] cursor-pointer"
        />
        <button
          onClick={applyCustomRange}
          className="w-full sm:w-auto px-4 py-2 rounded-full bg-violet-600/15 border border-violet-500/30 text-violet-700 dark:text-violet-300 text-sm font-medium hover:bg-violet-600/25 transition-colors cursor-pointer select-none"
        >
          Filtrar
        </button>
        <div className="sm:ml-auto">
          <button
            onClick={handleExport}
            className="p-3 rounded-full bg-white/20 dark:bg-[#1c1c1e]/60 backdrop-blur-md border border-white/20 dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-white/30 dark:hover:bg-white/10 transition-all cursor-pointer select-none"
            title="Compartir resumen"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50/80 backdrop-blur-md text-red-700 dark:text-red-300 text-sm px-5 py-3 rounded-full border border-red-200/30 dark:border-red-500/20">
          {error}
        </div>
      )}

      {/* Loading indicator */}
      <AnimatePresence>
        {isPending && (
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            className="h-0.5 bg-gradient-to-r from-violet-400 via-purple-400 to-violet-400 rounded-full"
          />
        )}
      </AnimatePresence>

      {/* Skeleton during loading */}
      <AnimatePresence>
        {isPending && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white/20 dark:bg-[#1c1c1e] backdrop-blur-3xl rounded-[2.5rem] border border-white/10 dark:border-white/5 p-6 animate-pulse"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-white/20 dark:bg-white/10" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-20 rounded-full bg-white/20 dark:bg-white/10" />
                      <div className="h-6 w-32 rounded-full bg-white/20 dark:bg-white/10" />
                      <div className="h-3 w-16 rounded-full bg-white/20 dark:bg-white/10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white/20 dark:bg-[#1c1c1e] backdrop-blur-3xl rounded-[2.5rem] border border-white/10 dark:border-white/5 overflow-hidden animate-pulse">
              <div className="px-6 py-4 border-b border-white/10">
                <div className="h-5 w-24 rounded-full bg-white/20 dark:bg-white/10" />
              </div>
              <div className="space-y-4 p-6">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-white/20 dark:bg-white/10" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-40 rounded-full bg-white/20 dark:bg-white/10" />
                      <div className="h-3 w-24 rounded-full bg-white/20 dark:bg-white/10" />
                    </div>
                    <div className="h-4 w-16 rounded-full bg-white/20 dark:bg-white/10" />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={rangeKey}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="space-y-6"
        >
          {data ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-[#1c1c1e] rounded-[2.5rem] border border-white/10 dark:border-white/10 shadow-2xl shadow-black/[0.03] p-6 flex items-center gap-4">
                  <div className="p-3 rounded-full bg-green-500/15">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Ingresos</p>
                    <p className="text-xl font-bold tracking-tighter text-slate-900 dark:text-white">
                      ${data.totalIncome.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{data.appointmentsCount} turnos</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#1c1c1e] rounded-[2.5rem] border border-white/10 dark:border-white/10 shadow-2xl shadow-black/[0.03] p-6 flex items-center gap-4">
                  <div className="p-3 rounded-full bg-red-500/15">
                    <TrendingDown className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Gastos</p>
                    <p className="text-xl font-bold tracking-tighter text-slate-900 dark:text-white">
                      ${data.totalExpenses.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{data.expenses.length} registros</p>
                  </div>
                </div>

                <div className={`bg-white/20 dark:bg-[#1c1c1e] backdrop-blur-3xl rounded-[2.5rem] border border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-6 flex items-center gap-4 bg-gradient-to-br from-white/30 to-white/10 ${
                  data.netBalance >= 0
                    ? "border-green-300/60 dark:border-green-500/20"
                    : "border-red-300/60 dark:border-red-500/20"
                }`}>
                  <div className={`p-3 rounded-full ${
                    data.netBalance >= 0 ? "bg-green-500/15" : "bg-red-500/15"
                  }`}>
                    <Wallet className={`w-5 h-5 ${
                      data.netBalance >= 0 ? "text-emerald-500" : "text-red-500"
                    }`} />
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Balance Total</p>
                    <p className={`text-xl font-bold tracking-tighter ${
                      data.netBalance >= 0
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                    }`}>
                      ${data.netBalance.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Movements (Apple-style list) */}
              <div className="bg-white/20 dark:bg-[#1c1c1e] backdrop-blur-3xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Movimientos</h2>
                </div>
                {data.recentMovements.length > 0 ? (
                  <div className="divide-y divide-white/10">
                    {data.recentMovements.map((movement) => (
                      <motion.div
                        key={`${movement.type}-${movement.id}`}
                        className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-white/20 dark:hover:bg-white/10"
                      >
                        <div className={`p-2.5 rounded-full flex-shrink-0 ${
                          movement.type === "expense" ? "bg-red-500/15" : "bg-green-500/15"
                        }`}>
                          {movement.type === "expense" ? (
                            <Minus className="w-4 h-4 text-red-500" />
                          ) : (
                            <Plus className="w-4 h-4 text-emerald-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {movement.description}
                            </p>
                            {movement.status === "scheduled" && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                Pendiente
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            {new Date(movement.created_at).toLocaleDateString("es-AR", {
                              day: "numeric", month: "short",
                            })} · {new Date(movement.created_at).toLocaleTimeString("es-AR", {
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className={`text-sm font-semibold tracking-tighter ${
                          movement.type === "expense" ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"
                        }`}>
                          {movement.type === "expense" ? "-" : "+"}${movement.amount.toFixed(2)}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="py-16 text-center">
                    <Inbox className="w-12 h-12 mx-auto text-zinc-300 dark:text-zinc-600 mb-4 opacity-50" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay registros en este período</p>
                  </div>
                )}
              </div>

              {/* Expenses section */}
              <div className="bg-white/20 dark:bg-[#1c1c1e] backdrop-blur-3xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Gastos registrados</h2>
                  <button
                    onClick={() => setShowExpenseForm(true)}
                    className="flex items-center gap-2 bg-violet-600 text-white px-5 py-2 rounded-full text-sm font-medium shadow-sm hover:bg-violet-700 transition-colors cursor-pointer select-none"
                  >
                    <Plus className="w-4 h-4" />
                    Cargar
                  </button>
                </div>

                {expenseError && (
                  <div className="mx-6 mt-4 bg-red-50/80 backdrop-blur-md text-red-700 dark:text-red-300 text-sm px-4 py-2 rounded-full border border-red-200/30 dark:border-red-500/20">
                    {expenseError}
                  </div>
                )}

                {expenses.length > 0 ? (
                  <div className="divide-y divide-white/10">
                    {expenses.map((exp) => (
                      <motion.div
                        key={exp.id}
                        className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-white/20 dark:hover:bg-white/10"
                      >
                        <div className="p-2.5 rounded-full bg-red-500/15 flex-shrink-0">
                          <TrendingDown className="w-4 h-4 text-red-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{exp.category}</p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                            {exp.description || "—"} · {new Date(exp.created_at).toLocaleTimeString("es-AR", {
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="text-sm font-semibold tracking-tighter text-red-500">
                          -${exp.amount.toFixed(2)}
                        </div>
                        <button
                          onClick={() => handleExpenseDelete(exp.id)}
                          className="p-1.5 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer select-none"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <Inbox className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-600 mb-3 opacity-40" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No hay gastos en este período</p>
                  </div>
                )}
              </div>

              {/* Expense creation modal */}
              <AnimatePresence>
                {showExpenseForm && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/10"
                    onClick={() => setShowExpenseForm(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-white/20 dark:bg-[#1c1c1e] backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] w-full max-w-md mx-4 overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-6 py-4 border-b border-white/20 dark:border-white/10">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Nuevo Gasto</h3>
                        <button
                          onClick={() => setShowExpenseForm(false)}
                          className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer select-none"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4">
                        {expenseError && (
                          <div className="bg-red-50/80 backdrop-blur-md text-red-700 dark:text-red-300 text-sm px-4 py-2 rounded-full border border-red-200/30 dark:border-red-500/20">
                            {expenseError}
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 cursor-pointer">Monto ($)</label>
                          <input
                            type="number"
                            name="amount"
                            step="0.01"
                            min="0.01"
                            required
                            className="w-full px-4 py-2.5 rounded-full border border-gray-300 dark:border-gray-600 text-sm bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 cursor-pointer">Categoría</label>
                          <select
                            name="category"
                            required
                            className="w-full px-4 py-2.5 rounded-full border border-gray-300 dark:border-gray-600 text-sm bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
                          >
                            <option value="">Seleccionar...</option>
                            {EXPENSE_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 cursor-pointer">Descripción</label>
                          <textarea
                            name="description"
                            rows={3}
                            className="w-full px-4 py-2.5 rounded-2xl border border-gray-300 dark:border-gray-600 text-sm bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                            placeholder="Descripción del gasto..."
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isPending}
                          className="w-full bg-violet-600 text-white py-2.5 px-4 rounded-full text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 transition-colors cursor-pointer select-none"
                        >
                          {isPending ? "Guardando..." : "Guardar Gasto"}
                        </button>
                      </form>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
