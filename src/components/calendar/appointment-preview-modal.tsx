"use client";

import { X, Trash2, MessageCircle, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { deleteAppointment, patchAppointmentQuick } from "@/lib/dashboard/appointments/actions";
import { motion } from "framer-motion";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { createPortal } from "react-dom";
import { getUserFriendlyError } from "@/lib/dashboard/appointments/errors";

const SPRING = { stiffness: 460, damping: 34, mass: 0.65 };

type Appointment = {
  id: string;
  service_id?: string | null;
  staff_id?: string | null;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  was_pending_payment?: boolean;
  deposit_amount?: number | null;
  recurring_group_id: string | null;
  notes: string | null;
  customers: { id: string; nombre: string | null; email: string; telefono: string | null } | null;
  staff: { name: string | null; email: string | null } | null;
  services: { name: string; price: number; duration_minutes: number } | null;
};

type StaffMember = { id: string; name: string | null; email: string | null };

const statusFlow: Record<string, { label: string; nextStatus: string; setIsPaid?: boolean }[]> = {
  scheduled: [{ label: "Confirmar", nextStatus: "confirmed" }],
  confirmed: [{ label: "Completar", nextStatus: "completed" }],
  in_progress: [{ label: "Completar", nextStatus: "completed" }],
  completed: [
    { label: "No se cobró", nextStatus: "pending_payment", setIsPaid: false },
    { label: "No se atendió", nextStatus: "cancelled", setIsPaid: false },
    { label: "Reabrir", nextStatus: "in_progress" },
  ],
  cancelled: [],
  no_show: [],
};

function getTurnoStatusLabel(status: string): string {
  if (status === "pending_payment") return "Pago pendiente";
  if (status === "scheduled") return "Nuevo";
  if (status === "confirmed" || status === "in_progress") return "Confirmado";
  if (status === "completed") return "Completado";
  if (status === "cancelled" || status === "no_show") return "Cancelado";
  return status;
}

function statusColor(status: string): string {
  const label = getTurnoStatusLabel(status);
  if (label === "Completado") return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200";
  if (label === "Confirmado") return "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200";
  if (label === "Nuevo") return "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200";
  if (label === "Cancelado") return "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200";
  return "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300";
}

function capitalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  const parts = d.toLocaleTimeString("es-AR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return parts;
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const weekday = start.toLocaleDateString("es-AR", { weekday: "long", timeZone: "America/Argentina/Buenos_Aires" });
  const day = start.toLocaleDateString("es-AR", { day: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
  const month = start.toLocaleDateString("es-AR", { month: "long", timeZone: "America/Argentina/Buenos_Aires" });
  const sTime = formatTimeShort(startIso);
  const eTime = formatTimeShort(endIso);
  return `${weekday} ${day} de ${month}, de ${sTime} a ${eTime}`;
}

interface AppointmentPreviewModalProps {
  appointment: Appointment | null;
  shopId: string;
  staff: StaffMember[];
  onClose: () => void;
  onEdit: () => void;
  onSuccess?: () => void;
  onDeleted?: (recurringGroupId?: string) => void;
}

export default function AppointmentPreviewModal({
  appointment,
  shopId,
  staff,
  onClose,
  onEdit,
  onSuccess,
  onDeleted,
}: AppointmentPreviewModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState(appointment?.status || "");
  const [localPaid, setLocalPaid] = useState(appointment?.is_paid || false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    setLocalStatus(appointment?.status || "");
    setLocalPaid(appointment?.is_paid || false);
    setError(null);
  }, [appointment]);

  const requestClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!appointment) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [appointment, requestClose]);

  function handleStatusChange(newStatus: string, isPaid?: boolean) {
    if (!appointment) return;
    setError(null);
    setLocalStatus(newStatus);
    if (isPaid !== undefined) setLocalPaid(isPaid);
    startTransition(async () => {
      const result = await patchAppointmentQuick(
        appointment.id,
        { status: newStatus, ...(isPaid !== undefined ? { isPaid } : {}) },
        shopId,
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      addToast("Turno actualizado", "success");
      onSuccess?.();
    });
  }

  function handleTogglePaid() {
    if (!appointment) return;
    const newPaid = !localPaid;
    setError(null);
    setLocalPaid(newPaid);
    startTransition(async () => {
      const result = await patchAppointmentQuick(
        appointment.id,
        { isPaid: newPaid },
        shopId,
      );
      if (!result.success) {
        setError(result.error);
        setLocalPaid(localPaid);
        return;
      }
      addToast(newPaid ? "Marcado como pagado" : "Marcado como no pagado", "success");
      onSuccess?.();
    });
  }

  function handleDeleteAppointment() {
    setDeleteConfirmOpen(true);
  }

  function confirmDeleteAppointment() {
    if (!appointment) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAppointment(appointment.id, shopId);
      if (result.success) {
        setDeleteConfirmOpen(false);
        onDeleted?.();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  if (!appointment) return null;

  const actions = statusFlow[localStatus] || [];
  const staffMember = staff.find((s) => s.id === appointment.staff_id);

  if (!portalReady || typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/20 p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === backdropRef.current) requestClose();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl shadow-black/5 dark:shadow-black/30 w-full max-w-lg overflow-hidden"
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", ...SPRING }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white truncate tracking-tight leading-tight">
              {capitalizeName(appointment.customers?.nombre || "Sin cliente")}
            </h2>
            <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 uppercase tracking-wider ${statusColor(localStatus)}`}>
              {getTurnoStatusLabel(localStatus)}
            </span>
          </div>
          <button
            onClick={requestClose}
            className="p-2 rounded-xl text-zinc-300 hover:text-zinc-500 dark:hover:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-5 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm px-4 py-2.5 rounded-2xl">
              {getUserFriendlyError(error)}
            </div>
          )}

          {/* Date & time */}
          <p className="text-[15px] text-gray-600 dark:text-gray-300">
            {formatDateRange(appointment.start_time, appointment.end_time)}
          </p>

          {/* Info rows */}
          <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {/* Service */}
            {appointment.services?.name && (
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[15px] text-zinc-400 dark:text-zinc-500 w-20 shrink-0 lowercase" style={{ fontFamily: "'Borel', cursive" }}>Servicio</span>
                <div className="flex items-center gap-2 min-w-0 text-right">
                  {appointment.services.duration_minutes && (
                    <span className="text-[11px] text-zinc-300 dark:text-zinc-600 tabular-nums shrink-0">
                      {appointment.services.duration_minutes}&apos;
                    </span>
                  )}
                  <span className="text-[15px] font-medium text-gray-900 dark:text-white truncate">
                    {appointment.services.name}
                  </span>
                </div>
              </div>
            )}

            {/* Staff */}
            <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[15px] text-zinc-400 dark:text-zinc-500 w-20 shrink-0 lowercase" style={{ fontFamily: "'Borel', cursive" }}>Profesional</span>
              <span className="text-[15px] font-medium text-gray-900 dark:text-white capitalize text-right">
                {staffMember?.name ? capitalizeName(staffMember.name) : "Sin asignar"}
              </span>
            </div>

            {/* Price */}
            {appointment.services?.price != null && (
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[15px] text-zinc-400 dark:text-zinc-500 w-20 shrink-0 lowercase" style={{ fontFamily: "'Borel', cursive" }}>Precio</span>
                <span className="text-[15px] font-medium text-gray-900 dark:text-white tabular-nums text-right">
                  ${appointment.services.price.toLocaleString("es-AR")}
                </span>
              </div>
            )}

            {/* Deposit */}
            {appointment.deposit_amount != null && appointment.deposit_amount > 0 && (
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[15px] text-zinc-400 dark:text-zinc-500 w-20 shrink-0 lowercase" style={{ fontFamily: "'Borel', cursive" }}>Seña</span>
                <span className="text-[15px] font-medium text-amber-600 dark:text-amber-400 tabular-nums text-right">
                  ${appointment.deposit_amount.toLocaleString("es-AR")}
                </span>
              </div>
            )}

            {/* Notes */}
            {appointment.notes && (
              <div className="flex items-start justify-between gap-4 px-4 py-3.5">
                <span className="text-[15px] text-zinc-400 dark:text-zinc-500 w-20 shrink-0 pt-0.5 lowercase" style={{ fontFamily: "'Borel', cursive" }}>Notas</span>
                <p className="text-[15px] text-gray-600 dark:text-gray-400 text-right leading-relaxed">{appointment.notes}</p>
              </div>
            )}
          </div>

          {/* Pending payment warning */}
          {appointment.was_pending_payment && (
            <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/50 dark:border-rose-800/30 rounded-2xl px-4 py-2.5">
              Este turno quedaba con pago pendiente cuando se auto-completó.
            </p>
          )}
        </div>

        {/* Actions footer */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/80 space-y-3.5">
          {/* Status action + Payment toggle row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {actions.map(({ label, nextStatus, setIsPaid }) => {
                const isPrimary = nextStatus === "completed";
                return (
                  <button
                    key={nextStatus}
                    onClick={() => handleStatusChange(nextStatus, setIsPaid)}
                    disabled={pending}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 cursor-pointer select-none ${
                      isPrimary
                        ? "text-white bg-violet-600 hover:bg-violet-700 shadow-sm shadow-violet-600/25"
                        : "text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Payment toggle */}
            <button
              onClick={handleTogglePaid}
              disabled={pending}
              className="flex items-center gap-2.5 cursor-pointer select-none disabled:opacity-50"
            >
              <span className={`text-sm font-medium transition-colors ${localPaid ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-300 dark:text-zinc-600"}`}>
                Pagado
              </span>
              <div
                className={`relative w-10 h-[22px] rounded-full transition-colors ${
                  localPaid ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                    localPaid ? "translate-x-[18px]" : "translate-x-0"
                  }`}
                />
              </div>
            </button>
          </div>

          {/* Icon buttons row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {/* Delete */}
              <button
                onClick={handleDeleteAppointment}
                disabled={pending}
                title="Eliminar turno"
                className="p-2.5 rounded-xl text-zinc-300 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer select-none disabled:opacity-50"
              >
                <Trash2 className="w-[18px] h-[18px]" />
              </button>

              {/* WhatsApp */}
              {appointment.customers?.telefono && (
                <a
                  href={`https://wa.me/${appointment.customers.telefono.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir WhatsApp"
                  className="p-2.5 rounded-xl text-zinc-300 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                >
                  <MessageCircle className="w-[18px] h-[18px]" />
                </a>
              )}
            </div>

            {/* Edit button - prominent */}
            <button
              onClick={onEdit}
              disabled={pending}
              title="Editar turno"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors cursor-pointer select-none disabled:opacity-50"
            >
              <Pencil className="w-4 h-4" />
              Editar
            </button>
          </div>
        </div>
      </motion.div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Eliminar turno"
        message="Esta acción elimina el turno definitivamente y no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteAppointment}
      />
    </motion.div>,
    document.body,
  );
}
