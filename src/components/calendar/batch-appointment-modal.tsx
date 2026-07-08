"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { X, Plus, Search, Clock, CalendarDays, ChevronDown, Loader2, Check, AlertCircle, Pencil, ArrowRight } from "lucide-react";
import { createAppointment, createCustomerAndAppointment } from "@/lib/dashboard/appointments/actions";
import { getArgentinaDateString } from "@/lib/argentina-time";
import { useToast } from "@/components/ui/toast";

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

interface BatchEntry {
  id: string;
  customerId: string;
  customerSearchQuery: string;
  customerSearchOpen: boolean;
  isNewCustomer: boolean;
  newCustomerName: string;
  newCustomerEmail: string;
  newCustomerPhone: string;
  serviceIds: string[];
  serviceSearchQuery: string;
  serviceSearchOpen: boolean;
  staffId: string;
  date: string;
  time: string;
  serviceCustomDurations: Record<string, number>;
}

const STAFF_COLORS = ["#c084fc", "#34d399", "#fbbf24", "#fb7185", "#22d3ee", "#fb923c", "#818cf8", "#f472b6"];
let entryCounter = 0;

function createEmptyEntry(date?: string, time?: string): BatchEntry {
  entryCounter++;
  return {
    id: `entry-${entryCounter}`,
    customerId: "",
    customerSearchQuery: "",
    customerSearchOpen: false,
    isNewCustomer: false,
    newCustomerName: "",
    newCustomerEmail: "",
    newCustomerPhone: "",
    serviceIds: [],
    serviceSearchQuery: "",
    serviceSearchOpen: false,
    staffId: "",
    serviceCustomDurations: {},
    date: date || getArgentinaDateString(),
    time: time || "09:00",
  };
}

interface BatchAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  services: Service[];
  staff: StaffMember[];
  customers: Customer[];
  shopId: string;
}

