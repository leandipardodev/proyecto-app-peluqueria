"use client";

import { useTransition } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Ban, RefreshCcw } from "lucide-react";
import { cancelStoreOrder, confirmStoreOrder, type StoreOrder } from "@/lib/dashboard/store/store-actions";
import { formatARS } from "@/lib/dashboard/store/format";
import { useToast } from "@/components/ui/toast";
import { StatePanel } from "@/components/ui/state-panel";

interface OrdersPanelProps {
  shopId: string;
  orders: StoreOrder[];
  isOwnerOrAdmin?: boolean;
  onChanged: () => void;
}

const SOFT = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const };

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50",
  pending_payment: "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/30 font-semibold",
  cancelled:
    "bg-zinc-100 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
  expired:
    "bg-red-600 text-white border-red-600 shadow-sm shadow-red-600/30 font-semibold",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Pagado",
  pending_payment: "Nuevo",
  cancelled: "Cancelado",
  expired: "Expirado",
};

export default function OrdersPanel({ shopId, orders, isOwnerOrAdmin = false, onChanged }: OrdersPanelProps) {
  const [pending, startTransition] = useTransition();
  const { addToast } = useToast();

  function handleConfirm(id: string) {
    startTransition(async () => {
      const result = await confirmStoreOrder(id, shopId);
      if (!result.success) {
        addToast(result.error, "error");
        return;
      }
      addToast("Pedido confirmado", "success");
      onChanged();
    });
  }

  function handleCancel(id: string) {
    startTransition(async () => {
      const result = await cancelStoreOrder(id, shopId);
      if (!result.success) {
        addToast(result.error, "error");
        return;
      }
      addToast("Pedido cancelado", "info");
      onChanged();
    });
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm py-16 px-6 text-center">
        <StatePanel
          title="Sin pedidos"
          description="Los pedidos de la tienda van a aparecer acá."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order, index) => {
        const statusStyle = STATUS_STYLES[order.status] || STATUS_STYLES.pending_payment;
        const statusLabel = STATUS_LABELS[order.status] || order.status;
        const isPending = order.status === "pending_payment";

        return (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SOFT, delay: Math.min(index * 0.05, 0.25) }}
            className={`bg-white dark:bg-zinc-900 rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow ${
              isPending
                ? "border-emerald-300 dark:border-emerald-500/40"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <div className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate leading-tight">
                    {order.customer_name}
                  </h3>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${statusStyle}`}>
                    {statusLabel}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500 truncate">
                  {new Date(order.created_at).toLocaleString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" · "}
                  {order.customer_email}
                  {" · "}
                  {order.payment_method === "bank_transfer" ? "Transferencia" : "Mercado Pago"}
                </p>
              </div>
              <div className="shrink-0 sm:text-right">
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Total</p>
                <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white pt-1">
                  {formatARS(order.total_amount)}
                </p>
              </div>
            </div>

            <div className="px-4 sm:px-5 py-3 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {order.order_items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 text-sm py-1.5 first:pt-0 last:pb-0">
                    <span className="text-zinc-700 dark:text-zinc-300">
                      <span className="font-medium tabular-nums">{item.quantity}</span> × {item.product_name}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium tabular-nums">
                      {formatARS(item.unit_price * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {isPending && isOwnerOrAdmin && (
              <div className="px-4 sm:px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleConfirm(order.id)}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Marcar pagado
                </button>
                <button
                  type="button"
                  onClick={() => handleCancel(order.id)}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Cancelar (devuelve stock)
                </button>
              </div>
            )}
          </motion.div>
        );
      })}

      <div className="flex items-center justify-center pt-2">
        <button
          type="button"
          onClick={onChanged}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
        >
          <RefreshCcw className="w-4 h-4" />
          Actualizar
        </button>
      </div>
    </div>
  );
}
