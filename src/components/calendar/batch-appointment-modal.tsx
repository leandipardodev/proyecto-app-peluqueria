"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { X, Plus, Search, Clock, CalendarDays, AlertCircle, Pencil, Check, Loader } from "lucide-react";
import { createAppointment, createCustomerAndAppointment } from "@/lib/dashboard/appointments/actions";
import { getArgentinaDateString } from "@/lib/argentina-time";
import { useToast } from "@/components/ui/toast";
import { FormWithKeyboardNav } from "@/lib/use-form-keyboard-nav";
import { getUserFriendlyError } from "@/lib/dashboard/appointments/errors";

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

interface HistoryItem {
  id: string;
  status: "pending" | "ok" | "error";
  customerName: string;
  serviceNames: string;
  time: string;
  date: string;
  errorMsg?: string;
  snapshot?: BatchEntry;
}

const STAFF_COLORS = ["#c084fc", "#34d399", "#fbbf24", "#fb7185", "#22d3ee", "#fb923c", "#818cf8", "#f472b6"];
let entryCounter = 0;

function createEmptyEntry(date?: string, time?: string, staffId?: string): BatchEntry {
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
    staffId: staffId || "",
    serviceCustomDurations: {},
    date: date || getArgentinaDateString(),
    time: time || "09:00",
  };
}

