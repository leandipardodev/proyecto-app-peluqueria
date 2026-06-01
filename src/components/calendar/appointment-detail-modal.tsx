"use client";

import { X, Check, XCircle, Trash2, MessageCircle, UserRoundPen } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { deleteAppointment, patchAppointmentQuick, redeemLoyaltyReward, updateCustomerQuick } from "@/lib/dashboard/appointment-actions";
import { refundMpPayment } from "@/lib/payments/mercadopago-actions";
import { AnimatePresence, motion } from "framer-motion";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import GlassSelect from "@/components/ui/glass-select";
import { createPortal } from "react-dom";

const IOS_MODAL_SPRING = { stiffness: 460, damping: 34, mass: 0.65 };

type Appointment = {
  id: string;
  service_id?: string | null;
  staff_id?: string | null;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  deposit_amount?: number | null;
  loyalty_reward_applied?: boolean;
  loyalty_discount_percent_applied?: number;
  notes: string | null;
  customers: { id: string; nombre: string | null; email: string; telefono: string | null; loyalty_rewards_available?: number | null } | null;
  staff: { name: string | null; email: string | null } | null;
  services: { name: string; price: number; duration_minutes: number } | null;
};

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
};

type ServiceItem = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
};

interface AppointmentDetailModalProps {
  shopId: string;
  appointment: Appointment | null;
  staff: StaffMember[];
  services: ServiceItem[];
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
  staff,
  services,
  onClose,
}: AppointmentDetailModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState(appointment?.status || "");
  const [localPaid, setLocalPaid] = useState(appointment?.is_paid || false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState(appointment?.staff_id || "");
  const [localRewardsAvailable, setLocalRewardsAvailable] = useState(
    Math.max(0, Number(appointment?.customers?.loyalty_rewards_available || 0))
  );
  const [localRewardApplied, setLocalRewardApplied] = useState(Boolean(appointment?.loyalty_reward_applied));
  const [showCustomerEditor, setShowCustomerEditor] = useState(false);
  const [customerName, setCustomerName] = useState(appointment?.customers?.nombre || "");
  const [customerEmail, setCustomerEmail] = useState(appointment?.customers?.email || "");
  const [customerPhone, setCustomerPhone] = useState(appointment?.customers?.telefono || "");
  const [customerBirthday, setCustomerBirthday] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [customerVip, setCustomerVip] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState(appointment?.service_id || "");
  const [startDateTimeLocal, setStartDateTimeLocal] = useState("");
  const { addToast } = useToast();
  const patchDraftRef = useRef<{ status?: string; isPaid?: boolean; staffId?: string | null; serviceId?: string; startTime?: string }>({});

  function toDateTimeLocalValue(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!appointment) return;
    setLocalStatus(appointment.status);
    setLocalPaid(appointment.is_paid);
    setSelectedStaffId(appointment.staff_id || "");
    setLocalRewardsAvailable(Math.max(0, Number(appointment.customers?.loyalty_rewards_available || 0)));
    setLocalRewardApplied(Boolean(appointment.loyalty_reward_applied));
    setCustomerName(appointment.customers?.nombre || "");
    setCustomerEmail(appointment.customers?.email || "");
    setCustomerPhone(appointment.customers?.telefono || "");
    setSelectedServiceId(appointment.service_id || "");
    setStartDateTimeLocal(toDateTimeLocalValue(appointment.start_time));
    setShowCustomerEditor(false);
    setHasPendingChanges(false);
    setError(null);
  }, [appointment]);

  const requestClose = useCallback(() => {
    if (hasPendingChanges) {
      setCloseConfirmOpen(true);
      return;
    }
    onClose();
  }, [hasPendingChanges, onClose]);

  useEffect(() => {
    if (!appointment) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [appointment, requestClose]);

  function queueAppointmentPatch(next: { status?: string; isPaid?: boolean; staffId?: string | null; serviceId?: string; startTime?: string }) {
    patchDraftRef.current = { ...patchDraftRef.current, ...next };
    setHasPendingChanges(true);
  }

  function handleSaveAppointment() {
    if (!appointment) return;
    setError(null);

    const payload = { ...patchDraftRef.current };
    patchDraftRef.current = {};
    setHasPendingChanges(false);

    if (payload.status === undefined && payload.isPaid === undefined && payload.staffId === undefined && payload.serviceId === undefined && payload.startTime === undefined) {
      addToast("No hay cambios pendientes", "info");
      return;
    }

    startTransition(async () => {
      const result = await patchAppointmentQuick(appointment.id, payload, shopId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      addToast("Turno guardado", "success");
      onClose();
    });
  }

  function handleServiceChange(value: string) {
    setSelectedServiceId(value);
    setError(null);
    queueAppointmentPatch({ serviceId: value });
  }

  function handleStartDateTimeChange(value: string) {
    setStartDateTimeLocal(value);
    setError(null);
    if (!value) return;
    queueAppointmentPatch({ startTime: new Date(value).toISOString() });
  }

  function handleStatusChange(newStatus: string) {
    if (!appointment) return;
    setError(null);
    setLocalStatus(newStatus);
    queueAppointmentPatch({ status: newStatus });
  }

  function handleTogglePaid() {
    if (!appointment) return;
    const newPaid = !localPaid;
    setError(null);
    setLocalPaid(newPaid);
    queueAppointmentPatch({ isPaid: newPaid });
  }

  function handleDeleteAppointment() {
    if (!appointment) return;
    setDeleteConfirmOpen(true);
  }

  function handleRefundClick() {
    if (!appointment) return;
    setRefundConfirmOpen(true);
  }

  async function handleConfirmRefund() {
    if (!appointment) return;
    setError(null);
    setRefundConfirmOpen(false);
    startTransition(async () => {
      const result = await refundMpPayment(appointment.id);
      if (result.success) {
        setLocalPaid(false);
        addToast("Reembolso procesado", "success");
      } else {
        setError(result.error);
        addToast(result.error || "Error al reembolsar", "error");
      }
    });
  }

  function handleStaffChange(value: string) {
    if (!appointment) return;
    setSelectedStaffId(value);
    setError(null);
    queueAppointmentPatch({ staffId: value || null });
  }

  async function handleSaveCustomerQuick() {
    if (!appointment?.customers) return;
    setError(null);
    startTransition(async () => {
      const result = await updateCustomerQuick(
        appointment.customers!.id,
        {
          nombre: customerName,
          email: customerEmail,
          telefono: customerPhone || null,
          cumpleaños: customerBirthday || null,
          observaciones_tecnicas: customerNotes || null,
          es_vip: customerVip,
        },
        shopId,
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      addToast("Cliente actualizado", "success");
      setShowCustomerEditor(false);
    });
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
      setLocalRewardsAvailable((prev) => Math.max(0, prev - 1));
      setLocalRewardApplied(true);
      addToast(`Canje aplicado (${result.data?.discountPercent ?? 0}% de descuento).`, "success");
    });
  }

  const start = appointment ? new Date(appointment.start_time) : null;
  const end = appointment ? new Date(appointment.end_time) : null;

  const actions = statusFlow[localStatus] || [];

  const modalNode = (
    <AnimatePresence>
      {appointment && (
        <motion.div
          ref={backdropRef}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-y-contain bg-white/40 p-3 dark:bg-black/40 backdrop-blur-sm sm:p-4"
          onClick={(e) => {
            if (e.target === backdropRef.current) requestClose();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <motion.div
            className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] w-full max-w-md overflow-hidden max-h-[88dvh] flex flex-col transition-colors"
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
            onClick={requestClose}
            className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-white/40 dark:hover:bg-white/10 transition-colors cursor-pointer select-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto overscroll-y-contain">
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
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {appointment.customers?.email && <p className="text-xs text-gray-500 dark:text-gray-400">{appointment.customers.email}</p>}
                {appointment.customers?.telefono && (
                  <a
                    href={`https://wa.me/${appointment.customers.telefono.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                  >
                    <MessageCircle className="h-3 w-3" /> WhatsApp
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setShowCustomerEditor((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                >
                  <UserRoundPen className="h-3 w-3" /> Editar cliente
                </button>
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Servicio</span>
              <div className="mt-1.5">
                <GlassSelect
                  options={services.map((svc) => ({ value: svc.id, label: `${svc.name} - $${svc.price}` }))}
                  value={selectedServiceId}
                  onChange={handleServiceChange}
                  placeholder="Seleccionar servicio"
                  className="w-full"
                />
              </div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Staff</span>
              <div className="mt-1.5">
                <GlassSelect
                  options={[
                    { value: "", label: "Sin peluquero asignado (disponible)" },
                    ...staff.map((s) => ({ value: s.id, label: s.name || s.email || "Sin nombre" })),
                  ]}
                  value={selectedStaffId}
                  onChange={handleStaffChange}
                  placeholder="Sin peluquero asignado"
                  className="w-full"
                />
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Fecha y hora</span>
              <input
                type="datetime-local"
                value={startDateTimeLocal}
                onChange={(e) => handleStartDateTimeChange(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/25 bg-white/45 px-3 py-2 text-sm text-gray-900 outline-none backdrop-blur-md dark:border-white/15 dark:bg-white/10 dark:text-gray-100"
              />
            </div>
          </div>

          {showCustomerEditor && (
            <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-zinc-300">Editar cliente</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre" className="rounded-xl border px-3 py-2 text-sm" />
                <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email" className="rounded-xl border px-3 py-2 text-sm" />
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Telefono" className="rounded-xl border px-3 py-2 text-sm" />
                <input value={customerBirthday} onChange={(e) => setCustomerBirthday(e.target.value)} type="date" className="rounded-xl border px-3 py-2 text-sm" />
                <input value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} placeholder="Observaciones" className="rounded-xl border px-3 py-2 text-sm sm:col-span-2" />
                <label className="inline-flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={customerVip} onChange={(e) => setCustomerVip(e.target.checked)} /> VIP</label>
              </div>
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => void handleSaveCustomerQuick()} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white">Guardar cliente</button>
              </div>
            </div>
          )}

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
              <div className="flex items-center gap-2">
                {localPaid && (
                  <button
                    onClick={handleRefundClick}
                    disabled={pending}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 cursor-pointer select-none"
                  >
                    Reembolsar
                  </button>
                )}
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
                Canjes: {localRewardsAvailable}
              </span>
            </div>

            <div className={`grid gap-2 ${!localRewardApplied ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
              {!localRewardApplied && (
                <button
                  onClick={handleRedeemLoyaltyReward}
                  disabled={pending || localRewardsAvailable <= 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-extrabold tracking-wide text-white bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-700 shadow-[0_10px_26px_rgba(124,58,237,0.35)] hover:brightness-105 transition-all cursor-pointer select-none disabled:opacity-50 disabled:shadow-none"
                >
                  {localRewardsAvailable > 0 ? `Usar canje ahora (${localRewardsAvailable})` : "Usar canje ahora"}
                </button>
              )}

              <button
                onClick={handleSaveAppointment}
                disabled={pending || !hasPendingChanges}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-violet-700 dark:text-violet-200 bg-violet-50/90 dark:bg-violet-950/45 border border-violet-200/80 dark:border-violet-800/60 hover:bg-violet-100/90 dark:hover:bg-violet-900/50 transition-all cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Guardar turno
              </button>
            </div>

            {localRewardApplied && (
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

          <ConfirmDialog
            open={closeConfirmOpen}
            title="Descartar cambios"
            message="Tenes cambios sin guardar en este turno. Si cerras ahora, se perderan."
            confirmLabel="Descartar"
            onCancel={() => setCloseConfirmOpen(false)}
            onConfirm={() => {
              setCloseConfirmOpen(false);
              patchDraftRef.current = {};
              setHasPendingChanges(false);
              onClose();
            }}
          />

          <ConfirmDialog
            open={refundConfirmOpen}
            title="Reembolsar pago"
            message="Se reembolsara el p completo de Mercado Pago al cliente y el turno quedara como no pagado."
            confirmLabel="Reembolsar"
            danger
            onCancel={() => setRefundConfirmOpen(false)}
            onConfirm={handleConfirmRefund}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!portalReady || typeof document === "undefined") return null;
  return createPortal(modalNode, document.body);
}
