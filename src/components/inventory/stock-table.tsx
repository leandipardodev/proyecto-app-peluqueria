"use client";

import { useEffect, useState, useMemo, useRef, memo, useTransition } from "react";
import {
  Package,
  AlertTriangle,
  Trash2,
  Search,
  Plus,
  Minus,
  DollarSign,
  ArrowUpDown,
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

function productColor(id: string): string {
  const gradients = [
    "from-violet-400 to-violet-500 dark:from-violet-500 dark:to-violet-600 shadow-violet-200/50 dark:shadow-violet-900/50",
    "from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600 shadow-emerald-200/50 dark:shadow-emerald-900/50",
    "from-sky-400 to-sky-500 dark:from-sky-500 dark:to-sky-600 shadow-sky-200/50 dark:shadow-sky-900/50",
    "from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600 shadow-amber-200/50 dark:shadow-amber-900/50",
    "from-rose-400 to-rose-500 dark:from-rose-500 dark:to-rose-600 shadow-rose-200/50 dark:shadow-rose-900/50",
    "from-cyan-400 to-cyan-500 dark:from-cyan-500 dark:to-cyan-600 shadow-cyan-200/50 dark:shadow-cyan-900/50",
  ];
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

const StockTable = memo(function StockTable({ shopId, items, isOwnerOrAdmin = false }: StockTableProps) {
  const [stockItems, setStockItems] = useState(items);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "stock_asc" | "stock_desc" | "price_asc" | "price_desc">("name");
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

  const filtered = useMemo(() => {
    const f = stockItems.filter((item) =>
      item.nombre_producto.toLowerCase().includes(search.toLowerCase())
    );
    switch (sortBy) {
      case "stock_asc":
        return f.sort((a, b) => a.quantity - b.quantity);
      case "stock_desc":
        return f.sort((a, b) => b.quantity - a.quantity);
      case "price_asc":
        return f.sort((a, b) => a.unit_cost - b.unit_cost);
      case "price_desc":
        return f.sort((a, b) => b.unit_cost - a.unit_cost);
      default:
        return f.sort((a, b) => a.nombre_producto.localeCompare(b.nombre_producto));
    }
  }, [stockItems, search, sortBy]);

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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              aria-label="Buscar producto"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
            />
          </div>
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Ordenar por"
              className="appearance-none pl-8 pr-7 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500 transition-all cursor-pointer"
            >
              <option value="name">Nombre</option>
              <option value="stock_asc">Stock ▲</option>
              <option value="stock_desc">Stock ▼</option>
              <option value="price_asc">Precio ▲</option>
              <option value="price_desc">Precio ▼</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {lowStockCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200/50 dark:border-red-700/50">
              <AlertTriangle className="w-3.5 h-3.5" />
              {lowStockCount} con stock bajo
            </div>
          )}
          {pendingQueueCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200/50 dark:border-sky-700/50">
              Guardando {pendingQueueCount} ajuste{pendingQueueCount > 1 ? "s" : ""}...
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm py-16 px-6 text-center">
          <StatePanel
            title={search ? "Sin resultados" : "Sin productos"}
            description={search ? "No encontramos productos con ese criterio." : "Todavía no hay productos en el inventario."}
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const isLow = item.quantity < 5;
            const total = item.quantity * item.unit_cost;
            const gradient = productColor(item.id);

            return (
              <div key={item.id} className={`group bg-white dark:bg-zinc-900 rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 ${isLow ? "border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-950/20 hover:border-red-400 dark:hover:border-red-600" : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"}`}>
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    <div className={`flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-lg shrink-0`}>
                      <Package className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">{item.nombre_producto}</h3>
                        </div>
                        {isLow && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700">
                            <AlertTriangle className="w-3 h-3" />
                            Bajo
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex items-end gap-4">
                        <div className="flex items-baseline gap-0.5">
                          <span className={`font-black leading-none ${isLow ? "text-3xl text-red-600 dark:text-red-400" : "text-2xl text-gray-900 dark:text-white"}`}>
                            {item.quantity}
                          </span>
                          <span className="text-xs text-zinc-400 ml-0.5">u</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                          <DollarSign className="w-3.5 h-3.5" />
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">${item.unit_cost.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
                        Total en stock: <span className="font-semibold text-zinc-700 dark:text-zinc-300">${total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={bulkAmountById[item.id] ?? ""}
                        placeholder="1"
                        onChange={(e) => setBulkAmountById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-14 px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-center text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        aria-label="Cantidad a ajustar"
                      />
                      <button
                        type="button"
                        onClick={() => handleBulkAdjust(item.id, 1)}
                        disabled={pending}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-700/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:border-emerald-300 dark:hover:border-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer select-none active:scale-95"
                        title="Aumentar cantidad"
                        aria-label={`Aumentar cantidad de ${item.nombre_producto}`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkAdjust(item.id, -1)}
                        disabled={pending || item.quantity <= 0}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-700/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 hover:border-rose-300 dark:hover:border-rose-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer select-none active:scale-95"
                        title="Disminuir cantidad"
                        aria-label={`Disminuir cantidad de ${item.nombre_producto}`}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="flex-1" />
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        disabled={pending}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-zinc-400 dark:text-zinc-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer select-none active:scale-95"
                        title="Eliminar producto"
                        aria-label={`Eliminar ${item.nombre_producto}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm px-5 py-4 flex items-center justify-between">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{filtered.length}</span> producto{filtered.length !== 1 ? "s" : ""}
          </span>
          <span className="text-sm">
            <span className="text-zinc-400 dark:text-zinc-500">Valor total: </span>
            <span className="font-semibold text-zinc-900 dark:text-white">${totalValue.toFixed(2)}</span>
          </span>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title="Eliminar producto"
        message="Esta acción eliminará el producto del inventario."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={confirmDeleteProduct}
      />
    </div>
  );
});

export default StockTable;
