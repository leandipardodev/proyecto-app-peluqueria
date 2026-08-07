"use client";

import { useTransition } from "react";
import { CheckCircle2, Ban, ShoppingBag, RefreshCcw } from "lucide-react";
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

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50",
  pending_payment:
    "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700/50",
  cancelled:
    "bg-zinc-100 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
  expired:
    "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-700/50",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Pagado",
  pending_payment: "Pendiente",
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
    <div className="space-y-4">
      {orders.map((order) => {
        const statusStyle = STATUS_STYLES[order.status] || STATUS_STYLES.pending_payment;
        const statusLabel = STATUS_LABELS[order.status] || order.status;
        const isPending = order.status === "pending_payment";

        return (
          <div
            key={order.id}
            className={`bg-white dark:bg-zinc-900 rounded-2xl border shadow-sm overflow-hidden transition-shadow ${
              isPending
                ? "border-emerald-300 dark:border-emerald-500/40 ring-2 ring-emerald-400/50 dark:ring-emerald-500/30 shadow-[0_0_24px_rgba(16,185,129,0.18)]"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <div className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-500 dark:from-violet-500 dark:to-violet-600 text-white shadow-lg shadow-violet-200/50 dark:shadow-violet-900/50 shrink-0">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {order.customer_name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {new Date(order.created_at).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" · "}
                    {order.customer_email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusStyle}`}>
                  {statusLabel}
                </span>
                {isPending && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Nuevo
                  </span>
                )}
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {order.payment_method === "bank_transfer" ? "Transferencia" : "Mercado Pago"}
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {formatARS(order.total_amount)}
                </span>
              </div>
            </div>

            <div className="px-4 sm:px-5 py-3 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800">
              <ul className="space-y-1">
                {order.order_items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {item.quantity} × {item.product_name}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Marcar pagado
                </button>
                <button
                  type="button"
                  onClick={() => handleCancel(order.id)}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Cancelar (devuelve stock)
                </button>
              </div>
            )}
          </div>
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
