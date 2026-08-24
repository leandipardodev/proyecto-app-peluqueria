"use client";

import { useEffect, useState, useMemo, useRef, memo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Trash2,
  Search,
  Plus,
  Minus,
  ArrowUpDown,
  Check,
  Settings2,
} from "lucide-react";
import {
  applyStockBatchAdjustments,
  deleteProduct,
  toggleForSale,
  type StockItem,
} from "@/lib/dashboard/inventory/inventory-actions";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { StatePanel } from "@/components/ui/state-panel";
import SaleConfigModal from "./sale-config-modal";

interface StockTableProps {
  shopId: string;
  items: StockItem[];
  isOwnerOrAdmin?: boolean;
  storeEnabled?: boolean;
}

const SORT_OPTIONS: { key: "name" | "stock_asc" | "stock_desc" | "price_asc" | "price_desc"; label: string }[] = [
  { key: "name", label: "Nombre" },
  { key: "stock_asc", label: "Stock ▲" },
  { key: "stock_desc", label: "Stock ▼" },
  { key: "price_asc", label: "Precio ▲" },
  { key: "price_desc", label: "Precio ▼" },
];

const StockTable = memo(function StockTable({ shopId, items, isOwnerOrAdmin = false, storeEnabled = true }: StockTableProps) {
  const router = useRouter();
  const [stockItems, setStockItems] = useState(items);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "stock_asc" | "stock_desc" | "price_asc" | "price_desc">("name");
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? "Ordenar";
  const [sortOpen, setSortOpen] = useState(false);
  const [sortAlignLeft, setSortAlignLeft] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const [bulkAmountById, setBulkAmountById] = useState<Record<string, string>>({});
  const [queuedById, setQueuedById] = useState<Record<string, number>>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [configTarget, setConfigTarget] = useState<StockItem | null>(null);
  const [pending, startTransition] = useTransition();
  const { addToast } = useToast();
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setStockItems(items);
  }, [items]);

  useEffect(() => {
    if (!sortOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (sortRef.current?.contains(e.target as Node)) return;
      setSortOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [sortOpen]);

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
              .select("id, nombre_producto, quantity, unit_cost, for_sale, price, description, image_url, category, visible, created_at, shop_id, updated_at")
              .eq("shop_id", shopId)
              .order("nombre_producto", { ascending: true });
            if (Array.isArray(data)) setStockItems(data.map((d) => ({ ...d, quantity: d.quantity ?? 0, unit_cost: d.unit_cost ?? 0, price: Number(d.price) || 0, for_sale: d.for_sale, visible: d.visible })));
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
        return f.sort((a, b) => (a.unit_cost ?? 0) - (b.unit_cost ?? 0));
      case "price_desc":
        return f.sort((a, b) => (b.unit_cost ?? 0) - (a.unit_cost ?? 0));
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

  function handleToggleSale(item: StockItem) {
    if (!isOwnerOrAdmin) return;
    if (item.for_sale) {
      startTransition(async () => {
        const result = await toggleForSale(item.id, false, shopId);
        if (!result.success) {
          addToast(result.error, "error");
          return;
        }
        setStockItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, for_sale: false, visible: false } : i))
        );
        router.refresh();
      });
      return;
    }
    setConfigTarget(item);
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
    (sum, item) => sum + item.quantity * (item.unit_cost ?? 0),
    0
  );

  const lowStockCount = filtered.filter((i) => i.quantity < 5).length;
  const pendingQueueCount = Object.values(queuedById).filter((delta) => delta !== 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="group/sz keep-motion flex items-center gap-1.5 flex-1 min-w-0">
          <div className="relative flex items-center h-8 w-9 rounded-full border border-transparent bg-transparent overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/sz:w-52 group-hover/sz:border-zinc-200 group-hover/sz:bg-white dark:group-hover/sz:border-zinc-700 dark:group-hover/sz:bg-zinc-900 focus-within:w-52 focus-within:border-zinc-200 focus-within:bg-white dark:focus-within:border-zinc-700 dark:focus-within:bg-zinc-900 pointer-coarse:w-44 pointer-coarse:border-zinc-200 pointer-coarse:bg-white dark:pointer-coarse:border-zinc-700 dark:pointer-coarse:bg-zinc-900">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/sz:scale-110 group-hover/sz:text-violet-500 group-focus-within/sz:scale-110 group-focus-within/sz:text-violet-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              aria-label="Buscar producto"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
            />
          </div>
            <div className="relative shrink-0 keep-motion" ref={sortRef}>
            <button
              type="button"
              onClick={() => {
                const r = sortRef.current?.getBoundingClientRect();
                if (r) setSortAlignLeft(window.innerWidth - r.left >= 184);
                setSortOpen((o) => !o);
              }}
              aria-label={sortLabel}
              title={sortLabel}
              aria-expanded={sortOpen}
              className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-transparent bg-transparent text-xs font-medium transition-colors cursor-pointer select-none ${
                sortBy !== "name"
                  ? "text-violet-600 dark:text-violet-400"
                  : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              } ${sortOpen ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300" : ""}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortBy !== "name" && <span>{sortLabel}</span>}
            </button>
            {sortOpen && (
              <div className={`absolute top-full mt-1 z-20 w-40 max-w-[calc(100vw-1.5rem)] rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg overflow-hidden py-1 ${sortAlignLeft ? "left-0" : "right-0"}`}>
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setSortBy(opt.key);
                      setSortOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 text-left px-3 py-1.5 text-xs transition-colors cursor-pointer select-none ${
                      sortBy === opt.key
                        ? "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 font-medium"
                        : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/60"
                    }`}
                  >
                    {opt.label}
                    {sortBy === opt.key && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-1 justify-start sm:justify-end">
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => {
            const isLow = item.quantity < 5;
            const total = item.quantity * (item.unit_cost ?? 0);
            const canSell = storeEnabled && isOwnerOrAdmin;

            return (
              <div key={item.id} className={`group relative overflow-hidden bg-white dark:bg-zinc-900 rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 ${isLow ? "border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-950/20 hover:border-red-400 dark:hover:border-red-600" : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"}`}>
                <div className="p-4 pb-3 origin-bottom transition-transform duration-300 ease-in-out group-hover:scale-[0.97] group-focus-within:scale-[0.97]">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate leading-tight">{item.nombre_producto}</h3>
                    {isLow && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-600 text-white shadow-sm shadow-red-600/30 shrink-0">
                        Stock bajo
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-start gap-6">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Stock</p>
                      <p className={`mt-1 text-lg font-bold leading-none tabular-nums ${isLow ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                        {item.quantity}
                        <span className="text-xs font-medium text-zinc-400 ml-0.5">u</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Dinero en stock</p>
                      <p className="mt-1 text-sm font-semibold leading-none tabular-nums text-zinc-700 dark:text-zinc-300 pt-1">${total.toFixed(2)}</p>
                    </div>
                    {storeEnabled && item.for_sale && (
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Precio de venta</p>
                        <p className="mt-1 text-sm font-bold leading-none tabular-nums text-emerald-600 dark:text-emerald-400 pt-1">${Number(item.price || 0).toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {canSell && <div className="h-9 pointer-coarse:hidden" aria-hidden="true" />}

                {canSell && (
                  <div className="keep-motion absolute inset-x-0 bottom-0 z-10 h-9 px-4 flex items-center justify-between transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-9 group-focus-within:-translate-y-9 pointer-coarse:static pointer-coarse:h-auto pointer-coarse:pb-3 pointer-coarse:translate-y-0">
                    <button
                      type="button"
                      onClick={() => handleToggleSale(item)}
                      disabled={pending}
                      title={item.for_sale ? "Quitar de la tienda online" : "Publicar en la tienda online"}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer select-none ${
                        item.for_sale
                          ? "text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/30"
                          : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      En tienda
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfigTarget(item)}
                      disabled={pending}
                      title="Configurar venta online"
                      aria-label="Configurar venta online"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="keep-motion h-9 overflow-hidden rounded-b-2xl border-t border-transparent bg-transparent transition-colors duration-300 ease-in-out group-hover:border-zinc-100 group-hover:bg-zinc-50 dark:group-hover:border-zinc-800 dark:group-hover:bg-zinc-800/60 pointer-coarse:border-zinc-100 pointer-coarse:bg-zinc-50 dark:pointer-coarse:border-zinc-800 dark:pointer-coarse:bg-zinc-800/60">
                  <div className="keep-motion h-full flex items-center gap-1.5 px-4 opacity-0 translate-y-5 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto pointer-coarse:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:pointer-events-auto">
                    <input
                      type="number"
                      min="1"
                      value={bulkAmountById[item.id] ?? ""}
                      placeholder="1"
                      onChange={(e) => setBulkAmountById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      className="w-12 px-1.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-center text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label="Cantidad a ajustar"
                    />
                    <button
                      type="button"
                      onClick={() => handleBulkAdjust(item.id, 1)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-700/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer select-none active:scale-95 text-xs font-medium"
                      title="Agregar cantidad"
                      aria-label={`Agregar cantidad de ${item.nombre_producto}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="pointer-coarse:hidden">Agregar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkAdjust(item.id, -1)}
                      disabled={pending || item.quantity <= 0}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-700/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer select-none active:scale-95 text-xs font-medium"
                      title="Quitar cantidad"
                      aria-label={`Quitar cantidad de ${item.nombre_producto}`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                      <span className="pointer-coarse:hidden">Quitar</span>
                    </button>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={pending}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 dark:text-zinc-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer select-none active:scale-95"
                      title="Eliminar producto"
                      aria-label={`Eliminar ${item.nombre_producto}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
        message="Esta acción eliminará el producto del inventario y de la tienda."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={confirmDeleteProduct}
      />

      {configTarget && (
        <SaleConfigModal
          shopId={shopId}
          item={configTarget}
          open={Boolean(configTarget)}
          onClose={() => setConfigTarget(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
});

export default StockTable;
