"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import type { StockItem } from "@/lib/dashboard/inventory/inventory-actions";
import type { StoreOrder } from "@/lib/dashboard/store/store-actions";

interface InventoryPageClientProps {
  shopId: string;
  initialItems: StockItem[];
  initialOrders?: StoreOrder[];
  storeEnabled?: boolean;
  storeUrl?: string;
  initialError?: string | null;
  role?: string;
}

export default function InventoryPageClient({
  shopId,
  initialItems,
  initialOrders = [],
  storeEnabled = false,
  storeUrl = "",
  initialError,
  role = "staff",
}: InventoryPageClientProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [tab, setTab] = useState<InventoryTab>("products");
  const [modalOpen, setModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [storeConfirmOpen, setStoreConfirmOpen] = useState(false);
  const [storePending, startStoreTransition] = useTransition();
  const isOwnerOrAdmin = role !== "staff";

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
          <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white tracking-tight leading-none">Productos</h1>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Control de stock y venta online</p>
        </div>
        {isOwnerOrAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            {storeEnabled && storeUrl && (
              <a
                href={storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 px-4 py-2 rounded-2xl text-sm font-medium shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer select-none"
              >
                <ExternalLink className="w-4 h-4" />
                Ver tienda
              </a>
            )}
            <button
              type="button"
              onClick={() => (storeEnabled ? setStoreConfirmOpen(true) : toggleStore(true))}
              disabled={storePending}
              className={`inline-flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 px-4 py-2 rounded-2xl text-sm font-medium shadow-sm border transition-colors cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed ${
                storeEnabled
                  ? "text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                  : "text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
              }`}
            >
              <Power className="w-4 h-4" />
              {storeEnabled ? "Apagar tienda online" : "Activar tienda online"}
            </button>
            <button
              type="button"
              onClick={() => setBatchModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-700 px-4 py-2 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-50 dark:hover:bg-violet-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 transition-colors cursor-pointer select-none"
            >
              <Layers className="w-4 h-4" />
              Agregar múltiples
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 transition-colors cursor-pointer select-none"
            >
              <Plus className="w-4 h-4" />
              Nuevo producto
            </button>
          </div>
        )}
      </div>

      {tab === "products" || !storeEnabled ? (
        <>
          <StockTable shopId={shopId} items={initialItems} isOwnerOrAdmin={isOwnerOrAdmin} storeEnabled={storeEnabled} tab={tab} onTabChange={setTab} />
          <AddProductModal shopId={shopId} open={modalOpen} onClose={() => setModalOpen(false)} storeEnabled={storeEnabled} />
          <BatchAddProductModal shopId={shopId} open={batchModalOpen} onClose={() => setBatchModalOpen(false)} storeEnabled={storeEnabled} />
        </>
      ) : (
        <>
          {storeEnabled && (
            <div className="flex justify-center mb-6">
              <InventoryTabs tab={tab} onChange={setTab} />
            </div>
          )}
          <OrdersPanel shopId={shopId} orders={initialOrders} isOwnerOrAdmin={isOwnerOrAdmin} onChanged={() => router.refresh()} />
        </>
      )}

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
