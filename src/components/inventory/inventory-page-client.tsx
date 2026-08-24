"use client";

import { useState, useTransition, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { Plus, RefreshCcw, Layers, ExternalLink, Power } from "lucide-react";
import StockTable from "./stock-table";
import AddProductModal from "./add-product-modal";
import BatchAddProductModal from "./batch-add-product-modal";
import OrdersPanel from "./orders-panel";
import InventoryTabs, { type InventoryTab } from "./inventory-tabs";
import { StatePanel } from "@/components/ui/state-panel";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { setShopStoreEnabled } from "@/lib/dashboard/inventory/inventory-actions";
import { useNotifications } from "@/lib/dashboard/use-notifications";
import type { StockItem } from "@/lib/dashboard/inventory/inventory-actions";
import type { StoreOrder } from "@/lib/dashboard/store/store-actions";

const SOFT_TRANSITION: Transition = { duration: 0.3, ease: [0.22, 1, 0.36, 1] };

interface InventoryPageClientProps {  shopId: string;
  initialItems: StockItem[];
  initialOrders?: StoreOrder[];
  storeEnabled?: boolean;
  storeUrl?: string;
  initialError?: string | null;
  role?: string;
  initialTab?: InventoryTab;
}

export default function InventoryPageClient({
  shopId,
  initialItems,
  initialOrders = [],
  storeEnabled = false,
  storeUrl = "",
  initialError,
  role = "staff",
  initialTab = "products",
}: InventoryPageClientProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const liveNotifications = useNotifications();
  const pendingOrdersCount = liveNotifications.pendingOrders;
  const [tab, setTabState] = useState<InventoryTab>(initialTab);
  const [tabDir, setTabDir] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [storeConfirmOpen, setStoreConfirmOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const collapsedBtnRef = useRef<HTMLButtonElement>(null);
  const pairRef = useRef<HTMLDivElement>(null);
  const [addWidths, setAddWidths] = useState({ collapsed: 0, pair: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      setAddWidths({
        collapsed: collapsedBtnRef.current?.offsetWidth ?? 0,
        pair: pairRef.current?.offsetWidth ?? 0,
      });
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!addOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (addRef.current?.contains(e.target as Node)) return;
      setAddOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [addOpen]);
  const [storePending, startStoreTransition] = useTransition();
  const isOwnerOrAdmin = role !== "staff";

  const setTab = useCallback(
    (next: InventoryTab) => {
      setTabState((prev) => {
        if (next !== prev) setTabDir(next === "orders" ? 1 : -1);
        return next;
      });
      const url = new URL(window.location.href);
      if (next === "orders") url.searchParams.set("tab", "orders");
      else url.searchParams.delete("tab");
      router.replace(url.pathname + url.search, { scroll: false });
    },
    [router]
  );

  function toggleStore(enabled: boolean) {
    startStoreTransition(async () => {
      const result = await setShopStoreEnabled(enabled, shopId);
      if (!result.success) {
        addToast(result.error, "error");
        return;
      }
      addToast(enabled ? "Tienda online activada" : "Tienda online apagada", "success");
      router.refresh();
    });
  }

  if (initialError) {
    return (
      <StatePanel
        title="Error al cargar inventario"
        description={initialError}
        variant="error"
        action={
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40 hover:bg-rose-200 dark:hover:bg-rose-800/60 transition-colors cursor-pointer select-none"
          >
            <RefreshCcw className="w-4 h-4" />
            Reintentar
          </button>
        }
      />
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-3xl sm:text-5xl text-gray-900 dark:text-white leading-none lowercase pt-2" style={{ fontFamily: "var(--font-borel), cursive", letterSpacing: "-0.07em" }}>Productos</h1>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Control de stock y venta online</p>
        </div>
        {isOwnerOrAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <div
              ref={addRef}
              className="keep-motion relative inline-flex items-center"
              onMouseEnter={() => setAddOpen(true)}
              onMouseLeave={() => setAddOpen(false)}
              style={{
                width: addWidths.collapsed ? (addOpen ? addWidths.pair : addWidths.collapsed) : undefined,
                transition: "width 300ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <div
                ref={pairRef}
                aria-hidden={!addOpen}
                className={`absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-2 transition-opacity duration-200 ease-out ${
                  addOpen ? "opacity-100 delay-75" : "opacity-0 pointer-events-none"
                }`}
              >
                <button
                  type="button"
                  tabIndex={addOpen ? 0 : -1}
                  onClick={() => { setAddOpen(false); setBatchModalOpen(true); }}
                  className="inline-flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-700 px-4 py-2 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors cursor-pointer select-none whitespace-nowrap"
                >
                  <Layers className="w-4 h-4" />
                  Múltiples
                </button>
                <button
                  type="button"
                  tabIndex={addOpen ? 0 : -1}
                  onClick={() => { setAddOpen(false); setModalOpen(true); }}
                  className="inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 transition-colors cursor-pointer select-none whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo producto
                </button>
              </div>
              <button
                ref={collapsedBtnRef}
                type="button"
                aria-expanded={addOpen}
                aria-hidden={addOpen}
                tabIndex={addOpen ? -1 : 0}
                onClick={() => setAddOpen((o) => !o)}
                className={`inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 cursor-pointer select-none whitespace-nowrap transition-opacity duration-200 ${
                  addOpen ? "opacity-0 pointer-events-none" : "opacity-100"
                }`}
                style={{ transition: "opacity 200ms cubic-bezier(0.22, 1, 0.36, 1)" }}
              >
                <Plus className="w-4 h-4" />
                Agregar
              </button>
            </div>
            {storeEnabled && storeUrl && (
              <a
                href={storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ver tienda"
                title="Ver tienda"
                className="inline-flex items-center justify-center bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 px-3 py-2 rounded-2xl shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer select-none"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              type="button"
              onClick={() => (storeEnabled ? setStoreConfirmOpen(true) : toggleStore(true))}
              disabled={storePending}
              aria-label={storeEnabled ? "Apagar tienda online" : "Activar tienda online"}
              title={storeEnabled ? "Apagar tienda online" : "Activar tienda online"}
              className={`inline-flex items-center justify-center bg-white dark:bg-zinc-800 px-3 py-2 rounded-2xl shadow-sm border transition-colors cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed ${
                storeEnabled
                  ? "text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                  : "text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
              }`}
            >
              <Power className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {storeEnabled && (
        <div className="flex justify-center mb-6">
          <InventoryTabs tab={tab} onChange={setTab} pendingOrdersCount={pendingOrdersCount} lowStockAlert={liveNotifications.lowStock} />
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {tab === "products" || !storeEnabled ? (
          <motion.div
            key="products-panel"
            initial={{ opacity: 0, x: 16 * tabDir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 * tabDir }}
            transition={SOFT_TRANSITION}
          >
            <StockTable shopId={shopId} items={initialItems} isOwnerOrAdmin={isOwnerOrAdmin} storeEnabled={storeEnabled} />
            <AddProductModal shopId={shopId} open={modalOpen} onClose={() => setModalOpen(false)} storeEnabled={storeEnabled} />
            <BatchAddProductModal shopId={shopId} open={batchModalOpen} onClose={() => setBatchModalOpen(false)} storeEnabled={storeEnabled} />
          </motion.div>
        ) : (
          <motion.div
            key="orders-panel"
            initial={{ opacity: 0, x: 16 * tabDir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 * tabDir }}
            transition={SOFT_TRANSITION}
          >
            <OrdersPanel shopId={shopId} orders={initialOrders} isOwnerOrAdmin={isOwnerOrAdmin} onChanged={() => router.refresh()} />
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={storeConfirmOpen}
        title="Apagar tienda online"
        message="Se va a quitar el paso y el botón de tienda del flujo de reservas (/book). Los productos no se borran: podés volver a activarla cuando quieras."
        confirmLabel="Apagar"
        danger
        onCancel={() => setStoreConfirmOpen(false)}
        onConfirm={() => {
          setStoreConfirmOpen(false);
          toggleStore(false);
        }}
      />
    </div>
  );
}
