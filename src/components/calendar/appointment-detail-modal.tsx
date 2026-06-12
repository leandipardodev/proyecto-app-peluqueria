"use client";

import { X, Check, Trash2, MessageCircle, UserRoundPen, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition, useMemo } from "react";
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
  onSuccess?: () => void;
}

const statusFlow: Record<string, { label: string; nextStatus: string }[]> = {
  scheduled: [
    { label: "Confirmar", nextStatus: "confirmed" },
  ],
  confirmed: [
    { label: "Completar", nextStatus: "completed" },
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

function statusColor(status: string, isPaid: boolean): string {
  const label = getTurnoStatusLabel(status, isPaid);
  if (label === "Completado") return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200";
  if (label === "Confirmado") return "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200";
  if (label === "Señado") return "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200";
  if (label === "Cancelado") return "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200";
  return "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300";
}

function toDateTimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AppointmentDetailModal({
  shopId,
  appointment,
  staff,
  services,
  onClose,
  onSuccess,
}: AppointmentDetailModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState(appointment?.status || "");
  const [localPaid, setLocalPaid] = useState(appointment?.is_paid || false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
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
  const [selectedServiceId, setSelectedServiceId] = useState(appointment?.service_id || "");
  const [startDateTimeLocal, setStartDateTimeLocal] = useState("");
  const serviceSearchRef = useRef<HTMLInputElement>(null);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [serviceSearchOpen, setServiceSearchOpen] = useState(false);
  const [serviceDropdownStyle, setServiceDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const { addToast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersionRef = useRef(0);

  const pendingChangesRef = useRef<{ status?: string; isPaid?: boolean; staffId?: string | null; serviceId?: string; startTime?: string }>({});

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!serviceSearchOpen) return;
    function handleMove(e: Event) {
      if (serviceDropdownRef.current && serviceDropdownRef.current.contains(e.target as Node)) return;
      setServiceSearchOpen(false);
    }
    window.addEventListener("scroll", handleMove, true);
    window.addEventListener("resize", handleMove);
    return () => {
      window.removeEventListener("scroll", handleMove, true);
      window.removeEventListener("resize", handleMove);
    };
  }, [serviceSearchOpen]);

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
    setError(null);
    setSaveState("idle");
    pendingChangesRef.current = {};
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

  const flushSave = useCallback(() => {
    if (!appointment) return;
    const payload = { ...pendingChangesRef.current };
    if (Object.keys(payload).length === 0) return;

    pendingChangesRef.current = {};
    const version = ++saveVersionRef.current;
    setSaveState("saving");

    startTransition(async () => {
      const result = await patchAppointmentQuick(appointment.id, payload, shopId);
      if (version !== saveVersionRef.current) return;
      if (!result.success) {
        setError(result.error);
        setSaveState("idle");
        return;
      }
      setSaveState("saved");
      onSuccess?.();
      setTimeout(() => setSaveState("idle"), 2000);
    });
  }, [appointment, shopId, onSuccess]);

  const queueChange = useCallback((next: { status?: string; isPaid?: boolean; staffId?: string | null; serviceId?: string; startTime?: string }) => {
    pendingChangesRef.current = { ...pendingChangesRef.current, ...next };
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flushSave, 800);
  }, [flushSave]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const filteredServices = useMemo(() => {
    if (!serviceSearchQuery.trim()) return services;
    const q = serviceSearchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return services.filter((s) =>
      s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
    );
  }, [services, serviceSearchQuery]);

  function handleServiceSelect(id: string) {
    setSelectedServiceId(id);
    setServiceSearchQuery("");
    setServiceSearchOpen(false);
    const svc = services.find((s) => s.id === id);
    if (svc && appointment) {
      const dur = svc.duration_minutes;
      const newEnd = new Date(new Date(startDateTimeLocal).getTime() + dur * 60000);
      queueChange({ serviceId: id, startTime: new Date(startDateTimeLocal).toISOString() });
    }
  }

  function handleStartDateTimeChange(value: string) {
    setStartDateTimeLocal(value);
    if (!value) return;
    const selectedSvc = services.find((s) => s.id === selectedServiceId);
    const dur = selectedSvc?.duration_minutes || 60;
    const newEnd = new Date(new Date(value).getTime() + dur * 60000);
    queueChange({ startTime: new Date(value).toISOString() });
  }

  function handleStatusChange(newStatus: string) {
    if (!appointment) return;
    setError(null);
    setLocalStatus(newStatus);
    queueChange({ status: newStatus });
  }

  function handleTogglePaid() {
    if (!appointment) return;
    const newPaid = !localPaid;
    setError(null);
    setLocalPaid(newPaid);
    queueChange({ isPaid: newPaid });
  }

  function handleStaffChange(value: string) {
    if (!appointment) return;
    setSelectedStaffId(value);
    setError(null);
    queueChange({ staffId: value || null });
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

  const saveIndicator = saveState === "saving"
    ? "Guardando..."
    : saveState === "saved"
      ? "Guardado"
      : null;

  const modalNode = (
    <AnimatePresence>
      {appointment && (
        <motion.div
          ref={backdropRef}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/20 p-3 sm:p-4"
          onClick={(e) => {
            if (e.target === backdropRef.current) requestClose();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-lg overflow-hidden max-h-[88dvh] flex flex-col"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", ...IOS_MODAL_SPRING }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Turno
                </h2>
                <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${statusColor(localStatus, localPaid)}`}>
                  {getTurnoStatusLabel(localStatus, localPaid)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {saveIndicator && (
                  <span className={`text-xs ${
                    saveState === "saving"
                      ? "text-zinc-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {saveIndicator}
                  </span>
                )}
                <button
                  onClick={requestClose}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto overscroll-y-contain flex-1 space-y-5">
              {error && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm px-4 py-2 rounded-xl">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wide">
                    Cliente
                  </span>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                    {appointment.customers?.nombre || "—"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {appointment.customers?.email && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{appointment.customers.email}</span>
                    )}
                    {appointment.customers?.telefono && (
                      <a
                        href={`https://wa.me/${appointment.customers.telefono.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                      >
                        <MessageCircle className="h-3 w-3" /> WhatsApp
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowCustomerEditor((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
                    >
                      <UserRoundPen className="h-3 w-3" /> Editar
                    </button>
                  </div>
                </div>

                {showCustomerEditor && (
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
                    <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Editar cliente</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre" className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
                      <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email" className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
                      <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Teléfono" className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
                      <input value={customerBirthday} onChange={(e) => setCustomerBirthday(e.target.value)} type="date" className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
                      <input value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} placeholder="Observaciones" className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 sm:col-span-2" />
                      <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 sm:col-span-2">
                        <input type="checkbox" checked={customerVip} onChange={(e) => setCustomerVip(e.target.checked)} className="rounded" />
                        VIP
                      </label>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => void handleSaveCustomerQuick()} className="rounded-lg bg-zinc-900 dark:bg-white px-3 py-2 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors cursor-pointer select-none">
                        Guardar cliente
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wide">
                    Servicio
                  </span>
                  <div className="mt-1.5 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none z-10" />
                    <input
                      ref={serviceSearchRef}
                      type="text"
                      placeholder={appointment.services?.name || "Buscar servicio..."}
                      value={serviceSearchQuery}
                      onChange={(e) => {
                        setServiceSearchQuery(e.target.value);
                        setServiceSearchOpen(true);
                        if (serviceSearchRef.current) {
                          const r = serviceSearchRef.current.getBoundingClientRect();
                          setServiceDropdownStyle({ top: r.bottom + 4, left: r.left, width: r.width });
                        }
                      }}
                      onFocus={() => {
                        setServiceSearchOpen(true);
                        if (serviceSearchRef.current) {
                          const r = serviceSearchRef.current.getBoundingClientRect();
                          setServiceDropdownStyle({ top: r.bottom + 4, left: r.left, width: r.width });
                        }
                      }}
                      onBlur={() => setTimeout(() => setServiceSearchOpen(false), 200)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                    />
                    {serviceSearchOpen && filteredServices.length > 0 && serviceDropdownStyle && typeof document !== "undefined" && createPortal(
                      <div
                        ref={serviceDropdownRef}
                        style={{
                          position: "fixed",
                          top: serviceDropdownStyle.top,
                          left: serviceDropdownStyle.left,
                          width: serviceDropdownStyle.width,
                          zIndex: 9999,
                        }}
                        className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden py-1 max-h-48 overflow-y-auto"
                      >
                        {filteredServices.map((s) => {
                          const selected = s.id === selectedServiceId;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onMouseDown={() => handleServiceSelect(s.id)}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer select-none flex items-center justify-between ${
                                selected
                                  ? "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30"
                                  : "text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                              }`}
                            >
                              <span className="font-medium">{s.name}</span>
                              <span className="text-xs text-zinc-400 tabular-nums">
                                ${s.price.toFixed(2)} · {s.duration_minutes}min
                              </span>
                            </button>
                          );
                        })}
                      </div>,
                      document.body
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wide">
                    Staff
                  </span>
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

                <div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wide">
                    Fecha y hora
                  </span>
                  <input
                    type="datetime-local"
                    value={startDateTimeLocal}
                    onChange={(e) => handleStartDateTimeChange(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                  {selectedServiceId && (() => {
                    const svc = services.find((s) => s.id === selectedServiceId);
                    if (!svc) return null;
                    const st = new Date(startDateTimeLocal);
                    if (isNaN(st.getTime())) return null;
                    const et = new Date(st.getTime() + svc.duration_minutes * 60000);
                    return (
                      <p className="mt-1 text-xs text-zinc-400 tabular-nums">
                        {st.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })} — {et.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })} ({svc.duration_minutes} min)
                      </p>
                    );
                  })()}
                </div>

                {appointment.notes && (
                  <div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wide">
                      Notas
                    </span>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                      {appointment.notes}
                    </p>
                  </div>
                )}

                {appointment.deposit_amount ? (
                  <div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium uppercase tracking-wide">
                      Seña
                    </span>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                      ${appointment.deposit_amount.toFixed(2)}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-5 space-y-4">
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
                        localPaid ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
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
                  <div className="flex gap-2">
                    {actions.map(({ label, nextStatus }) => (
                      <button
                        key={nextStatus}
                        onClick={() => handleStatusChange(nextStatus)}
                        disabled={pending}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 transition-colors disabled:opacity-50 cursor-pointer select-none"
                      >
                        <Check className="w-4 h-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 pt-2">
                  <button
                    onClick={handleDeleteAppointment}
                    disabled={pending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors cursor-pointer select-none disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Canjes: {localRewardsAvailable}
                    </span>
                    {!localRewardApplied && (
                      <button
                        onClick={handleRedeemLoyaltyReward}
                        disabled={pending || localRewardsAvailable <= 0}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-violet-700 dark:text-violet-200 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Canjear
                      </button>
                    )}
                  </div>
                </div>

                {localRewardApplied && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Canje aplicado: {appointment.loyalty_discount_percent_applied || 0}% de descuento.
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {(() => {
            const needsNotify = localStatus === "scheduled" || localStatus === "confirmed";
            if (!needsNotify) return (
              <ConfirmDialog
                open={deleteConfirmOpen}
                title="Eliminar turno"
                message="Esta acción elimina el turno definitivamente y no se puede deshacer."
                confirmLabel="Eliminar"
                danger
                onCancel={() => setDeleteConfirmOpen(false)}
                onConfirm={confirmDeleteAppointment}
              />
            );
            return deleteConfirmOpen ? createPortal(
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" role="dialog" aria-modal="true">
                <div className="w-full max-w-sm rounded-[1.75rem] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-5 shadow-2xl shadow-black/[0.08] space-y-4">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Eliminar turno</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    El turno de <strong>{appointment?.customers?.nombre || "—"}</strong> está{" "}
                    <strong>{localStatus === "scheduled" ? "a confirmar" : "confirmado"}</strong>.
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">¿Querés avisarle al cliente?</p>
                  {appointment?.customers?.telefono && (
                    <a
                      href={`https://wa.me/${appointment.customers.telefono.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Notificar por WhatsApp
                    </a>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmOpen(false)}
                      className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmDeleteAppointment}
                      className="px-3 py-1.5 rounded-lg text-sm text-white bg-red-600 hover:bg-red-700 transition-colors"
                    >
                      Eliminar de todos modos
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            ) : null;
          })()}

          <ConfirmDialog
            open={refundConfirmOpen}
            title="Reembolsar pago"
            message="Se reembolsará el pago completo de Mercado Pago al cliente y el turno quedará como no pagado."
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
