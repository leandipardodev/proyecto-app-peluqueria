"use client";

import { Package, ShoppingBag } from "lucide-react";

export type InventoryTab = "products" | "orders";

const tabButtonClass = (active: boolean) =>
  `inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer select-none ${
    active
      ? "bg-violet-600 text-white shadow-sm"
      : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
  }`;

export default function InventoryTabs({ tab, onChange }: { tab: InventoryTab; onChange: (tab: InventoryTab) => void }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80">
      <button type="button" onClick={() => onChange("products")} className={tabButtonClass(tab === "products")}>
        <Package className="w-4 h-4" />
        Productos
      </button>
      <button type="button" onClick={() => onChange("orders")} className={tabButtonClass(tab === "orders")}>
        <ShoppingBag className="w-4 h-4" />
        Pedidos
      </button>
    </div>
  );
}
