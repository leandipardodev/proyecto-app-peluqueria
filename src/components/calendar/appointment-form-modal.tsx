"use client";

import { X, Plus, UserPlus } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { createAppointment, createCustomerAndAppointment } from "@/lib/dashboard/appointment-actions";
import { playPop } from "@/lib/sound";

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

  if (!open) return null;

  const selectedService = services.find((s) => s.id === selectedServiceId);

  function getDefaultDateTime() {
    const today = initialDate || new Date().toISOString().split("T")[0];
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
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg dark:shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col transition-colors">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nuevo Turno</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer select-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <form id="appointment-form" onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 cursor-pointer">
                  Cliente
                </label>

                {!showNewCustomer ? (
                  <div className="flex gap-2">
                    <select
                      name="customer_id"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      required
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent cursor-pointer"
                    >
                      <option value="">Seleccionar cliente...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewCustomer(true)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer select-none"
                      title="Nuevo cliente"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        Nuevo cliente
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomer(false)}
                          className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer select-none"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                    <input
                      type="email"
                      name="customer_email"
                      placeholder="Email"
                      value={newCustomerEmail}
                      onChange={(e) => setNewCustomerEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                    <input
                      type="tel"
                      name="customer_phone"
                      placeholder="Teléfono"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              <div>
                  <label
                    htmlFor="staff_id"
                    className="block text-sm font-medium text-gray-700 mb-1.5 cursor-pointer"
                  >
                    Staff asignado
                  </label>
                    <select
                    id="staff_id"
                    name="staff_id"
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent cursor-pointer"
                >
                  <option value="">Seleccionar staff...</option>
                  {staff && staff.length > 0 ? (
                    staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || s.email || s.id}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>No hay personal registrado</option>
                  )}
                </select>
              </div>

              <div>
                <label
                    htmlFor="service_id"
                    className="block text-sm font-medium text-gray-700 mb-1.5 cursor-pointer"
                  >
                    Servicio
                  </label>
                  <select
                    id="service_id"
                    name="service_id"
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent cursor-pointer"
                >
                  <option value="">Seleccionar servicio...</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — ${s.price.toFixed(2)} ({s.duration_minutes}{" "}
                      min)
                    </option>
                  ))}
                </select>
                {selectedService && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    Duración: {selectedService.duration_minutes} min | Precio: $
                    {selectedService.price.toFixed(2)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="start_date"
                    className="block text-sm font-medium text-gray-700 mb-1.5 cursor-pointer"
                  >
                    Fecha
                  </label>
                  <input
                    type="date"
                    id="start_date"
                    name="start_date"
                    defaultValue={defaults.date}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="start_time"
                    className="block text-sm font-medium text-gray-700 mb-1.5 cursor-pointer"
                  >
                    Hora inicio
                  </label>
                  <input
                    type="time"
                    id="start_time"
                    name="start_time"
                    defaultValue={defaults.time}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
              </div>

              {endTime && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 cursor-pointer">
                    Hora fin (calculada)
                  </label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                    {endTime}
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-gray-200">
          <button
            type="submit"
            form="appointment-form"
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
          >
            <Plus className="w-4 h-4" />
            {pending ? "Creando..." : "Crear Turno"}
          </button>
        </div>
      </div>
    </div>
  );
}
