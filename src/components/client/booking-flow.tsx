"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { fetchPublicAvailableSlots } from "@/lib/dashboard/booking/public-booking-actions";
import { createClientAppointment } from "@/lib/dashboard/clients/actions";
import {
  Check, ShoppingCart, CreditCard, Landmark, Smartphone,
} from "lucide-react";
import { getArgentinaDateString } from "@/lib/argentina-time";

interface Service {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration_minutes: number;
}

interface StaffMember {
  user_id: string;
  name: string;
  photo_url?: string | null;
  description?: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
}

interface Slot {
  start: string;
  end: string;
  time: string;
}

interface BookingFlowProps {
  shopId: string;
  services: Service[];
  staffMembers?: StaffMember[];
  staffServicesMap: Record<string, string[]>;
  selectedServiceId?: string | null;
  selectedStaffId?: string | null;
}

type Step = "services" | "staff" | "datetime" | "checkout" | "confirm";

export default function BookingFlow({ shopId, services, staffMembers, staffServicesMap, selectedServiceId, selectedStaffId }: BookingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("services");
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mpLink, setMpLink] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"mercadopago" | "local" | null>(null);

  useEffect(() => {
    if (!selectedServiceId) return;
    const service = services.find((s) => s.id === selectedServiceId);
    if (service) {
      setSelectedServices([service]);
      setStep(staffMembers && staffMembers.length > 0 ? "staff" : "datetime");
    }
  }, [selectedServiceId, services, staffMembers]);

  useEffect(() => {
    if (!selectedStaffId || !staffMembers || staffMembers.length === 0) return;
    const staff = staffMembers.find((s) => s.user_id === selectedStaffId);
    if (staff) {
      setSelectedStaff(staff);
    }
  }, [selectedStaffId, staffMembers]);

  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration_minutes, 0);

  function toggleService(service: Service) {
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.id === service.id);
      if (exists) return prev.filter((s) => s.id !== service.id);
      return [...prev, service];
    });
    setSelectedDate("");
    setSlots([]);
    setSelectedSlot(null);
    setSelectedStaff(null);
    setMpLink(null);
  }

  function handleServicesNext() {
    if (selectedServices.length === 0) {
      setError("Seleccioná al menos un servicio");
      return;
    }
    setError(null);
    if (staffMembers && staffMembers.length > 0) {
      setStep("staff");
    } else {
      setStep("datetime");
    }
  }

  function handleStaffSelect(staff: StaffMember) {
    setSelectedStaff(staff);
    setStep("datetime");
    setSelectedDate("");
    setSlots([]);
    setSelectedSlot(null);
  }

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const date = e.target.value;
    setSelectedDate(date);
    setSelectedSlot(null);

    if (date && selectedServices.length > 0) {
      setLoading(true);
      const staffFilter = selectedStaff?.user_id || undefined;
      fetchPublicAvailableSlots(shopId, totalDuration, date, staffFilter)
        .then((result) => {
          if (result.success) {
            setSlots(result.data ?? []);
          } else {
            setError(result.error);
          }
        })
        .catch(() => {
          setError("Error al cargar horarios disponibles");
        })
        .finally(() => setLoading(false));
    } else {
      setSlots([]);
    }
  }

  function handleSlotSelect(slot: Slot) {
    setSelectedSlot(slot);
    setPaymentMethod(null);
    setMpLink(null);
    setStep("checkout");
  }

  async function generateMpLink() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          items: selectedServices.map((s) => ({
            id: s.id,
            title: s.name,
            quantity: 1,
          })),
        }),
      });
      const data = await res.json();
      if (data.init_point) {
        setMpLink(data.init_point);
      } else {
        setError("Error al generar el link de pago");
      }
    } catch {
      setError("Error al conectar con Mercado Pago");
    } finally {
      setLoading(false);
    }
  }

  function handlePayLater() {
    if (selectedServices.length === 0 || !selectedSlot) return;
    if (!phone.trim()) {
      setError("El teléfono es obligatorio para recibir recordatorios");
      return;
    }
    setStep("confirm");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("service_id", selectedServices[0].id);
      formData.set("service_ids", selectedServices.map((s) => s.id).join(","));
      formData.set("start_time", selectedSlot.start);
      formData.set("end_time", selectedSlot.end);
      formData.set("phone", phone.trim());
      formData.set("is_paid", "false");
      formData.set("payment_method", "local");
      if (selectedStaff) {
        formData.set("staff_id", selectedStaff.user_id);
      }
      const result = await createClientAppointment(formData);
      if (!result.success) {
        setError(result.error);
      } else {
        router.push("/client/appointments?success=true");
      }
    });
  }

  const availableStaff = useMemo(() => {
    if (!staffMembers || staffMembers.length === 0) return [];
    if (selectedServices.length === 0) return staffMembers;
    const selectedIds = new Set(selectedServices.map((s) => s.id));
    return staffMembers.filter((s) => {
      if (s.user_id === "") return true; // "Sin preferencia" always available
      const myServiceIds = staffServicesMap[s.user_id];
      if (!myServiceIds || myServiceIds.length === 0) return true; // no assignments = legacy mode
      return myServiceIds.some((sid) => selectedIds.has(sid));
    });
  }, [staffMembers, staffServicesMap, selectedServices]);

  useEffect(() => {
    if (selectedStaff && !availableStaff.find((s) => s.user_id === selectedStaff.user_id)) {
      setSelectedStaff(null);
    }
  }, [availableStaff, selectedStaff]);

  function getMinDate() {
    return getArgentinaDateString();
  }

  function getStepNumber(currentStep: Step): number {
    const steps = ["services", "staff", "datetime", "checkout", "confirm"] as Step[];
    if (currentStep === "confirm") return 5;
    if (currentStep === "checkout") return 4;
    return steps.indexOf(currentStep) + 1;
  }

  const allSteps: Step[] = staffMembers && staffMembers.length > 0
    ? ["services", "staff", "datetime", "checkout"]
    : ["services", "datetime", "checkout"];

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {allSteps.map((s) => {
          const stepNum = getStepNumber(s);
          const currentStepNum = getStepNumber(step);
          const isComplete = stepNum < currentStepNum;
          const isCurrent = s === step;
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isCurrent
                    ? "bg-violet-600 text-white"
                    : isComplete
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {stepNum}
              </div>
              {stepNum < allSteps.length && (
                <div
                  className={`h-1 w-12 ${
                    isComplete ? "bg-green-500" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Select Services (Multi-select) */}
      {step === "services" && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-violet-600" />
            Elegí tus servicios
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Podés seleccionar uno o varios servicios
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => {
              const isSelected = selectedServices.some((s) => s.id === service.id);
              return (
                <div
                  key={service.id}
                  onClick={() => toggleService(service)}
                  className={`bg-white dark:bg-gray-900 rounded-xl border p-5 hover:border-violet-300 hover:shadow-md cursor-pointer transition-all ${
                    isSelected
                      ? "border-violet-500 ring-2 ring-violet-200 dark:ring-violet-800"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{service.name}</h3>
                    {isSelected && <Check className="w-5 h-5 text-violet-600 shrink-0 ml-2" />}
                  </div>
                  {service.description && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{service.description}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {service.duration_minutes} min
                    </span>
                    <span className="text-lg font-bold text-violet-600">
                      ${service.price.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {selectedServices.length > 0 && (
            <div className="mt-6 flex items-center justify-between p-4 bg-violet-50 dark:bg-violet-950 rounded-xl border border-violet-200 dark:border-violet-800">
              <div>
                <span className="text-sm text-gray-600 dark:text-gray-400">{selectedServices.length} servicio(s) seleccionado(s)</span>
                <p className="text-lg font-bold text-violet-700 dark:text-violet-300">Total: ${totalPrice.toFixed(2)}</p>
              </div>
              <button
                onClick={handleServicesNext}
                className="px-6 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors cursor-pointer select-none"
              >
                Continuar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select Staff */}
      {step === "staff" && selectedServices.length > 0 && staffMembers && staffMembers.length > 0 && (
        <div className="space-y-6">
          <div>
            <button
              onClick={() => setStep("services")}
              className="text-sm text-violet-600 hover:text-violet-700 cursor-pointer select-none"
            >
              ← Volver a servicios
            </button>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {selectedServices.map((s) => s.name).join(", ")}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalDuration} min - ${totalPrice.toFixed(2)}
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Elegí tu peluquero
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableStaff.map((staff) => {
                const initials = staff.name.charAt(0).toUpperCase();
                return (
                  <div
                    key={staff.user_id}
                    onClick={() => handleStaffSelect(staff)}
                    className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-violet-300 hover:shadow-md cursor-pointer transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-violet-100 dark:bg-violet-900 flex items-center justify-center shrink-0">
                        {staff.photo_url ? (
                          <img src={staff.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-base font-bold text-violet-600 dark:text-violet-300">{initials}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{staff.name}</h3>
                        {staff.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{staff.description}</p>
                        )}
                        {(staff.instagram || staff.whatsapp) && (
                          <div className="flex items-center gap-2 mt-1.5">
                            {staff.instagram && (
                              <span className="text-[11px] text-gray-400 dark:text-gray-500">@{staff.instagram.replace(/^@/, "")}</span>
                            )}
                            {staff.whatsapp && (
                              <span className="text-[11px] text-gray-400 dark:text-gray-500">{staff.whatsapp}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {availableStaff.length > 0 && (
                <div
                  onClick={() => handleStaffSelect({ user_id: "", name: "Sin preferencia" } as StaffMember)}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:border-violet-300 hover:shadow-md cursor-pointer transition-all"
                >
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Sin preferencia</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cualquier peluquero disponible</p>
                </div>
              )}
            </div>
            {availableStaff.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay peluqueros disponibles para los servicios seleccionados.</p>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Select Date and Time */}
      {step === "datetime" && selectedServices.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <div>
            <button
              onClick={() => setStep(staffMembers && staffMembers.length > 0 ? "staff" : "services")}
              className="text-sm text-violet-600 hover:text-violet-700 cursor-pointer select-none"
            >
              ← Volver
            </button>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {selectedServices.map((s) => s.name).join(", ")}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalDuration} min - ${totalPrice.toFixed(2)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Fecha
            </label>
            <input
              type="date"
              min={getMinDate()}
              value={selectedDate}
              onChange={handleDateChange}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {selectedDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Horarios Disponibles
              </label>
              {loading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargando...</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No hay horarios disponibles para esta fecha.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.start}
                      onClick={() => handleSlotSelect(slot)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:text-gray-100 hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors cursor-pointer select-none"
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 4: Checkout - Payment Method Selection */}
      {step === "checkout" && selectedServices.length > 0 && selectedSlot && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-white/20 dark:border-gray-700/30 shadow-xl p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-violet-600" />
              Checkout
            </h2>

            {/* Order summary */}
            <div className="space-y-3 bg-white dark:bg-zinc-900 rounded-xl p-4">
              {selectedServices.map((svc) => (
                <div key={svc.id} className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{svc.name}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">${svc.price.toFixed(2)}</span>
                </div>
              ))}
              {selectedStaff && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Peluquero</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedStaff.name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Fecha</span>
                <span suppressHydrationWarning className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {new Date(selectedSlot.start).toLocaleDateString("es-AR")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Hora</span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedSlot.time}</span>
              </div>
              <div className="border-t border-gray-200/50 dark:border-gray-600/50 pt-2">
                <div className="flex justify-between">
                  <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Total</span>
                  <span className="text-lg font-bold text-violet-600">${totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Phone input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Teléfono <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setPaymentMethod(null); }}
                required
                placeholder="Ej: 11 1234-5678"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white/50 dark:bg-gray-950/50 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent backdrop-blur-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lo usaremos para enviarte recordatorios</p>
            </div>

            {/* Payment method selection */}
            <AnimatePresence mode="wait">
              {!paymentMethod ? (
                <motion.div
                  key="selection"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center italic">
                    Podés señar tu turno ahora para asegurar tu lugar o pagar directamente al finalizar el servicio
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Option: Pay with MP */}
                    <motion.button
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        if (!phone.trim()) {
                          setError("El teléfono es obligatorio para recibir recordatorios");
                          return;
                        }
                        setError(null);
                        setPaymentMethod("mercadopago");
                        generateMpLink();
                      }}
                      disabled={loading}
                      className="relative group text-left bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl rounded-xl border border-white/30 dark:border-gray-600/30 p-5 shadow-lg hover:shadow-violet-200/30 dark:hover:shadow-violet-900/30 transition-all disabled:opacity-50 cursor-pointer select-none"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-blue-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative z-10 flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                          <Smartphone className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Pagar ahora con Mercado Pago</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Pagá online con tarjeta, débito o efectivo</p>
                        </div>
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-3 py-1 rounded-full">
                          Asegurás tu turno
                        </span>
                      </div>
                    </motion.button>

                    {/* Option: Pay at location */}
                    <motion.button
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        if (!phone.trim()) {
                          setError("El teléfono es obligatorio para recibir recordatorios");
                          return;
                        }
                        setError(null);
                        setPaymentMethod("local");
                      }}
                      className="relative group text-left bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl rounded-xl border border-white/30 dark:border-gray-600/30 p-5 shadow-lg hover:shadow-emerald-200/30 dark:hover:shadow-emerald-900/30 transition-all cursor-pointer select-none"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative z-10 flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                          <Landmark className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Pagar en el local</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Abonás al llegar, sin procesar el pago ahora</p>
                        </div>
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 rounded-full">
                          Sin costo adicional
                        </span>
                      </div>
                    </motion.button>
                  </div>

                  <button
                    onClick={() => setStep("datetime")}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer select-none"
                  >
                    Volver
                  </button>
                </motion.div>
              ) : paymentMethod === "local" ? (
                <motion.div
                  key="local-confirm"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <div className="bg-emerald-50/50 dark:bg-emerald-950/30 backdrop-blur-sm rounded-xl border border-emerald-200/50 dark:border-emerald-800/30 p-4 text-center">
                    <Landmark className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Pagás en el local</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Vas a abonar cuando llegues a tu turno. No te preocupes, te recordaremos tu cita.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={handlePayLater}
                      disabled={pending}
                      className="w-full px-6 py-3 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer select-none"
                    >
                      {pending ? "Reservando..." : "Confirmar reserva"}
                    </button>
                    <button
                      onClick={() => setPaymentMethod(null)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer select-none"
                    >
                      Elegir otro método
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="mp-flow"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  {!mpLink ? (
                    <div className="text-center py-6">
                      <div className="w-10 h-10 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">Generando link de pago...</p>
                    </div>
                  ) : (
                    <div className="bg-blue-50/50 dark:bg-blue-950/30 backdrop-blur-sm rounded-xl border border-blue-200/50 dark:border-blue-800/30 p-4 text-center">
                      <Smartphone className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">Pagás con Mercado Pago</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Te redirigimos a Mercado Pago para procesar el pago.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    <a
                      href={mpLink || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer select-none ${!mpLink ? "pointer-events-none opacity-50" : ""}`}
                    >
                      {mpLink ? "Ir a pagar" : "Generando..."}
                    </a>
                    <button
                      onClick={() => { setPaymentMethod(null); setMpLink(null); }}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer select-none"
                    >
                      Elegir otro método
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* Step 5: Confirm */}
      {step === "confirm" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="bg-white dark:bg-zinc-900 rounded-2xl border border-white/20 dark:border-gray-700/30 shadow-xl p-6 space-y-6 text-center"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <Check className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Turno reservado con éxito
          </h2>
          {paymentMethod === "local" ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Recordá que el pago lo realizás en el local. Te enviamos un recordatorio al {phone}
            </p>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Te enviamos un recordatorio al {phone}
            </p>
          )}
          <button
            onClick={() => router.push("/client/appointments")}
            className="px-6 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors cursor-pointer select-none"
          >
            Ver mis turnos
          </button>
        </motion.div>
      )}
    </div>
  );
}
