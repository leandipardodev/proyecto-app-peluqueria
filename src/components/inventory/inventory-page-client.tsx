"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import StockTable from "./stock-table";
import AddProductModal from "./add-product-modal";

type StockItem = {
  id: string;
  nombre_producto: string;
  quantity: number;
  unit_cost: number;
};

interface InventoryPageClientProps {
  shopId: string;
  initialItems: StockItem[];
}

export default function InventoryPageClient({
  shopId,
  initialItems,
}: InventoryPageClientProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Inventario</h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 transition-colors cursor-pointer select-none"
        >
          <Plus className="w-4 h-4" />
          Nuevo producto
        </button>
      </div>

      <StockTable shopId={shopId} items={initialItems} />

      <AddProductModal shopId={shopId} open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
