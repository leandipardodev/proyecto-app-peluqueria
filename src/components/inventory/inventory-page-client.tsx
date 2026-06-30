"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCcw, Layers } from "lucide-react";
import StockTable from "./stock-table";
import AddProductModal from "./add-product-modal";
import BatchAddProductModal from "./batch-add-product-modal";
import { StatePanel } from "@/components/ui/state-panel";

type StockItem = {
  id: string;
  nombre_producto: string;
  quantity: number;
  unit_cost: number;
};

interface InventoryPageClientProps {
  shopId: string;
  initialItems: StockItem[];
  initialError?: string | null;
  role?: string;
}

export default function InventoryPageClient({
  shopId,
  initialItems,
  initialError,
  role = "staff",
}: InventoryPageClientProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const isOwnerOrAdmin = role !== "staff";

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
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Inventario</h1>
        {isOwnerOrAdmin && (
          <div className="flex items-center gap-2">
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

      <StockTable shopId={shopId} items={initialItems} isOwnerOrAdmin={isOwnerOrAdmin} />

      <AddProductModal shopId={shopId} open={modalOpen} onClose={() => setModalOpen(false)} />
      <BatchAddProductModal shopId={shopId} open={batchModalOpen} onClose={() => setBatchModalOpen(false)} />
    </div>
  );
}