export default function BatchAppointmentModal({
  open,
  onClose,
  onSuccess,
  services,
  staff,
  customers,
  shopId,
}: BatchAppointmentModalProps) {
  const { addToast } = useToast();
  const [entries, setEntries] = useState<BatchEntry[]>([createEmptyEntry()]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ ok: number; fail: number } | null>(null);
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setEntries([createEmptyEntry()]);
      setResults(null);
      setProgress({ current: 0, total: 0 });
      setEntryErrors({});
    }
  }, [open]);

  // Scroll to bottom when a new entry is added
  useEffect(() => {
    if (scrollRef.current && entries.length > 0) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }, [entries.length]);

  function updateEntry(id: string, patch: Partial<BatchEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    if (patch.serviceIds || patch.customerId || patch.newCustomerName || patch.isNewCustomer !== undefined) {
      setEntryErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  function addEntry() {
    setEntries((prev) => [...prev, createEmptyEntry()]);
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function filteredCustomers(query: string) {
    if (!query.trim()) return customers;
    const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return customers.filter(
      (c) =>
        (c.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
    );
  }

  function filteredServices(query: string) {
    if (!query.trim()) return services;
    const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return services.filter((s) => s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q));
  }

  function validateEntry(entry: BatchEntry): string | null {
    if (entry.serviceIds.length === 0) return "Seleccioná al menos un servicio";
    if (entry.isNewCustomer && !entry.newCustomerName.trim()) return "Completá el nombre del cliente nuevo";
    if (!entry.isNewCustomer && !entry.customerId) return "Seleccioná un cliente";
    return null;
  }

  async function handleSaveEntry(entry: BatchEntry): Promise<boolean> {
    const err = validateEntry(entry);
    if (err) {
      setEntryErrors((prev) => ({ ...prev, [entry.id]: err }));
      return false;
    }
    setEntryErrors((prev) => {
      const next = { ...prev };
      delete next[entry.id];
      return next;
    });

    const form = document.createElement("form");
    const formData = new FormData(form);
    if (entry.isNewCustomer) {
      formData.set("customer_name", entry.newCustomerName.trim());
      formData.set("customer_email", entry.newCustomerEmail.trim());
      formData.set("customer_phone", entry.newCustomerPhone.trim());
    } else {
      formData.set("customer_id", entry.customerId);
    }
    formData.set("service_ids", entry.serviceIds.join(","));
    formData.set("service_durations", JSON.stringify(entry.serviceCustomDurations));
    formData.set("start_date", entry.date);
    formData.set("start_time", entry.time);
    if (entry.staffId) formData.set("staff_id", entry.staffId);

    const result = entry.isNewCustomer
      ? await createCustomerAndAppointment(formData, shopId)
      : await createAppointment(formData, shopId);

    if (result.success) {
      addToast("Turno creado", "success");
      onSuccess?.();
      // Add next empty entry after this one
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.id === entry.id);
        const next = [...prev];
        next.splice(idx + 1, 0, createEmptyEntry(entry.date, entry.time));
        return next;
      });
      return true;
    } else {
      setEntryErrors((prev) => ({ ...prev, [entry.id]: result.error || "Error al crear turno" }));
      return false;
    }
  }

  async function handleSave() {
    setSaving(true);
    setResults(null);
    setEntryErrors({});
    let ok = 0;
    let fail = 0;
    const newErrors: Record<string, string> = {};

    for (let i = 0; i < entries.length; i++) {
      setProgress({ current: i + 1, total: entries.length });
      const entry = entries[i];

      const err = validateEntry(entry);
      if (err) {
        newErrors[entry.id] = err;
        fail++;
        continue;
      }

      const form = document.createElement("form");
      const formData = new FormData(form);

      if (entry.isNewCustomer) {
        formData.set("customer_name", entry.newCustomerName.trim());
        formData.set("customer_email", entry.newCustomerEmail.trim());
        formData.set("customer_phone", entry.newCustomerPhone.trim());
      } else {
        formData.set("customer_id", entry.customerId);
      }

      formData.set("service_ids", entry.serviceIds.join(","));
      formData.set("service_durations", JSON.stringify(entry.serviceCustomDurations));
      formData.set("start_date", entry.date);
      formData.set("start_time", entry.time);
      if (entry.staffId) formData.set("staff_id", entry.staffId);

      const result = entry.isNewCustomer
        ? await createCustomerAndAppointment(formData, shopId)
        : await createAppointment(formData, shopId);

      if (result.success) {
        ok++;
      } else {
        newErrors[entry.id] = result.error || "Error al crear turno";
        fail++;
      }
    }

    setEntryErrors(newErrors);
    setResults({ ok, fail });
    setSaving(false);
    addToast(`${ok} turno${ok !== 1 ? "s" : ""} creado${ok !== 1 ? "s" : ""}${fail > 0 ? `, ${fail} error${fail !== 1 ? "es" : ""}` : ""}`, fail > 0 ? "error" : "success");
    if (ok > 0) {
      onSuccess?.();
    }
    if (fail === 0) {
      onClose();
    }
  }

  function handleRetry() {
    setResults(null);
    setProgress({ current: 0, total: 0 });
    setEntryErrors({});
  }

  if (!open) return null;

  const modalNode = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto overscroll-y-contain bg-black/20 p-3 sm:p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.65 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-2xl overflow-hidden max-h-[92dvh] flex flex-col my-4"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Crear múltiples turnos
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {entries.length} turno{entries.length !== 1 ? "s" : ""} para crear
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={saving}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div ref={scrollRef} className="overflow-y-auto flex-1 p-4 space-y-3">
              {results ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  {results.fail === 0 ? (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                      <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                      <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                  )}
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {results.ok} creado{results.ok !== 1 ? "s" : ""}
                    {results.fail > 0 && `, ${results.fail} error${results.fail !== 1 ? "es" : ""}`}
                  </p>
                  {results.fail > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="ui-btn-ghost rounded-lg px-4 py-1.5 text-sm"
                      >
                        Revisar errores
                      </button>
                      <button
                        type="button"
                        onClick={() => { onSuccess?.(); onClose(); }}
                        className="ui-btn-primary rounded-lg px-4 py-1.5 text-sm font-medium"
                      >
                        Cerrar
                      </button>
                    </div>
                  )}
                </div>
              ) : saving ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="h-8 w-8 text-[#0071E3] animate-spin" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Guardando turno {progress.current} de {progress.total}...
                  </p>
                  <div className="w-48 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-[#0071E3]"
                      initial={{ width: 0 }}
                      animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              ) : (
                entries.map((entry, index) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    index={index}
                    services={services}
                    staff={staff}
                    customers={customers}
                    customerFiltered={filteredCustomers(entry.customerSearchQuery)}
                    serviceFiltered={filteredServices(entry.serviceSearchQuery)}
                    onUpdate={(patch) => updateEntry(entry.id, patch)}
                    onRemove={() => removeEntry(entry.id)}
                    canRemove={entries.length > 1}
                    onSaveEntry={() => handleSaveEntry(entry)}
                    entryError={entryErrors[entry.id]}
                  />
                ))
              )}
            </div>

            {!saving && !results && (() => {
              const lastEntry = entries[entries.length - 1];
              const lastEntryValid = lastEntry
                ? lastEntry.serviceIds.length > 0
                  && (lastEntry.isNewCustomer
                    ? lastEntry.newCustomerName.trim().length > 0
                    : !!lastEntry.customerId)
                : false;
              return (
              <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={addEntry}
                  disabled={!lastEntryValid}
                  className="ui-btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Agregar otro turno
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={entries.some((e) => (e.serviceIds.length === 0) || (!e.isNewCustomer && !e.customerId) || (e.isNewCustomer && !e.newCustomerName.trim()))}
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white py-2 px-6 rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all cursor-pointer select-none"
                >
                  Guardar todos ({entries.length})
                </button>
              </div>
              );
            })()}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modalNode, document.body);
}

