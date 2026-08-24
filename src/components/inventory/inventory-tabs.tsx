"use client";

import { motion } from "framer-motion";
import { Package, ShoppingBag } from "lucide-react";

export type InventoryTab = "products" | "orders";

export default function InventoryTabs({ tab, onChange, pendingOrdersCount = 0, lowStockAlert = false }: { tab: InventoryTab; onChange: (tab: InventoryTab) => void; pendingOrdersCount?: number; lowStockAlert?: boolean }) {
  const tabs: Array<{ key: InventoryTab; label: string; Icon: typeof Package; dot?: string }> = [
    {
      key: "products",
      label: "Productos",
      Icon: Package,
      dot: lowStockAlert ? "bg-red-500" : undefined,
    },
    {
      key: "orders",
      label: "Pedidos",
      Icon: ShoppingBag,
      dot: pendingOrdersCount > 0 ? "bg-emerald-500 animate-pulse" : undefined,
    },
  ];

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80">
      {tabs.map(({ key, label, Icon, dot }) => {
        const active = tab === key;
        return (
          <motion.button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer select-none ${
              active
                ? "text-white"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {active && (
              <motion.span
                layoutId="inventory-tab-pill"
                className="absolute inset-0 rounded-xl bg-violet-600 shadow-sm"
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-2">
              <Icon className="w-4 h-4" />
              {label}
              {dot && <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
