"use client";

import { useState, useMemo } from "react";
import {
  Package,
  AlertTriangle,
  Plus,
  Minus,
  Trash2,
  Search,
} from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProduct, updateStock } from "@/lib/dashboard/inventory-actions";

type StockItem = {
  id: string;
  name: string;
  quantity: number;
  unit_cost: number;
};

interface StockTableProps {
  items: StockItem[];
}

export default function StockTable({ items }: StockTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      items.filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase())
      ),
    [items, search]
  );

  function handleDelta(id: string, delta: number) {
    startTransition(async () => {
      const result = await updateStock(id, delta);
      if (!result.success) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este producto del inventario?")) return;
    startTransition(async () => {
      const result = await deleteProduct(id);
      if (!result.success) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  const totalValue = filtered.reduce(
    (sum, item) => sum + item.quantity * item.unit_cost,
    0
  );

  const lowStockCount = filtered.filter((i) => i.quantity < 5).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>

        {lowStockCount > 0 && (
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded-lg text-sm">
            <AlertTriangle className="w-4 h-4" />
            {lowStockCount} producto{lowStockCount > 1 ? "s" : ""} con bajo
            stock
          </div>
        )}
      </div>

      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-white/40 dark:bg-black/20 border-b border-white/20 dark:border-white/10">
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                  Producto
                </th>
                <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                  Cantidad
                </th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                  Costo unit.
                </th>
                <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                  Valor total
                </th>
                <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20 dark:divide-white/10">
              {filtered.length === 0 ? (
                <tr>
                  <td
                      colSpan={5}
                      className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    {search
                      ? "No se encontraron productos"
                      : "No hay productos en el inventario"}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const isLow = item.quantity < 5;
                  const total = item.quantity * item.unit_cost;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {item.name}
                          </span>
                          {isLow && (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-sm font-semibold ${
                            isLow ? "text-red-600" : "text-gray-900"
                          }`}
                        >
                          {item.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-gray-400">
                        ${item.unit_cost.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                        ${total.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleDelta(item.id, -1)}
                            disabled={pending || item.quantity <= 0}
                            className="p-1.5 rounded-md text-gray-500 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
                            title="Restar unidad"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelta(item.id, 1)}
                            disabled={pending}
                            className="p-1.5 rounded-md text-gray-500 hover:text-violet-600 hover:bg-violet-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
                            title="Sumar unidad"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={pending}
                            className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800 px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Valor total del stock: ${totalValue.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
