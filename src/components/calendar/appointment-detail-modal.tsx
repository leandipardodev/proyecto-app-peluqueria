"use client";

import { X, Check, XCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteAppointment, redeemLoyaltyReward, updateAppointmentStatus } from "@/lib/dashboard/appointment-actions";
import { AnimatePresence, motion } from "framer-motion";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

const IOS_MODAL_SPRING = { stiffness: 460, damping: 34, mass: 0.65 };

type Appointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  deposit_amount?: number | null;
  loyalty_reward_applied?: boolean;
  loyalty_discount_percent_applied?: number;
  notes: string | null;
  customers: { nombre: string | null; email: string; telefono: string | null; loyalty_rewards_available?: number | null } | null;
  staff: { name: string; email: string } | null;
  services: { name: string; price: number; duration_minutes: number } | null;
};

interface AppointmentDetailModalProps {
  shopId: string;
  appointment: Appointment | null;
  onClose: () => void;
}

const statusFlow: Record<string, { label: string; nextStatus: string }[]> = {
  scheduled: [
    { label: "Confirmar", nextStatus: "confirmed" },
    { label: "Cancelar", nextStatus: "cancelled" },
  ],
  confirmed: [
    { label: "Completar", nextStatus: "completed" },
    { label: "Cancelar", nextStatus: "cancelled" },
  ],
  in_progress: [{ label: "Completar", nextStatus: "completed" }],
  completed: [],
  cancelled: [],
  "no_show": [],
};

function getTurnoStatusLabel(status: string, isPaid: boolean): string {
  if (status === "pending_payment") return "Pago pendiente";
  if (status === "scheduled" && !isPaid) return "A confirmar";
  if (status === "scheduled" && isPaid) return "Señado";
  if (status === "confirmed" || status === "in_progress") return "Confirmado";
  if (status === "completed") return "Completado";
  if (status === "cancelled" || status === "no_show") return "Cancelado";
  return status;
}

export default function AppointmentDetailModal({
  shopId,
  appointment,
  onClose,
}: AppointmentDetailModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState(appointment?.status || "");
  const [localPaid, setLocalPaid] = useState(appointment?.is_paid || false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    if (!appointment) return;
    setLocalStatus(appointment.status);
    setLocalPaid(appointment.is_paid);
    setError(null);
  }, [appointment]);

  useEffect(() => {
    if (!appointment) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [appointment, onClose]);

  function handleStatusChange(newStatus: string) {
    if (!appointment) return;
    setError(null);
    startTransition(async () => {
      const result = await updateAppointmentStatus(
        appointment.id,
        newStatus,
        undefined,
        shopId
      );
      if (result.success) {
        setLocalStatus(newStatus);
      } else {
        setError(result.error);
      }
    });
  }

  function handleTogglePaid() {
    if (!appointment) return;
    const newPaid = !localPaid;
    setError(null);
    startTransition(async () => {
      const result = await updateAppointmentStatus(
        appointment.id,
        localStatus,
        newPaid,
        shopId
      );
      if (result.success) {
        setLocalPaid(newPaid);
      } else {
        setError(result.error);
      }
    });
  }

  function handleDeleteAppointment() {
    if (!appointment) return;
    setDeleteConfirmOpen(true);
  }

  function confirmDeleteAppointment() {
    if (!appointment) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteAppointment(appointment.id, shopId);
      if (result.success) {
        setDeleteConfirmOpen(false);
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  function handleRedeemLoyaltyReward() {
    if (!appointment) return;
    setError(null);
    startTransition(async () => {
      const result = await redeemLoyaltyReward(appointment.id, shopId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      addToast(`Canje aplicado (${result.data?.discountPercent ?? 0}% de descuento).`, "success");
      onClose();
    });
  }

  const start = appointment ? new Date(appointment.start_time) : null;
  const end = appointment ? new Date(appointment.end_time) : null;

  const actions = statusFlow[localStatus] || [];

  return (
    <AnimatePresence>
      {appointment && (
        <motion.div
          ref={backdropRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/40 dark:bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === backdropRef.current) onClose();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <motion.div
            className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] w-full max-w-md mx-4 overflow-hidden transition-colors"
            initial={{ opacity: 0, y: 56, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.985 }}
            transition={{ type: "spring", ...IOS_MODAL_SPRING }}
          >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/20 dark:border-white/10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Detalle del Turno
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-white/40 dark:hover:bg-white/10 transition-colors cursor-pointer select-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg border border-red-200">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Cliente</span>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                {appointment.customers?.nombre || "—"}
              </p>
              {appointment.customers?.email && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {appointment.customers.email}
                </p>
              )}
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Staff</span>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                {appointment.staff?.name || "—"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Servicio</span>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                {appointment.services?.name || "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Precio</span>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                ${appointment.services?.price.toFixed(2) || "—"}
              </p>
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Seña</span>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
              {appointment.deposit_amount ? `$${appointment.deposit_amount.toFixed(2)}` : "Sin seña"}
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Horario</span>
            <p suppressHydrationWarning className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
              {start?.toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <p suppressHydrationWarning className="text-sm text-gray-600 dark:text-gray-400">
              {start?.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              —{" "}
              {end?.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>

          {appointment.notes && (
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Notas</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                {appointment.notes}
              </p>
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-800 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Estado</span>
              <span className="inline-flex items-center justify-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-200">
                {getTurnoStatusLabel(localStatus, localPaid)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Pago</span>
              <button
                onClick={handleTogglePaid}
                disabled={pending}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer select-none ${
                  localPaid ? "bg-green-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    localPaid ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {actions.length > 0 && (
              <div className="flex gap-2 pt-2">
                {actions.map(({ label, nextStatus }) => {
                  const isCancel = nextStatus === "cancelled";
                  return (
                    <button
                      key={nextStatus}
                      onClick={() => handleStatusChange(nextStatus)}
                      disabled={pending}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer select-none ${
                        isCancel
                          ? "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900"
                          : "text-white bg-violet-600 hover:bg-violet-700"
                      } disabled:opacity-50`}
                    >
                      {isCancel ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={handleDeleteAppointment}
                disabled={pending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 transition-colors cursor-pointer select-none disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar definitivamente
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Fidelizacion</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Canjes: {Math.max(0, Number(appointment.customers?.loyalty_rewards_available || 0))}
              </span>
            </div>

            {!appointment.loyalty_reward_applied && (
              <button
                onClick={handleRedeemLoyaltyReward}
                disabled={pending || Math.max(0, Number(appointment.customers?.loyalty_rewards_available || 0)) <= 0}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950 hover:bg-violet-100 dark:hover:bg-violet-900 transition-colors cursor-pointer select-none disabled:opacity-50"
              >
                Aplicar canje de fidelizacion
              </button>
            )}

            {appointment.loyalty_reward_applied && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Canje aplicado: {appointment.loyalty_discount_percent_applied || 0}% de descuento.
              </p>
            )}
          </div>
            </div>
          </motion.div>

          <ConfirmDialog
            open={deleteConfirmOpen}
            title="Eliminar turno"
            message="Esta accion elimina el turno definitivamente y no se puede deshacer."
            confirmLabel="Eliminar"
            danger
            onCancel={() => setDeleteConfirmOpen(false)}
            onConfirm={confirmDeleteAppointment}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
