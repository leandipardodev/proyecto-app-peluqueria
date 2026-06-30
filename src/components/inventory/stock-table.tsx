"use client";

import { useEffect, useState, useMemo, useRef, memo, useTransition } from "react";
import {
  Package,
  AlertTriangle,
  Trash2,
  Search,
  Plus,
  Minus,
} from "lucide-react";
import { applyStockBatchAdjustments, deleteProduct } from "@/lib/dashboard/inventory-actions";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { StatePanel } from "@/components/ui/state-panel";

type StockItem = {
  id: string;
  nombre_producto: string;
  quantity: number;
  unit_cost: number;
};

interface StockTableProps {
  shopId: string;
  items: StockItem[];
  isOwnerOrAdmin?: boolean;
}

const StockTable = memo(function StockTable({ shopId, items, isOwnerOrAdmin = false }: StockTableProps) {
  const [stockItems, setStockItems] = useState(items);
  const [search, setSearch] = useState("");
  const [bulkAmountById, setBulkAmountById] = useState<Record<string, string>>({});
  const [queuedById, setQueuedById] = useState<Record<string, number>>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { addToast } = useToast();
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setStockItems(items);
  }, [items]);

  const realtimeCooldown = useRef(false);

  useEffect(() => {
    const channel = supabase
      .channel(`stock-${shopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock", filter: `shop_id=eq.${shopId}` },
        () => {
          if (realtimeCooldown.current) return;
          realtimeCooldown.current = true;
          setTimeout(() => { realtimeCooldown.current = false; }, 5000);
          startTransition(async () => {
            const { data } = await supabase
              .from("stock")
              .select("id, nombre_producto, quantity, unit_cost")
              .eq("shop_id", shopId)
              .order("nombre_producto", { ascending: true });
            if (Array.isArray(data)) setStockItems(data);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId, startTransition]);

  const filtered = useMemo(
    () =>
      stockItems.filter((item) =>
        item.nombre_producto.toLowerCase().includes(search.toLowerCase())
      ),
    [stockItems, search]
  );

  function flushQueuedAdjustments() {
    const current = queuedById;
    const adjustments = Object.entries(current)
      .filter(([, delta]) => Number.isFinite(delta) && delta !== 0)
      .map(([id, delta]) => ({ id, delta }));

    if (adjustments.length === 0) return;

    setQueuedById({});
    startTransition(async () => {
      const result = await applyStockBatchAdjustments(adjustments, shopId);
      if (!result.success) {
        addToast(result.error, "error");
      }
    });
  }

  function handleDelta(id: string, delta: number) {
    setStockItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, quantity: Math.max(0, item.quantity + delta) }
          : item
      )
    );

    setQueuedById((prev) => ({
      ...prev,
      [id]: (prev[id] || 0) + delta,
    }));
  }

  function handleDelete(id: string) {
    if (!isOwnerOrAdmin) return;
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushQueuedAdjustments();
    setDeleteTargetId(id);
  }

  function confirmDeleteProduct() {
    const id = deleteTargetId;
    if (!id) return;
    startTransition(async () => {
      const result = await deleteProduct(id, shopId);
      if (!result.success) {
        addToast(result.error, "error");
        return;
      }
      setStockItems((prev) => prev.filter((item) => item.id !== id));
      setDeleteTargetId(null);
    });
  }

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!Object.values(queuedById).some((delta) => delta !== 0)) return;
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      const adjustments = Object.entries(queuedById)
        .filter(([, delta]) => Number.isFinite(delta) && delta !== 0)
        .map(([id, delta]) => ({ id, delta }));

      if (adjustments.length === 0) return;
      setQueuedById({});
      startTransition(async () => {
        const result = await applyStockBatchAdjustments(adjustments, shopId);
        if (!result.success) addToast(result.error, "error");
      });
    }, 500);

    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [queuedById, shopId, startTransition, addToast]);

  function resolveBulkAmount(id: string): number {
    const raw = (bulkAmountById[id] || "").trim();
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed) || parsed <= 0) return 1;
    return parsed;
  }

  function handleBulkAdjust(id: string, sign: 1 | -1) {
    const amount = resolveBulkAmount(id);
    handleDelta(id, sign * amount);
  }

  const totalValue = filtered.reduce(
    (sum, item) => sum + item.quantity * item.unit_cost,
    0
  );

  const lowStockCount = filtered.filter((i) => i.quantity < 5).length;
  const pendingQueueCount = Object.values(queuedById).filter((delta) => delta !== 0).length;

  return (
    <>
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            aria-label="Buscar producto"
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
        {pendingQueueCount > 0 && (
          <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 px-3 py-1.5 rounded-lg text-sm">
            Guardando {pendingQueueCount} ajuste{pendingQueueCount > 1 ? "s" : ""}...
          </div>
        )}
      </div>

      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <StatePanel
            title={search ? "Sin resultados" : "Sin productos"}
            description={search ? "No encontramos productos con ese criterio de búsqueda." : "Todavía no hay productos en el inventario."}
          />
        ) : (
          filtered.map((item) => {
            const isLow = item.quantity < 5;
            const total = item.quantity * item.unit_cost;
            return (
              <div key={item.id} className="bg-white dark:bg-zinc-900 rounded-[1.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{item.nombre_producto}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Costo: ${item.unit_cost.toFixed(2)}</p>
                  </div>
                  {isLow && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                </div>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Cantidad</span>
                  <span className={`font-semibold ${isLow ? "text-red-600" : "text-gray-900 dark:text-gray-100"}`}>{item.quantity}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Valor total</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">${total.toFixed(2)}</span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={bulkAmountById[item.id] ?? ""}
                      placeholder="1"
                      onChange={(e) => setBulkAmountById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      className="w-20 px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                    />
                  <button
                    type="button"
                    onClick={() => handleBulkAdjust(item.id, 1)}
                    disabled={pending}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:text-emerald-700 dark:hover:text-emerald-300 hover:border-emerald-300/50 dark:hover:border-emerald-700/50 hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer select-none active:scale-95"
                    title="Aumentar cantidad"
                    aria-label={`Aumentar cantidad de ${item.nombre_producto}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAdjust(item.id, -1)}
                    disabled={pending || item.quantity <= 0}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-300/50 dark:hover:border-rose-700/50 hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer select-none active:scale-95"
                    title="Disminuir cantidad"
                    aria-label={`Disminuir cantidad de ${item.nombre_producto}`}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={pending}
                    className="ml-auto p-2.5 min-h-[44px] min-w-[44px] rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer select-none flex items-center justify-center"
                    title="Eliminar"
                    aria-label={`Eliminar ${item.nombre_producto}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}

        {filtered.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-[1.25rem] border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-xs text-gray-600 dark:text-gray-400 flex items-center justify-between">
            <span>{filtered.length} producto{filtered.length !== 1 ? "s" : ""}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">${totalValue.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" aria-label="Tabla de inventario">
            <thead>
              <tr className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
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
                    <StatePanel
                      title={search ? "Sin resultados" : "Sin productos"}
                      description={search ? "No encontramos productos con ese criterio de búsqueda." : "Todavía no hay productos en el inventario."}
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const isLow = item.quantity < 5;
                  const total = item.quantity * item.unit_cost;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {item.nombre_producto}
                          </span>
                          {isLow && (
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`text-sm font-semibold ${
                            isLow ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"
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
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            value={bulkAmountById[item.id] ?? ""}
                            placeholder="1"
                            onChange={(e) => setBulkAmountById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-16 px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleBulkAdjust(item.id, 1)}
                            disabled={pending}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:text-emerald-700 dark:hover:text-emerald-300 hover:border-emerald-300/50 dark:hover:border-emerald-700/50 hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer select-none active:scale-95"
                            title="Aumentar cantidad"
                            aria-label={`Aumentar cantidad de ${item.nombre_producto}`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBulkAdjust(item.id, -1)}
                            disabled={pending || item.quantity <= 0}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-300/50 dark:hover:border-rose-700/50 hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer select-none active:scale-95"
                            title="Disminuir cantidad"
                            aria-label={`Disminuir cantidad de ${item.nombre_producto}`}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            disabled={pending}
                            className="p-2.5 min-h-[44px] min-w-[44px] rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer select-none flex items-center justify-center"
                            title="Eliminar"
                            aria-label={`Eliminar ${item.nombre_producto}`}
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
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="Eliminar producto"
        message="Esta accion eliminara el producto del inventario."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={confirmDeleteProduct}
      />
    </>
  );
});

export default StockTable;
