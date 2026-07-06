"use client";

import { useToast } from "@/components/ui/toast";
import { X, Plus, Search, Clock, DollarSign, CalendarDays, Pencil } from "lucide-react";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createAppointment, createCustomerAndAppointment } from "@/lib/dashboard/appointments/actions";
import { playPop } from "@/lib/sound";
import { getArgentinaDateString } from "@/lib/argentina-time";
import { AnimatePresence, motion } from "framer-motion";
import GlassSelect from "@/components/ui/glass-select";
import { createPortal } from "react-dom";

const STAFF_COLORS = ["#c084fc", "#34d399", "#fbbf24", "#fb7185", "#22d3ee", "#fb923c", "#818cf8", "#f472b6"];
const STAFF_SPRING = { type: "spring" as const, stiffness: 500, damping: 30 };

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

const IOS_MODAL_SPRING = { stiffness: 460, damping: 34, mass: 0.65 };

type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
};

type StaffMember = {
  id: string;
  role: string;
  name: string | null;
  email: string | null;
};

type Customer = {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
};

interface AppointmentFormModalProps {
  shopId: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialDate?: string;
  initialHour?: number;
  services: Service[];
  staff: StaffMember[];
  customers: Customer[];
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function AppointmentFormModal({
  shopId,
  open,
  onClose,
  onSuccess,
  initialDate,
  initialHour,
  services,
  staff,
  customers,
}: AppointmentFormModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [recurringFrequency, setRecurringFrequency] = useState("none");
  const [recurringUntil, setRecurringUntil] = useState("");
  const [showRecurringPicker, setShowRecurringPicker] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const serviceSearchRef = useRef<HTMLInputElement>(null);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerDropdownStyle, setCustomerDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [serviceSearchOpen, setServiceSearchOpen] = useState(false);
  const [serviceDropdownStyle, setServiceDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const [selectedDate, setSelectedDate] = useState(initialDate || getArgentinaDateString());
  const [selectedTime, setSelectedTime] = useState(
    initialHour ? `${String(initialHour).padStart(2, "0")}:00` : "09:00"
  );
  const [portalReady, setPortalReady] = useState(false);
  const [serviceCustomDurations, setServiceCustomDurations] = useState<Record<string, number>>({});
  const [editingDurationId, setEditingDurationId] = useState<string | null>(null);
  const [editingDurationValue, setEditingDurationValue] = useState("");
  const { addToast } = useToast();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSelectedCustomerId("");
      setSelectedStaffId("");
      setSelectedServiceIds([]);
      setRecurringFrequency("none");
      setRecurringUntil("");
      setShowNewCustomer(false);
      setNewCustomerName("");
      setNewCustomerEmail("");
      setNewCustomerPhone("");
      setCustomerSearchQuery("");
      setCustomerSearchOpen(false);
      setServiceSearchQuery("");
      setServiceSearchOpen(false);
      setServiceCustomDurations({});
      setEditingDurationId(null);
      setEditingDurationValue("");
      setSelectedDate(initialDate || getArgentinaDateString());
      setSelectedTime(initialHour ? `${String(initialHour).padStart(2, "0")}:00` : "09:00");
      setError(null);
    }
  }, [open, initialDate, initialHour]);

  useEffect(() => {
    if (!customerSearchOpen && !serviceSearchOpen) return;
    function handleMove(e: Event) {
      const target = e.target as Node;
      if (
        (customerDropdownRef.current && customerDropdownRef.current.contains(target)) ||
        (serviceDropdownRef.current && serviceDropdownRef.current.contains(target))
      ) {
        return;
      }
      setCustomerSearchOpen(false);
      setServiceSearchOpen(false);
    }
    window.addEventListener("scroll", handleMove, true);
    window.addEventListener("resize", handleMove);
    return () => {
      window.removeEventListener("scroll", handleMove, true);
      window.removeEventListener("resize", handleMove);
    };
  }, [customerSearchOpen, serviceSearchOpen]);

  const selectedServices = useMemo(
    () => services.filter((s) => selectedServiceIds.includes(s.id)),
    [services, selectedServiceIds]
  );

  const totalDuration = useMemo(
    () => selectedServices.reduce((sum, s) => sum + (serviceCustomDurations[s.id] ?? s.duration_minutes), 0),
    [selectedServices, serviceCustomDurations]
  );

  const totalPrice = useMemo(
    () => selectedServices.reduce((sum, s) => sum + s.price, 0),
    [selectedServices]
  );

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return customers.filter((c) =>
      (c.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
    );
  }, [customers, customerSearchQuery]);

  const filteredServices = useMemo(() => {
    if (!serviceSearchQuery.trim()) return services;
    const q = serviceSearchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return services.filter((s) =>
      s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
    );
  }, [services, serviceSearchQuery]);

  const timeSlots = useMemo(() => {
    if (selectedServices.length === 0) return [];
    const base = new Date(`2000-01-01T${selectedTime}`);
    const slots: { service: Service; start: string; end: string }[] = [];
    let current = new Date(base);
    selectedServices.forEach((svc) => {
      const duration = serviceCustomDurations[svc.id] ?? svc.duration_minutes;
      const startStr = formatTime(current);
      current = new Date(current.getTime() + duration * 60000);
      slots.push({ service: svc, start: startStr, end: formatTime(current) });
    });
    return slots;
  }, [selectedServices, selectedTime, serviceCustomDurations]);

  const addService = useCallback((id: string) => {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setServiceSearchQuery("");
    setServiceSearchOpen(false);
  }, []);

  const removeService = useCallback((id: string) => {
    setSelectedServiceIds((prev) => prev.filter((s) => s !== id));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (selectedServiceIds.length === 0) {
      setError("Seleccioná al menos un servicio");
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.set("service_ids", selectedServiceIds.join(","));

    setIsSubmitting(true);
    try {
      const result = showNewCustomer
        ? await createCustomerAndAppointment(formData, shopId)
        : await createAppointment(formData, shopId);

      if (!result.success) {
        setError(result.error);
      } else {
        playPop();
        addToast(result.success
          ? `Turno${selectedServiceIds.length > 1 ? "s" : ""} creado${selectedServiceIds.length > 1 ? "s" : ""}`
          : "Turno guardado", "success");
        onSuccess?.();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) return null;

  if (!portalReady || typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/20 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-lg overflow-hidden max-h-[88dvh] flex flex-col"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", ...IOS_MODAL_SPRING }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Nuevo Turno
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="appointment-form" onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 overflow-y-auto overscroll-y-contain flex-1 space-y-5">
            {error === "slot_taken" ? (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm px-4 py-3 rounded-xl flex items-start gap-3">
                <div className="p-1 rounded-full bg-amber-100 dark:bg-amber-900/50 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </div>
                <p>
                  <span className="font-semibold block">Horario ocupado</span>
                  Este horario ya está ocupado. Verificá la agenda primero.
                </p>
              </div>
            ) : error && (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm px-4 py-2 rounded-xl">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Cliente <span className="text-red-500">*</span>
              </label>
              {!showNewCustomer ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    <input
                      ref={customerSearchRef}
                      type="text"
                      placeholder="Buscar y agregar cliente"
                      value={customerSearchQuery}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        if (!customerSearchOpen) setCustomerSearchOpen(true);
                      }}
                      onFocus={() => {
                        setCustomerSearchOpen(true);
                        if (customerSearchRef.current) {
                          const r = customerSearchRef.current.getBoundingClientRect();
                          setCustomerDropdownStyle({ top: r.bottom + 4, left: r.left, width: r.width });
                        }
                      }}
                      onBlur={() => setTimeout(() => setCustomerSearchOpen(false), 200)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                    />
                    {customerSearchOpen && customerDropdownStyle && (filteredCustomers.length > 0 || customerSearchQuery.trim()) && typeof document !== "undefined" && createPortal(
                      <div
                        ref={customerDropdownRef}
                        style={{
                          position: "fixed",
                          top: customerDropdownStyle.top,
                          left: customerDropdownStyle.left,
                          width: customerDropdownStyle.width,
                          zIndex: 9999,
                        }}
                        className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden py-1 max-h-48 overflow-y-auto"
                      >
                        {filteredCustomers.length > 0 ? (
                          filteredCustomers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={() => {
                                setSelectedCustomerId(c.id);
                                setCustomerSearchQuery(c.nombre || "Sin nombre");
                                setCustomerSearchOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer select-none ${
                                c.id === selectedCustomerId
                                  ? "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30"
                                  : "text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                              }`}
                            >
                              <span className="font-medium">{c.nombre || "Sin nombre"}</span>
                              {c.telefono && (
                                <span className="ml-2 text-xs text-zinc-400">{c.telefono}</span>
                              )}
                            </button>
                          ))
                        ) : (
                          <button
                            type="button"
                            onMouseDown={() => {
                              setNewCustomerName(customerSearchQuery);
                              setShowNewCustomer(true);
                              setCustomerSearchQuery("");
                              setCustomerSearchOpen(false);
                            }}
                            className="w-full text-left px-3 py-2.5 text-sm text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors cursor-pointer select-none font-medium flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" />
                            Agregar a {customerSearchQuery}
                          </button>
                        )}
                      </div>,
                      document.body
                    )}
                    <input type="hidden" name="customer_id" value={selectedCustomerId} required />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nuevo cliente</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCustomer(false);
                        setCustomerSearchQuery("");
                      }}
                      className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-white cursor-pointer select-none"
                    >
                      Cancelar
                    </button>
                  </div>
                  <input
                    type="text"
                    name="customer_name"
                    placeholder="Nombre completo"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                  />
                  <input
                    type="email"
                    name="customer_email"
                    placeholder="Email (opcional)"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                  />
                  <input
                    type="tel"
                    name="customer_phone"
                    placeholder="Teléfono (opcional)"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Servicios <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  ref={serviceSearchRef}
                  type="text"
                  placeholder="Buscar y agregar servicio..."
                  value={serviceSearchQuery}
                  onChange={(e) => {
                    setServiceSearchQuery(e.target.value);
                    if (!serviceSearchOpen) setServiceSearchOpen(true);
                  }}
                  onFocus={() => {
                    setServiceSearchOpen(true);
                    if (serviceSearchRef.current) {
                      const r = serviceSearchRef.current.getBoundingClientRect();
                      setServiceDropdownStyle({ top: r.bottom + 4, left: r.left, width: r.width });
                    }
                  }}
                  onBlur={() => setTimeout(() => setServiceSearchOpen(false), 200)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
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
                      const already = selectedServiceIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={() => { if (!already) addService(s.id); }}
                          disabled={already}
                          className={`w-full text-left px-3 py-2.5 text-sm transition-colors cursor-pointer select-none flex items-center justify-between ${
                            already
                              ? "text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800 cursor-not-allowed"
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

              {selectedServices.length > 0 && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {selectedServices.map((s) => {
                      const effDuration = serviceCustomDurations[s.id] ?? s.duration_minutes;
                      const isCustom = effDuration !== s.duration_minutes;
                      return (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 rounded-lg text-sm font-medium"
                      >
                        {s.name}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDurationId(s.id);
                            setEditingDurationValue(String(effDuration));
                          }}
                          className={`inline-flex items-center gap-0.5 text-xs hover:text-violet-600 transition-colors cursor-pointer select-none ${isCustom ? 'text-violet-600 dark:text-violet-300 font-semibold' : 'opacity-70'}`}
                        >
                          {effDuration}min
                          <Pencil className="w-3 h-3 opacity-60" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeService(s.id)}
                          className="hover:bg-violet-200 dark:hover:bg-violet-800 rounded p-0.5 transition-colors cursor-pointer select-none"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl px-4 py-2">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      {totalDuration} min
                    </span>
                    <span className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-gray-100">
                      <DollarSign className="w-4 h-4" />
                      ${totalPrice.toFixed(2)}
                    </span>
                  </div>

                  {timeSlots.length > 1 && (
                    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
                      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                        Secuencia horaria
                      </div>
                      {timeSlots.map((slot, i) => {
                        const origDuration = slot.service.duration_minutes;
                        const effDuration = serviceCustomDurations[slot.service.id] ?? origDuration;
                        const isCustom = effDuration !== origDuration;
                        const isEditing = editingDurationId === slot.service.id;
                        return (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-4 py-2 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
                        >
                          <span className="text-violet-600 dark:text-violet-400 font-medium tabular-nums min-w-[8.5ch]">
                            {slot.start} — {slot.end}
                          </span>
                          <span className="text-gray-700 dark:text-gray-300 flex-1">{slot.service.name}</span>
                          {isEditing ? (
                            <span className="flex items-center gap-1 shrink-0">
                              <input
                                type="number"
                                min={1}
                                max={300}
                                value={editingDurationValue}
                                onChange={(e) => setEditingDurationValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const val = parseInt(editingDurationValue, 10);
                                    if (!isNaN(val) && val >= 1 && val <= 300) {
                                      setServiceCustomDurations((prev) => ({ ...prev, [slot.service.id]: val }));
                                    } else {
                                      setError("La duración debe ser entre 1 y 300 minutos (5 hs)");
                                      setServiceCustomDurations((prev) => { const n = { ...prev }; delete n[slot.service.id]; return n; });
                                    }
                                    setEditingDurationId(null);
                                  }
                                  if (e.key === "Escape") {
                                    setEditingDurationId(null);
                                  }
                                }}
                                onBlur={() => {
                                  const val = parseInt(editingDurationValue, 10);
                                  if (!isNaN(val) && val >= 1 && val <= 300) {
                                    setServiceCustomDurations((prev) => ({ ...prev, [slot.service.id]: val }));
                                  } else {
                                    setError("La duración debe ser entre 1 y 300 minutos (5 hs)");
                                    setServiceCustomDurations((prev) => { const n = { ...prev }; delete n[slot.service.id]; return n; });
                                  }
                                  setEditingDurationId(null);
                                }}
                                autoFocus
                                className="w-16 px-1.5 py-0.5 rounded border border-violet-300 text-center text-xs tabular-nums"
                              />
                              <span className="text-zinc-400 text-xs">min</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDurationId(slot.service.id);
                                setEditingDurationValue(String(effDuration));
                              }}
                              className={`inline-flex items-center gap-0.5 text-xs tabular-nums hover:text-violet-600 transition-colors cursor-pointer select-none shrink-0 ${isCustom ? 'text-violet-600 font-semibold' : 'text-zinc-400'}`}
                            >
                              {effDuration}min
                              <Pencil className="w-3 h-3 opacity-60" />
                            </button>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <input type="hidden" name="service_ids" value={selectedServiceIds.join(",")} />
              <input type="hidden" name="service_durations" value={JSON.stringify(serviceCustomDurations)} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Profesional
              </label>
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-sm">
                <button
                  type="button"
                  onClick={() => setSelectedStaffId("")}
                  className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer select-none ${
                    selectedStaffId === ""
                      ? "text-[#0071E3] dark:text-[#5da8ff]"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  }`}
                >
                  {selectedStaffId === "" && (
                    <motion.span
                      layoutId="staffSelectForm"
                      className="absolute inset-0 rounded-lg bg-[#0071E3]/15 dark:bg-[#0071E3]/25 border border-[#0071E3]/25 dark:border-[#0071E3]/35 shadow-sm"
                      transition={STAFF_SPRING}
                    />
                  )}
                  <span className="relative z-10">Cualquiera</span>
                </button>
                {staff.map((s, i) => {
                  const isActive = selectedStaffId === s.id;
                  const color = STAFF_COLORS[i % STAFF_COLORS.length];
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedStaffId(isActive ? "" : s.id)}
                      className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer select-none ${
                        isActive
                          ? "text-[#0071E3] dark:text-[#5da8ff]"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="staffSelectForm"
                          className="absolute inset-0 rounded-lg bg-[#0071E3]/15 dark:bg-[#0071E3]/25 border border-[#0071E3]/25 dark:border-[#0071E3]/35 shadow-sm"
                          transition={STAFF_SPRING}
                        />
                      )}
                      <span className="relative z-10 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="relative z-10">{s.name || s.email}</span>
                    </button>
                  );
                })}
              </div>
              <input type="hidden" name="staff_id" value={selectedStaffId} />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <CalendarDays className="w-4 h-4 text-zinc-400 shrink-0" />
                <input
                  type="date"
                  name="start_date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  required
                  className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                />
              </div>
              <div className="flex items-center gap-2 flex-1">
                <Clock className="w-4 h-4 text-zinc-400 shrink-0" />
                <input
                  type="time"
                  name="start_time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  required
                  className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                />
              </div>
            </div>

            {selectedServices.length > 0 && timeSlots.length > 0 && (
              <div className="text-sm text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl px-4 py-2.5 flex items-center gap-2 tabular-nums">
                <Clock className="w-4 h-4 shrink-0" />
                {timeSlots[0].start} → {timeSlots[timeSlots.length - 1].end}
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                {totalDuration} min total
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Repeticion
              </label>
              <GlassSelect
                options={[
                  { value: "none", label: "No repetir" },
                  { value: "weekly", label: "Semanal" },
                  { value: "biweekly", label: "Cada 2 semanas" },
                  { value: "monthly", label: "Mensual" },
                ]}
                value={selectedServiceIds.length > 1 ? "none" : recurringFrequency}
                onChange={setRecurringFrequency}
                placeholder="No repetir"
                name="recurring_frequency"
                className={selectedServiceIds.length > 1 ? "opacity-60 pointer-events-none" : ""}
              />

              {recurringFrequency !== "none" && selectedServiceIds.length <= 1 && (
                <div className="mt-2">
                  {recurringUntil ? (
                    <div className="flex items-center gap-2">
                      <input type="hidden" name="recurring_until" value={recurringUntil} />
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 shadow-sm">
                        <CalendarDays className="w-4 h-4 text-zinc-400" />
                        <span className="font-semibold">{new Date(recurringUntil + "T12:00:00").toLocaleDateString("es-AR")}</span>
                        <button
                          type="button"
                          onClick={() => { setRecurringUntil(""); setShowRecurringPicker(false); }}
                          className="ml-auto p-0.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer select-none"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : showRecurringPicker ? (
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                        Hasta
                      </label>
                      <input
                        type="date"
                        name="recurring_until"
                        value={recurringUntil}
                        onChange={(e) => { setRecurringUntil(e.target.value); setShowRecurringPicker(false); }}
                        className="w-full px-3 py-2 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowRecurringPicker(true)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-500 dark:text-zinc-400 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-all cursor-pointer select-none"
                    >
                      <CalendarDays className="w-4 h-4" />
                      Definir fecha
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-center">
            <button
              type="submit"
              form="appointment-form"
              disabled={isSubmitting || selectedServiceIds.length === 0}
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white py-2.5 px-8 rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all cursor-pointer select-none"
            >
              <Plus className="w-4 h-4" />
              {isSubmitting
                ? "Creando..."
                : selectedServiceIds.length > 1
                  ? `Crear ${selectedServiceIds.length} turnos`
                  : "Crear Turno"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  );
}
