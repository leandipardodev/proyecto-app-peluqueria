"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Clock, CreditCard } from "lucide-react";
import { confirmBankTransferBooking, rejectBankTransferBooking } from "@/lib/dashboard/appointments/pending-booking-actions";
import type { PendingBankTransfer } from "@/lib/dashboard/appointments/pending-booking-actions";

type Props = {
  transfers: PendingBankTransfer[];
  shopId: string;
};

function formatTimeLeft(expiresAt: string): string {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  if (diff <= 0) return "Expirado";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export default function BankTransfersClient({ transfers: initialTransfers, shopId }: Props) {
  const [transfers, setTransfers] = useState(initialTransfers);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<Record<string, string>>({});

  useEffect(() => {
    const update = () => {
      const map: Record<string, string> = {};
      for (const t of transfers) {
        map[t.id] = formatTimeLeft(t.expiresAt);
      }
      setTimeLeft(map);
    };
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [transfers]);

  async function handleConfirm(id: string) {
    setConfirming(id);
    const result = await confirmBankTransferBooking(id, shopId);
    if (result.success) {
      setTransfers((prev) => prev.filter((t) => t.id !== id));
    }
    setConfirming(null);
  }

  async function handleReject(id: string) {
    setRejecting(id);
    await rejectBankTransferBooking(id, shopId);
    setTransfers((prev) => prev.filter((t) => t.id !== id));
    setRejecting(null);
  }

  if (transfers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          No hay transferencias pendientes
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Cuando un cliente elija transferencia bancaria, aparecerá acá.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Transferencias pendientes
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {transfers.length} reserva{transfers.length !== 1 ? "s" : ""} esperando confirmación
        </p>
      </div>

      <AnimatePresence>
        {transfers.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {t.customerName}
                  </p>
                </div>
                <p className="text-xs text-zinc-500">{t.serviceName}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(t.startTime).toLocaleDateString("es-AR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}{" "}
                  a las{" "}
                  {new Date(t.startTime).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-lg font-bold text-emerald-600">
                    ${t.paymentAmount.toLocaleString("es-AR")}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <Clock className="w-3 h-3" />
                    {timeLeft[t.id] || "..."}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-shrink-0">
                <button
                  onClick={() => handleConfirm(t.id)}
                  disabled={confirming === t.id}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {confirming === t.id ? "..." : "Confirmar"}
                </button>
                <button
                  onClick={() => handleReject(t.id)}
                  disabled={rejecting === t.id}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  {rejecting === t.id ? "..." : "Rechazar"}
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
