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
  initialItems: StockItem[];
}

export default function InventoryPageClient({
  initialItems,
}: InventoryPageClientProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Inventario</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 transition-colors cursor-pointer select-none"
        >
          <Plus className="w-4 h-4" />
          Nuevo Producto
        </button>
      </div>

      <StockTable items={initialItems} />

      <AddProductModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