function EntryCard({
  entry,
  index,
  services,
  staff,
  customers,
  customerFiltered,
  serviceFiltered,
  onUpdate,
  onRemove,
  canRemove,
  onSaveEntry,
  entryError,
}: {
  entry: BatchEntry;
  index: number;
  services: Service[];
  staff: StaffMember[];
  customers: Customer[];
  customerFiltered: Customer[];
  serviceFiltered: Service[];
  onUpdate: (patch: Partial<BatchEntry>) => void;
  onRemove: () => void;
  canRemove: boolean;
  onSaveEntry?: () => void;
  entryError?: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editingDurationId, setEditingDurationId] = useState<string | null>(null);
  const [editingDurationValue, setEditingDurationValue] = useState("");
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const serviceSearchRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);
  const [customerDropdownStyle, setCustomerDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const [serviceDropdownStyle, setServiceDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const recalcStyles = useCallback(() => {
    if (entry.customerSearchOpen && customerSearchRef.current) {
      const r = customerSearchRef.current.getBoundingClientRect();
      setCustomerDropdownStyle({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    if (entry.serviceSearchOpen && serviceSearchRef.current) {
      const r = serviceSearchRef.current.getBoundingClientRect();
      setServiceDropdownStyle({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [entry.customerSearchOpen, entry.serviceSearchOpen]);

  useEffect(() => {
    if (!entry.customerSearchOpen && !entry.serviceSearchOpen) {
      setCustomerDropdownStyle(null);
      setServiceDropdownStyle(null);
      return;
    }
    recalcStyles();
    function handleMove(e: Event) {
      const target = e.target as Node;
      if (
        (customerDropdownRef.current && customerDropdownRef.current.contains(target)) ||
        (serviceDropdownRef.current && serviceDropdownRef.current.contains(target))
      ) {
        return;
      }
      recalcStyles();
    }
    window.addEventListener("scroll", handleMove, true);
    window.addEventListener("resize", handleMove);
    return () => {
      window.removeEventListener("scroll", handleMove, true);
      window.removeEventListener("resize", handleMove);
    };
  }, [entry.customerSearchOpen, entry.serviceSearchOpen, onUpdate, recalcStyles]);

  const selServices = services.filter((s) => entry.serviceIds.includes(s.id));
  const totalDur = selServices.reduce((sum, s) => sum + (entry.serviceCustomDurations[s.id] ?? s.duration_minutes), 0);
  const totalPrc = selServices.reduce((sum, s) => sum + s.price, 0);

  const timeSlots = useMemo(() => {
    const svcs = services.filter((s) => entry.serviceIds.includes(s.id));
    if (svcs.length === 0) return [];
    const base = new Date(`2000-01-01T${entry.time}`);
    const slots: { service: Service; start: string; end: string }[] = [];
    let current = new Date(base);
    svcs.forEach((svc) => {
      const startStr = current.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
      const effDuration = entry.serviceCustomDurations[svc.id] ?? svc.duration_minutes;
      current = new Date(current.getTime() + effDuration * 60000);
      slots.push({ service: svc, start: startStr, end: current.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }) });
    });
    return slots;
  }, [services, entry.serviceIds, entry.time, entry.serviceCustomDurations]);

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-700/50">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 text-left min-w-0 cursor-pointer select-none"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0071E3]/10 text-[11px] font-semibold text-[#0071E3] shrink-0">
            {index + 1}
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {entry.customerId || entry.isNewCustomer ? (
              customers.find((c) => c.id === entry.customerId)?.nombre || entry.newCustomerName || "Sin cliente"
            ) : (
              <span className="text-zinc-400">Seleccionar cliente...</span>
            )}
          </span>
          {selServices.length > 0 && (
            <span className="text-xs text-zinc-400 truncate ml-auto hidden sm:block">
              {selServices.length} servicio{selServices.length !== 1 ? "s" : ""} · {totalDur}min · ${totalPrc.toFixed(2)}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer select-none"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-3">
              {/* Cliente */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
                {!entry.isNewCustomer ? (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                      <input
                        ref={customerSearchRef}
                        type="text"
                        placeholder="Buscar cliente..."
                        value={entry.customerSearchQuery}
                        onChange={(e) => {
                          onUpdate({ customerSearchQuery: e.target.value, customerSearchOpen: true });
                          setTimeout(recalcStyles, 0);
                        }}
                        onFocus={() => {
                          onUpdate({ customerSearchOpen: true });
                          setTimeout(recalcStyles, 0);
                        }}
                        onBlur={() => setTimeout(() => onUpdate({ customerSearchOpen: false }), 200)}
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                      />
                      {entry.customerSearchOpen && customerDropdownStyle && (customerFiltered.length > 0 || entry.customerSearchQuery.trim()) && typeof document !== "undefined" && createPortal(
                        <div
                          ref={customerDropdownRef}
                          style={{ position: "fixed", top: customerDropdownStyle.top, left: customerDropdownStyle.left, width: customerDropdownStyle.width, zIndex: 9999 }}
                          className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden py-1 max-h-48 overflow-y-auto"
                        >
                          {customerFiltered.length > 0 ? (
                            customerFiltered.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onMouseDown={() => {
                                  onUpdate({ customerId: c.id, customerSearchQuery: c.nombre || "Sin nombre", customerSearchOpen: false });
                                }}
                                className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer select-none ${
                                  c.id === entry.customerId
                                    ? "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30"
                                    : "text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                                }`}
                              >
                                <span className="font-medium">{c.nombre || "Sin nombre"}</span>
                                {c.telefono && <span className="ml-2 text-xs text-zinc-400">{c.telefono}</span>}
                              </button>
                            ))
                          ) : (
                            <button
                              type="button"
                              onMouseDown={() => {
                                onUpdate({ isNewCustomer: true, newCustomerName: entry.customerSearchQuery, customerSearchQuery: "", customerSearchOpen: false });
                              }}
                              className="w-full text-left px-3 py-2.5 text-sm text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors cursor-pointer select-none font-medium flex items-center gap-2"
                            >
                              <Plus className="w-4 h-4" />
                              Agregar a {entry.customerSearchQuery}
                            </button>
                          )}
                        </div>,
                        document.body
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Nuevo cliente</span>
                      <button
                        type="button"
                        onClick={() => onUpdate({ isNewCustomer: false, customerSearchQuery: "" })}
                        className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-white cursor-pointer select-none"
                      >
                        Cancelar
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Nombre completo"
                      value={entry.newCustomerName}
                      onChange={(e) => onUpdate({ newCustomerName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                    />
                    <input
                      type="email"
                      placeholder="Email (opcional)"
                      value={entry.newCustomerEmail}
                      onChange={(e) => onUpdate({ newCustomerEmail: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                    />
                    <input
                      type="tel"
                      placeholder="Teléfono (opcional)"
                      value={entry.newCustomerPhone}
                      onChange={(e) => onUpdate({ newCustomerPhone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Servicios */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Servicios</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    ref={serviceSearchRef}
                    type="text"
                    placeholder="Buscar y agregar servicio..."
                    value={entry.serviceSearchQuery}
                    onChange={(e) => {
                      onUpdate({ serviceSearchQuery: e.target.value, serviceSearchOpen: true });
                      setTimeout(recalcStyles, 0);
                    }}
                    onFocus={() => {
                      onUpdate({ serviceSearchOpen: true });
                      setTimeout(recalcStyles, 0);
                    }}
                    onBlur={() => setTimeout(() => onUpdate({ serviceSearchOpen: false }), 200)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                  />
                  {entry.serviceSearchOpen && serviceFiltered.length > 0 && serviceDropdownStyle && typeof document !== "undefined" && createPortal(
                    <div
                      ref={serviceDropdownRef}
                      style={{ position: "fixed", top: serviceDropdownStyle.top, left: serviceDropdownStyle.left, width: serviceDropdownStyle.width, zIndex: 9999 }}
                      className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden py-1 max-h-48 overflow-y-auto"
                    >
                      {serviceFiltered.map((s) => {
                        const already = entry.serviceIds.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={() => {
                              if (!already) onUpdate({ serviceIds: [...entry.serviceIds, s.id], serviceSearchQuery: "", serviceSearchOpen: false });
                            }}
                            disabled={already}
                            className={`w-full text-left px-3 py-2.5 text-sm transition-colors cursor-pointer select-none flex items-center justify-between ${
                              already
                                ? "text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800 cursor-not-allowed"
                                : "text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                            }`}
                          >
                            <span className="font-medium">{s.name}</span>
                            <span className="text-xs text-zinc-400 tabular-nums">${s.price.toFixed(2)} · {s.duration_minutes}min</span>
                          </button>
                        );
                      })}
                    </div>,
                    document.body
                  )}
                </div>

                {selServices.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {selServices.map((s) => {
                        const effDuration = entry.serviceCustomDurations[s.id] ?? s.duration_minutes;
                        const isCustom = effDuration !== s.duration_minutes;
                        const isEditing = editingDurationId === s.id;
                        return (
                        <span key={s.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 rounded-lg text-xs font-medium">
                          {s.name}
                          {isEditing ? (
                            <span className="flex items-center gap-0.5">
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
                                      onUpdate({ serviceCustomDurations: { ...entry.serviceCustomDurations, [s.id]: val } });
                                    }
                                    setEditingDurationId(null);
                                  }
                                  if (e.key === "Escape") setEditingDurationId(null);
                                }}
                                onBlur={() => {
                                  const val = parseInt(editingDurationValue, 10);
                                  if (!isNaN(val) && val >= 1 && val <= 300) {
                                    onUpdate({ serviceCustomDurations: { ...entry.serviceCustomDurations, [s.id]: val } });
                                  }
                                  setEditingDurationId(null);
                                }}
                                autoFocus
                                className="w-14 px-1 py-0.5 rounded border border-violet-300 text-center text-xs tabular-nums bg-white dark:bg-zinc-700"
                              />
                              <span className="text-zinc-400 text-[10px]">min</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                try {
                                  setEditingDurationId(s.id);
                                  setEditingDurationValue(String(effDuration));
                                } catch (err) {
                                  console.error("[batch] click error", err);
                                }
                              }}
                              className={`inline-flex items-center gap-0.5 text-xs hover:text-violet-600 transition-colors cursor-pointer select-none ${isCustom ? 'text-violet-600 dark:text-violet-300 font-semibold' : 'opacity-70'}`}
                            >
                              {effDuration}min
                              <Pencil className="w-3 h-3 opacity-60" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onUpdate({ serviceIds: entry.serviceIds.filter((id) => id !== s.id) })}
                            className="hover:bg-violet-200 dark:hover:bg-violet-800 rounded p-0.5 transition-colors cursor-pointer select-none"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl px-3 py-1.5">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{totalDur} min</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">${totalPrc.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Staff + Fecha + Hora */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Profesional</label>
                  <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-sm">
                    <button
                      type="button"
                      onClick={() => onUpdate({ staffId: "" })}
                      className={`relative px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer select-none ${
                        entry.staffId === ""
                          ? "text-[#0071E3] dark:text-[#5da8ff]"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      }`}
                    >
                      {entry.staffId === "" && (
                        <motion.span layoutId={`staff-${entry.id}`} className="absolute inset-0 rounded-lg bg-[#0071E3]/15 dark:bg-[#0071E3]/25 border border-[#0071E3]/25 shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 30 }} />
                      )}
                      <span className="relative z-10">Cualquiera</span>
                    </button>
                    {staff.map((s, i) => {
                      const isActive = entry.staffId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onUpdate({ staffId: isActive ? "" : s.id })}
                          className={`relative inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer select-none ${
                            isActive
                              ? "text-[#0071E3] dark:text-[#5da8ff]"
                              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                          }`}
                        >
                          {isActive && (
                            <motion.span layoutId={`staff-${entry.id}`} className="absolute inset-0 rounded-lg bg-[#0071E3]/15 dark:bg-[#0071E3]/25 border border-[#0071E3]/25 shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 30 }} />
                          )}
                          <span className="relative z-10 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STAFF_COLORS[i % STAFF_COLORS.length] }} />
                          <span className="relative z-10">{s.name || s.email}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Fecha</label>
                    <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                      <CalendarDays className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <input
                        type="date"
                        value={entry.date}
                        onChange={(e) => onUpdate({ date: e.target.value })}
                        className="w-28 bg-transparent text-xs text-gray-900 dark:text-gray-100 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Hora</label>
                    <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                      <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <input
                        type="time"
                        value={entry.time}
                        onChange={(e) => onUpdate({ time: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onSaveEntry?.();
                          }
                        }}
                        className="w-20 bg-transparent text-xs text-gray-900 dark:text-gray-100 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {timeSlots.length > 1 && (
                <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
                  <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                    Secuencia horaria
                  </div>
                  {timeSlots.map((slot, i) => {
                    const origDuration = slot.service.duration_minutes;
                    const effDuration = entry.serviceCustomDurations[slot.service.id] ?? origDuration;
                    const isCustom = effDuration !== origDuration;
                    const isEditing = editingDurationId === slot.service.id;
                    return (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-zinc-100 dark:border-zinc-800 last:border-b-0">
                      <span className="text-violet-600 dark:text-violet-400 font-medium tabular-nums min-w-[9ch]">{slot.start} — {slot.end}</span>
                      <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{slot.service.name}</span>
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
                                  onUpdate({ serviceCustomDurations: { ...entry.serviceCustomDurations, [slot.service.id]: val } });
                                }
                                setEditingDurationId(null);
                              }
                              if (e.key === "Escape") setEditingDurationId(null);
                            }}
                            onBlur={() => {
                              const val = parseInt(editingDurationValue, 10);
                              if (!isNaN(val) && val >= 1 && val <= 300) {
                                onUpdate({ serviceCustomDurations: { ...entry.serviceCustomDurations, [slot.service.id]: val } });
                              }
                              setEditingDurationId(null);
                            }}
                            autoFocus
                            className="w-14 px-1 py-0.5 rounded border border-violet-300 text-center text-xs tabular-nums bg-white dark:bg-zinc-700"
                          />
                          <span className="text-zinc-400 text-[10px]">min</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            try {
                              setEditingDurationId(slot.service.id);
                              setEditingDurationValue(String(effDuration));
                            } catch (err) {
                              console.error("[batch] secuencia click error", err);
                            }
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

              {entryError && (
                <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {entryError}
                </p>
              )}

              {onSaveEntry && (
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-700/50 flex justify-end">
                  <button
                    type="button"
                    onClick={onSaveEntry}
                    className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 transition-colors cursor-pointer select-none"
                  >
                    Crear y siguiente
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
