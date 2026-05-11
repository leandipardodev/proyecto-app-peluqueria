"use client";

import { X, Plus, UserPlus } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { createAppointment, createCustomerAndAppointment } from "@/lib/dashboard/appointment-actions";
import { playPop } from "@/lib/sound";
import { getArgentinaDateString } from "@/lib/argentina-time";
import { AnimatePresence, motion } from "framer-motion";
import GlassSelect from "@/components/ui/glass-select";

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
  name: string;
  email: string | null;
  phone: string | null;
};

interface AppointmentFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialDate?: string;
  initialHour?: number;
  services: Service[];
  staff: StaffMember[];
  customers: Customer[];
  onCustomerCreated?: (customer: Customer) => void;
}

export default function AppointmentFormModal({
  open,
  onClose,
  onSuccess,
  initialDate,
  initialHour,
  services,
  staff,
  customers,
  onCustomerCreated,
}: AppointmentFormModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setSelectedCustomerId("");
      setSelectedStaffId("");
      setSelectedServiceId("");
      setShowNewCustomer(false);
      setNewCustomerName("");
      setNewCustomerEmail("");
      setNewCustomerPhone("");
      setError(null);
    }
  }, [open]);

  const selectedService = services.find((s) => s.id === selectedServiceId);

  function getDefaultDateTime() {
    const today = initialDate || getArgentinaDateString();
    const hour = initialHour ?? 9;
    return {
      date: today,
      time: `${String(hour).padStart(2, "0")}:00`,
    };
  }

  const defaults = getDefaultDateTime();
  const endTime = selectedService
    ? new Date(
        new Date(`2000-01-01T${defaults.time}`).getTime() +
          selectedService.duration_minutes * 60000
      )
        .toTimeString()
        .slice(0, 5)
    : "";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = showNewCustomer
        ? await createCustomerAndAppointment(formData)
        : await createAppointment(formData);

      if (result.error) {
        setError(result.error);
      } else {
        playPop();
        onSuccess?.();
        onClose();
      }
    });
  }

  return (
    <AnimatePresence>
      {open && (
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
             className="bg-white/60 dark:bg-black/60 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col transition-colors"
            initial={{ opacity: 0, y: 56, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.985 }}
            transition={{ type: "spring", ...IOS_MODAL_SPRING }}
          >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/20 dark:border-white/10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Nuevo Turno</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-white/40 dark:hover:bg-white/10 transition-colors cursor-pointer select-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <form id="appointment-form" onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 bg-red-100/40 dark:bg-red-950/40 backdrop-blur-md border border-red-200/30 dark:border-red-800/30 text-red-700 dark:text-red-300 text-sm px-4 py-2 rounded-2xl">
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer">
                  Cliente
                </label>
                {!showNewCustomer ? (
                  <div className="flex gap-2">
                    <GlassSelect
                      options={customers.map((c) => ({ value: c.id, label: c.name }))}
                      value={selectedCustomerId}
                      onChange={setSelectedCustomerId}
                      placeholder="Seleccionar cliente..."
                      name="customer_id"
                      required
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewCustomer(true)}
                      className="px-3 py-2 border border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/30 backdrop-blur-md rounded-2xl text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/10 transition-all cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-violet-500/20"
                      title="Nuevo cliente"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 p-4 bg-white/40 dark:bg-black/30 backdrop-blur-md rounded-2xl border border-white/20 dark:border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nuevo cliente</span>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomer(false)}
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
                      className="w-full px-3 py-2 rounded-2xl text-sm border border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/30 backdrop-blur-md text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-500/20 transition-all"
                    />
                    <input
                      type="email"
                      name="customer_email"
                      placeholder="Email"
                      value={newCustomerEmail}
                      onChange={(e) => setNewCustomerEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-2xl text-sm border border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/30 backdrop-blur-md text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-500/20 transition-all"
                    />
                    <input
                      type="tel"
                      name="customer_phone"
                      placeholder="Teléfono"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-2xl text-sm border border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/30 backdrop-blur-md text-gray-900 dark:text-gray-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-violet-500/20 transition-all"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer">
                  Staff asignado
                </label>
                <GlassSelect
                  options={staff && staff.length > 0
                    ? staff.map((s) => ({ value: s.id, label: s.name || s.email || s.id }))
                    : [{ value: "", label: "No hay personal registrado" }]
                  }
                  value={selectedStaffId}
                  onChange={setSelectedStaffId}
                  placeholder="Seleccionar staff..."
                  name="staff_id"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer">
                  Servicio
                </label>
                <GlassSelect
                  options={services.map((s) => ({
                    value: s.id,
                    label: `${s.name} — $${s.price.toFixed(2)} (${s.duration_minutes} min)`,
                  }))}
                  value={selectedServiceId}
                  onChange={setSelectedServiceId}
                  placeholder="Seleccionar servicio..."
                  name="service_id"
                  required
                />
                {selectedService && (
                  <p className="mt-1.5 text-xs text-zinc-400">
                    Duración: {selectedService.duration_minutes} min | Precio: ${selectedService.price.toFixed(2)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer">
                    Fecha
                  </label>
                  <input
                    type="date"
                    id="start_date"
                    name="start_date"
                    defaultValue={defaults.date}
                    required
                    className="w-full px-3 py-2 rounded-2xl text-sm border border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/30 backdrop-blur-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer">
                    Hora inicio
                  </label>
                  <input
                    type="time"
                    id="start_time"
                    name="start_time"
                    defaultValue={defaults.time}
                    required
                    className="w-full px-3 py-2 rounded-2xl text-sm border border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/30 backdrop-blur-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-500/20 transition-all"
                  />
                </div>
              </div>

              {endTime && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer">
                    Hora fin (calculada)
                  </label>
                  <div className="px-3 py-2 bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl text-sm text-zinc-500 dark:text-zinc-400">
                    {endTime}
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-white/20 dark:border-white/10">
          <button
            type="submit"
            form="appointment-form"
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 bg-violet-600/90 backdrop-blur-md text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer select-none"
          >
            <Plus className="w-4 h-4" />
            {pending ? "Creando..." : "Crear Turno"}
          </button>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
