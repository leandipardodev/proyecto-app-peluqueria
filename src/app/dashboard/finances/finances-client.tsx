"use client";

import { useState, useTransition } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { createExpense, deleteExpense } from "@/lib/dashboard/finances-actions";

type Expense = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  created_at: string;
};

const EXPENSE_CATEGORIES = [
  "Alquiler",
  "Insumos",
  "Sueldos",
  "Servicios",
  "Publicidad",
  "Mantenimiento",
  "Impuestos",
  "Otros",
];

export default function FinancesClient({ initialExpenses }: { initialExpenses: Expense[] }) {
  const [showForm, setShowForm] = useState(false);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get("amount") as string);
    const category = formData.get("category") as string;
    const description = formData.get("description") as string || null;

    const tempId = crypto.randomUUID();
    const optimisticExpense = {
      id: tempId,
      amount,
      category,
      description,
      created_at: new Date().toISOString(),
    };

    setExpenses((prev) => [optimisticExpense, ...prev]);
    setShowForm(false);

    const result = await createExpense(formData);
    if (result.error) {
      setExpenses((prev) => prev.filter((e) => e.id !== tempId));
      setError(result.error);
    }
  }

  async function handleDelete(id: string) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    const result = await deleteExpense(id);
    if (result.error) {
      setError(result.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Gastos del día</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 transition-colors cursor-pointer select-none"
        >
          <Plus className="w-4 h-4" />
          Cargar Gasto
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] w-full max-w-md mx-4 overflow-hidden transition-colors">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/20 dark:border-white/10">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Nuevo Gasto</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer select-none">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm px-4 py-2 rounded-lg">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 cursor-pointer">Monto ($)</label>
                <input
                  type="number"
                  name="amount"
                  step="0.01"
                  min="0.01"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 cursor-pointer">Categoría</label>
                <select
                  name="category"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer"
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Descripción del gasto..."
                />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="w-full bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 transition-colors cursor-pointer select-none"
              >
                {pending ? "Guardando..." : "Guardar Gasto"}
              </button>
            </form>
          </div>
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No hay gastos registrados hoy.
        </div>
      ) : (
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden">
          <table className="min-w-full divide-y divide-white/20 dark:divide-white/10">
            <thead className="bg-white/40 dark:bg-black/20">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hora</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-red-600 whitespace-nowrap">
                    -${exp.amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">{exp.category}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{exp.description || "—"}</td>
                  <td suppressHydrationWarning className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {new Date(exp.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleDelete(exp.id)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer select-none"
                      title="Eliminar gasto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