function computeEndTime(
  startTime: string,
  services: { id: string; duration_minutes: number }[],
  customDurations: Record<string, number>
): string {
  const totalMin = services.reduce(
    (sum, s) => sum + (customDurations[s.id] ?? s.duration_minutes),
    0
  );
  const [h, m] = startTime.split(":").map(Number);
  const endMinutes = h * 60 + m + totalMin;
  const newH = Math.floor(endMinutes / 60) % 24;
  const newM = endMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
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
  const [entry, setEntry] = useState<BatchEntry>(() => createEmptyEntry());
  const [entryError, setEntryError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const pendingCountRef = useRef(0);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const handleClose = useCallback(() => {
    const hasData =
      entry.customerId !== "" ||
      entry.isNewCustomer ||
      entry.serviceIds.length > 0;
    const hasPending = pendingCountRef.current > 0;
    if ((hasData || hasPending) && !window.confirm(hasPending
      ? "Hay turnos guardándose. ¿Cerrar de todos modos?"
      : "¿Cerrar? Se perderá el turno sin guardar.")) return;
    onCloseRef.current();
  }, [entry]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, handleClose]);

  useEffect(() => {
    if (open) {
      entryCounter = 0;
      setEntry(createEmptyEntry());
      setEntryError(null);
      setHistory([]);
      pendingCountRef.current = 0;
      requestAnimationFrame(() => {
        customerInputRef.current?.focus();
      });
    }
  }, [open]);

  function updateEntry(patch: Partial<BatchEntry>) {
    setEntry((prev) => ({ ...prev, ...patch }));
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

  function validate(): string | null {
    if (entry.serviceIds.length === 0) return "Seleccioná al menos un servicio";
    if (entry.isNewCustomer && !entry.newCustomerName.trim()) return "Completá el nombre del cliente nuevo";
    if (!entry.isNewCustomer && !entry.customerId) return "Seleccioná un cliente";
    return null;
  }

  function buildFormData(e: BatchEntry): FormData {
    const form = document.createElement("form");
    const formData = new FormData(form);
    if (e.isNewCustomer) {
      formData.set("customer_name", e.newCustomerName.trim());
      formData.set("customer_email", e.newCustomerEmail.trim());
      formData.set("customer_phone", e.newCustomerPhone.trim());
    } else {
      formData.set("customer_id", e.customerId);
    }
    formData.set("service_ids", e.serviceIds.join(","));
    formData.set("service_durations", JSON.stringify(e.serviceCustomDurations));
    formData.set("start_date", e.date);
    formData.set("start_time", e.time);
    if (e.staffId) formData.set("staff_id", e.staffId);
    return formData;
  }

  function handleSave(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const err = validate();
    if (err) {
      setEntryError(err);
      return;
    }
    setEntryError(null);

    const snapshot = { ...entry };
    const matchedServices = services.filter((s) => snapshot.serviceIds.includes(s.id));
    const nextTime = computeEndTime(snapshot.time, matchedServices, snapshot.serviceCustomDurations);
    const prevStaff = snapshot.staffId;

    const serviceNames = matchedServices.map((s) => s.name).join(", ");
    const customerName = snapshot.isNewCustomer
      ? snapshot.newCustomerName.trim()
      : customers.find((c) => c.id === snapshot.customerId)?.nombre || "Cliente";

    const historyId = `hist-${Date.now()}`;
    const newHistoryItem: HistoryItem = {
      id: historyId,
      status: "pending",
      customerName,
      serviceNames,
      time: snapshot.time,
      date: snapshot.date,
      snapshot,
    };
    setHistory((prev) => [newHistoryItem, ...prev]);

    setEntry(createEmptyEntry(snapshot.date, nextTime, prevStaff));
    pendingCountRef.current++;
    setSaving(true);
    setTimeout(() => setSaving(false), 800);

    requestAnimationFrame(() => {
      customerInputRef.current?.focus();
    });

    const formData = buildFormData(snapshot);
    const resultPromise = snapshot.isNewCustomer
      ? createCustomerAndAppointment(formData, shopId)
      : createAppointment(formData, shopId);

    resultPromise.then((result) => {
      pendingCountRef.current--;
      if (result.success) {
        onSuccess?.();
        setHistory((prev) =>
          prev.map((h) => (h.id === historyId ? { ...h, status: "ok" as const } : h))
        );
        addToast("Turno creado", "success");
      } else {
        setHistory((prev) =>
          prev.map((h) =>
            h.id === historyId
              ? { ...h, status: "error" as const, errorMsg: getUserFriendlyError(result.error) }
              : h
          )
        );
        addToast(getUserFriendlyError(result.error), "error");
      }
    });
  }

  function restoreFailedEntry(item: HistoryItem) {
    if (!item.snapshot) return;
    setEntry({
      ...item.snapshot,
      id: `entry-${++entryCounter}`,
      customerSearchOpen: false,
      serviceSearchOpen: false,
    });
    requestAnimationFrame(() => {
      customerInputRef.current?.focus();
    });
  }

  if (!open) return null;

  const modalNode = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) handleClose(); }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/20 sm:backdrop-blur-sm p-3 sm:p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.65 }}
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl w-full max-w-2xl overflow-hidden max-h-[88dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Crear múltiples turnos
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {history.length > 0
                    ? `${history.filter((h) => h.status === "ok").length} creado${history.filter((h) => h.status === "ok").length !== 1 ? "s" : ""}${history.some((h) => h.status === "pending") ? `, ${history.filter((h) => h.status === "pending").length} guardando...` : ""}`
                    : "Completá el turno y guardá para crear otro"}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <FormWithKeyboardNav onSubmit={handleSave} onCancel={handleClose} className="flex flex-col flex-1 min-h-0" autoFocusOnMount={false}>
              <div ref={scrollRef} className="overflow-y-auto flex-1 p-4 space-y-3">
                {entryError && (
                  <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs px-3 py-2 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{entryError}</span>
                  </div>
                )}
                <EntryForm
                  entry={entry}
                  services={services}
                  staff={staff}
                  customerFiltered={filteredCustomers(entry.customerSearchQuery)}
                  serviceFiltered={filteredServices(entry.serviceSearchQuery)}
                  onUpdate={updateEntry}
                  customerInputRef={customerInputRef}
                  scrollRef={scrollRef}
                />

                {history.length > 0 && (
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-700/50">
                    <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 mb-1.5 uppercase tracking-wide">
                      Turnos recientes
                    </p>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
                      {history.map((h) => (
                        <div
                          key={h.id}
                          onClick={() => h.status === "error" && restoreFailedEntry(h)}
                          title={h.status === "error" && h.errorMsg ? `${h.customerName} — ${h.errorMsg}` : undefined}
                          className={`shrink-0 flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg border text-xs min-w-[110px] max-w-[140px] ${
                            h.status === "error" ? "cursor-pointer hover:ring-2 hover:ring-red-400/50 active:scale-95 transition-all" : ""
                          } ${
                            h.status === "ok"
                              ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                              : h.status === "error"
                                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                                : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            {h.status === "ok" ? (
                              <Check className="w-3 h-3 shrink-0" />
                            ) : h.status === "error" ? (
                              <AlertCircle className="w-3 h-3 shrink-0" />
                            ) : (
                              <Loader className="w-3 h-3 shrink-0 animate-spin" />
                            )}
                            <span className="font-medium truncate">{h.customerName}</span>
                          </div>
                          <span className="text-[10px] truncate opacity-70">{h.serviceNames}</span>
                          <span className="text-[10px] tabular-nums opacity-60">{h.time}</span>
                          {h.status === "error" && h.errorMsg && (
                            <span className="text-[10px] truncate opacity-70">{h.errorMsg}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end shrink-0">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white py-2 px-6 rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 disabled:opacity-70 disabled:cursor-wait disabled:shadow-none transition-all duration-300 cursor-pointer select-none"
                >
                  {saving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar"
                  )}
                </button>
              </div>
            </FormWithKeyboardNav>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modalNode, document.body);
}

function EntryForm({
  entry,
  services,
  staff,
  customerFiltered,
  serviceFiltered,
  onUpdate,
  customerInputRef,
  scrollRef,
}: {
  entry: BatchEntry;
  services: Service[];
  staff: StaffMember[];
  customerFiltered: Customer[];
  serviceFiltered: Service[];
  onUpdate: (patch: Partial<BatchEntry>) => void;
  customerInputRef: React.RefObject<HTMLInputElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [editingDurationId, setEditingDurationId] = useState<string | null>(null);
  const [editingDurationValue, setEditingDurationValue] = useState("");
  const serviceSearchRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const serviceDropdownRef = useRef<HTMLDivElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const [customerDropdownStyle, setCustomerDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const [serviceDropdownStyle, setServiceDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const recalcStyles = useCallback(() => {
    if (entry.customerSearchOpen && customerInputRef.current) {
      const r = customerInputRef.current.getBoundingClientRect();
      setCustomerDropdownStyle({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    if (entry.serviceSearchOpen && serviceSearchRef.current) {
      const r = serviceSearchRef.current.getBoundingClientRect();
      setServiceDropdownStyle({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [entry.customerSearchOpen, entry.serviceSearchOpen, customerInputRef]);

  useEffect(() => {
    if (!entry.customerSearchOpen && !entry.serviceSearchOpen) {
      setCustomerDropdownStyle(null);
      setServiceDropdownStyle(null);
      return;
    }
    recalcStyles();
    function handleMove() { recalcStyles(); }
    window.addEventListener("resize", handleMove);
    const scrollEl = scrollRef?.current;
    scrollEl?.addEventListener("scroll", handleMove, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", handleMove);
      scrollEl?.removeEventListener("scroll", handleMove, { capture: true });
    };
  }, [entry.customerSearchOpen, entry.serviceSearchOpen, recalcStyles, scrollRef]);

  useEffect(() => {
    if (!entry.customerSearchOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (customerDropdownRef.current?.contains(target)) return;
      if (customerInputRef.current?.contains(target)) return;
      onUpdate({ customerSearchOpen: false });
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [entry.customerSearchOpen, onUpdate, customerInputRef]);

  useEffect(() => {
    if (!entry.serviceSearchOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (serviceDropdownRef.current?.contains(target)) return;
      if (serviceSearchRef.current?.contains(target)) return;
      onUpdate({ serviceSearchOpen: false });
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [entry.serviceSearchOpen, onUpdate]);

  const selServices = useMemo(
    () => services.filter((s) => entry.serviceIds.includes(s.id)),
    [services, entry.serviceIds]
  );

  const totalDur = useMemo(
    () => selServices.reduce((sum, s) => sum + (entry.serviceCustomDurations[s.id] ?? s.duration_minutes), 0),
    [selServices, entry.serviceCustomDurations]
  );

  const totalPrc = useMemo(
    () => selServices.reduce((sum, s) => sum + s.price, 0),
    [selServices]
  );

  function handleCustomerKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && entry.customerSearchOpen) {
      e.preventDefault();
      if (e.key === "ArrowDown") {
        const buttons = customerDropdownRef.current?.querySelectorAll<HTMLButtonElement>("button");
        if (buttons && buttons.length > 0) buttons[0].focus();
      }
      return;
    }
    if (e.key === "Enter" && customerFiltered.length > 0 && entry.customerSearchOpen) {
      e.preventDefault();
      const first = customerDropdownRef.current?.querySelector<HTMLButtonElement>("button");
      first?.click();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onUpdate({ customerSearchOpen: false });
    }
  }

  function handleServiceKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && entry.serviceSearchOpen) {
      e.preventDefault();
      if (e.key === "ArrowDown") {
        const buttons = serviceDropdownRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
        if (buttons && buttons.length > 0) buttons[0].focus();
      }
      return;
    }
    if (e.key === "Enter" && serviceFiltered.length > 0 && entry.serviceSearchOpen) {
      e.preventDefault();
      const first = serviceDropdownRef.current?.querySelector<HTMLButtonElement>("button");
      if (first && !first.disabled) first.click();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onUpdate({ serviceSearchOpen: false });
    }
  }

  return (
    <div className="space-y-3">
      {/* Cliente */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Cliente <span className="text-red-500">*</span>
        </label>
        {!entry.isNewCustomer ? (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
              <input
                ref={customerInputRef}
                data-form-nav="self"
                data-entry-input={entry.id}
                type="text"
                placeholder="Buscar cliente..."
                value={entry.customerSearchQuery}
                onChange={(e) => {
                  onUpdate({ customerSearchQuery: e.target.value, customerSearchOpen: e.target.value.length > 0 });
                  requestAnimationFrame(recalcStyles);
                }}
                onFocus={() => {
                  requestAnimationFrame(recalcStyles);
                }}
                onKeyDown={handleCustomerKeyDown}
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
              />
              {entry.customerSearchOpen && customerDropdownStyle && (customerFiltered.length > 0 || entry.customerSearchQuery.trim()) && typeof document !== "undefined" && createPortal(
                <div
                  ref={customerDropdownRef}
                  onMouseDown={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
                    const activeIdx = buttons.indexOf(document.activeElement as HTMLButtonElement);
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      const next = activeIdx < buttons.length - 1 ? activeIdx + 1 : 0;
                      buttons[next]?.focus();
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (activeIdx > 0) {
                        buttons[activeIdx - 1].focus();
                      } else {
                        customerInputRef.current?.focus();
                      }
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      onUpdate({ customerSearchOpen: false });
                      customerInputRef.current?.focus();
                    }
                  }}
                  style={{ position: "fixed", top: customerDropdownStyle.top, left: customerDropdownStyle.left, width: customerDropdownStyle.width, zIndex: 9999 }}
                  className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden py-1 max-h-48 overflow-y-auto"
                >
                  {customerFiltered.length > 0 ? (
                    customerFiltered.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onUpdate({ customerId: c.id, customerSearchQuery: c.nombre || "Sin nombre", customerSearchOpen: false });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onUpdate({ customerId: c.id, customerSearchQuery: c.nombre || "Sin nombre", customerSearchOpen: false });
                            customerInputRef.current?.focus();
                          }
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onUpdate({ isNewCustomer: true, newCustomerName: entry.customerSearchQuery, customerSearchQuery: "", customerSearchOpen: false });
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          const buttons = customerDropdownRef.current?.querySelectorAll<HTMLButtonElement>("button");
                          if (buttons && buttons.length > 0) {
                            buttons[buttons.length - 1]?.focus();
                          }
                        }
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
                data-form-nav="skip"
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
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Servicios <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <input
            ref={serviceSearchRef}
            data-form-nav="self"
            type="text"
            placeholder="Buscar y agregar servicio..."
            value={entry.serviceSearchQuery}
            onChange={(e) => {
              onUpdate({ serviceSearchQuery: e.target.value, serviceSearchOpen: e.target.value.length > 0 });
              requestAnimationFrame(recalcStyles);
            }}
            onFocus={() => {
              requestAnimationFrame(recalcStyles);
            }}
            onKeyDown={handleServiceKeyDown}
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
          />
          {entry.serviceSearchOpen && serviceFiltered.length > 0 && serviceDropdownStyle && typeof document !== "undefined" && createPortal(
            <div
              ref={serviceDropdownRef}
              onMouseDown={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
                const activeIdx = buttons.indexOf(document.activeElement as HTMLButtonElement);
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const next = activeIdx < buttons.length - 1 ? activeIdx + 1 : 0;
                  buttons[next]?.focus();
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  if (activeIdx > 0) {
                    buttons[activeIdx - 1].focus();
                  } else {
                    serviceSearchRef.current?.focus();
                  }
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onUpdate({ serviceSearchOpen: false });
                  serviceSearchRef.current?.focus();
                }
              }}
              style={{ position: "fixed", top: serviceDropdownStyle.top, left: serviceDropdownStyle.left, width: serviceDropdownStyle.width, zIndex: 9999 }}
              className="bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden py-1 max-h-48 overflow-y-auto"
            >
              {serviceFiltered.map((s) => {
                const already = entry.serviceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (!already) onUpdate({ serviceIds: [...entry.serviceIds, s.id], serviceSearchQuery: "", serviceSearchOpen: false });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!already) onUpdate({ serviceIds: [...entry.serviceIds, s.id], serviceSearchQuery: "", serviceSearchOpen: false });
                      }
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
                        data-form-nav="self"
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
                    data-form-nav="skip"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingDurationId(s.id);
                      setEditingDurationValue(String(effDuration));
                    }}
                    className={`inline-flex items-center gap-0.5 text-xs hover:text-violet-600 transition-colors cursor-pointer select-none ${isCustom ? 'text-violet-600 dark:text-violet-300 font-semibold' : 'opacity-70'}`}
                  >
                    {effDuration}min
                    <Pencil className="w-3 h-3 opacity-60" />
                  </button>
                  )}
                  <button
                    type="button"
                    data-form-nav="skip"
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
              data-form-nav="select"
              onClick={() => onUpdate({ staffId: "" })}
              className={`relative px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer select-none ${
                entry.staffId === ""
                  ? "text-violet-600 dark:text-violet-400"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              }`}
            >
              {entry.staffId === "" && (
                <motion.span layoutId={`staff`} className="absolute inset-0 rounded-lg bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 30 }} />
              )}
              <span className="relative z-10">Cualquiera</span>
            </button>
            {staff.map((s, i) => {
              const isActive = entry.staffId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-form-nav="select"
                  onClick={() => onUpdate({ staffId: isActive ? "" : s.id })}
                  className={`relative inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer select-none ${
                    isActive
                      ? "text-violet-600 dark:text-violet-400"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  }`}
                >
                  {isActive && (
                    <motion.span layoutId={`staff`} className="absolute inset-0 rounded-lg bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 30 }} />
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
                data-form-nav="self"
                value={entry.date}
                onChange={(e) => onUpdate({ date: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    timeInputRef.current?.focus();
                  }
                }}
                className="w-28 bg-transparent text-xs text-gray-900 dark:text-gray-100 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Hora</label>
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800">
              <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <input
                ref={timeInputRef}
                type="time"
                data-form-nav="self"
                value={entry.time}
                onChange={(e) => onUpdate({ time: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.closest("form")?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
                  }
                }}
                className="w-20 bg-transparent text-xs text-gray-900 dark:text-gray-100 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
