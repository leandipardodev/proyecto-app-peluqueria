"use client";

import { X, Check, XCircle } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { updateAppointmentStatus } from "@/lib/dashboard/appointment-actions";

type Appointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  notes: string | null;
  customers: { name: string; email: string; phone: string | null } | null;
  staff: { name: string; email: string } | null;
  services: { name: string; price: number; duration_minutes: number } | null;
};

interface AppointmentDetailModalProps {
  appointment: Appointment | null;
  onClose: () => void;
}

const statusFlow: Record<string, { label: string; nextStatus: string }[]> = {
  scheduled: [
    { label: "Confirmar", nextStatus: "confirmed" },
    { label: "Cancelar", nextStatus: "cancelled" },
  ],
  confirmed: [
    { label: "Iniciar", nextStatus: "in_progress" },
    { label: "Cancelar", nextStatus: "cancelled" },
  ],
  in_progress: [{ label: "Completar", nextStatus: "completed" }],
  completed: [],
  cancelled: [],
  "no_show": [],
};

export default function AppointmentDetailModal({
  appointment,
  onClose,
}: AppointmentDetailModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState(appointment?.status || "");
  const [localPaid, setLocalPaid] = useState(appointment?.is_paid || false);

  useEffect(() => {
    if (!appointment) return;
    setLocalStatus(appointment.status);
    setLocalPaid(appointment.is_paid);
  }, [appointment]);

  useEffect(() => {
    if (!appointment) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [appointment, onClose]);

  if (!appointment) return null;

  function handleStatusChange(newStatus: string) {
    if (!appointment) return;
    startTransition(async () => {
      const result = await updateAppointmentStatus(
        appointment.id,
        newStatus
      );
      if (result.success) {
        setLocalStatus(newStatus);
      }
    });
  }

  function handleTogglePaid() {
    if (!appointment) return;
    const newPaid = !localPaid;
    startTransition(async () => {
      const result = await updateAppointmentStatus(
        appointment.id,
        localStatus,
        newPaid
      );
      if (result.success) {
        setLocalPaid(newPaid);
      }
    });
  }

  const start = new Date(appointment.start_time);
  const end = new Date(appointment.end_time);

  const actions = statusFlow[localStatus] || [];

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg dark:shadow-2xl w-full max-w-md mx-4 overflow-hidden transition-colors">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Detalle del Turno
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer select-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Cliente</span>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                {appointment.customers?.name || "—"}
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
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Horario</span>
            <p suppressHydrationWarning className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
              {start.toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <p suppressHydrationWarning className="text-sm text-gray-600 dark:text-gray-400">
              {start.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              —{" "}
              {end.toLocaleTimeString("es-AR", {
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
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-200">
                {localStatus === "scheduled" && "Programado"}
                {localStatus === "confirmed" && "Confirmado"}
                {localStatus === "in_progress" && "En curso"}
                {localStatus === "completed" && "Completado"}
                {localStatus === "cancelled" && "Cancelado"}
                {localStatus === "no_show" && "No asistió"}
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
          </div>
        </div>
      </div>
    </div>
  );
}
