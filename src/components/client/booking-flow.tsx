"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchAvailableSlots, createClientAppointment } from "@/lib/dashboard/client-actions";
import { Check, ShoppingCart, CreditCard } from "lucide-react";
import { getArgentinaDateString } from "@/lib/argentina-time";

interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface StaffMember {
  user_id: string;
  name: string;
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
  selectedServiceId?: string | null;
  selectedStaffId?: string | null;
}

type Step = "services" | "staff" | "datetime" | "checkout" | "confirm";

export default function BookingFlow({ shopId, services, staffMembers, selectedServiceId, selectedStaffId }: BookingFlowProps) {
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
      fetchAvailableSlots(selectedServices[0].id, date, staffFilter, totalDuration)
        .then((result) => {
          setSlots(result as unknown as Slot[]);
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
    setStep("checkout");
  }

  async function generateMpLink(total: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedServices.map((s) => ({
            title: s.name,
            quantity: 1,
            unit_price: s.price,
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

  function handleConfirmWithoutPayment() {
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
      if (selectedStaff) {
        formData.set("staff_id", selectedStaff.user_id);
      }
      const result = await createClientAppointment(formData);
      if (result.error) {
        setError(result.error);
      } else {
        router.push("/client/appointments?success=true");
      }
    });
  }

  function handlePaymentComplete() {
    if (selectedServices.length === 0 || !selectedSlot) return;
    setStep("confirm");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("service_id", selectedServices[0].id);
      formData.set("service_ids", selectedServices.map((s) => s.id).join(","));
      formData.set("start_time", selectedSlot.start);
      formData.set("end_time", selectedSlot.end);
      formData.set("phone", phone.trim());
      if (selectedStaff) {
        formData.set("staff_id", selectedStaff.user_id);
      }
      const result = await createClientAppointment(formData);
      if (result.error) {
        setError(result.error);
      } else {
        router.push("/client/appointments?success=true");
      }
    });
  }

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
              {staffMembers.map((staff) => (
                <div
                  key={staff.user_id}
                  onClick={() => handleStaffSelect(staff)}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:border-violet-300 hover:shadow-md cursor-pointer transition-all"
                >
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{staff.name}</h3>
                </div>
              ))}
              <div
                onClick={() => handleStaffSelect({ user_id: "", name: "Sin preferencia" })}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:border-violet-300 hover:shadow-md cursor-pointer transition-all"
              >
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Sin preferencia</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Cualquier peluquero disponible</p>
              </div>
            </div>
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

      {/* Step 4: Checkout with Mercado Pago */}
      {step === "checkout" && selectedServices.length > 0 && selectedSlot && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-violet-600" />
            Checkout
          </h2>

          <div className="space-y-4">
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
            <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
              <div className="flex justify-between">
                <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Total</span>
                <span className="text-lg font-bold text-violet-600">${totalPrice.toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Teléfono <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="Ej: 11 1234-5678"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lo usaremos para enviarte recordatorios</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => setStep("datetime")}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer select-none"
            >
              Volver
            </button>
            {!mpLink ? (
              <button
                onClick={() => generateMpLink(totalPrice)}
                disabled={loading || !phone.trim()}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer select-none"
              >
                {loading ? "Generando link..." : "Pagar con Mercado Pago"}
              </button>
            ) : (
              <div className="space-y-3">
                <a
                  href={mpLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors cursor-pointer select-none"
                >
                  Ir a pagar
                </a>
                <button
                  onClick={handlePaymentComplete}
                  className="w-full px-6 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors cursor-pointer select-none"
                >
                  Ya pagué / Confirmar sin pago
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 5: Confirm */}
      {step === "confirm" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <Check className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Turno reservado con éxito
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Te enviamos un recordatorio al {phone}
          </p>
          <button
            onClick={() => router.push("/client/appointments")}
            className="px-6 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors cursor-pointer select-none"
          >
            Ver mis turnos
          </button>
        </div>
      )}
    </div>
  );
}
