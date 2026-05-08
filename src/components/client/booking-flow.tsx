"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchAvailableSlots } from "@/lib/dashboard/client-actions";
import { createClientAppointment } from "@/lib/dashboard/client-actions";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, Check } from "lucide-react";

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

type Step = "service" | "staff" | "datetime" | "confirm";

export default function BookingFlow({ shopId, services, staffMembers, selectedServiceId, selectedStaffId }: BookingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("service");
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!selectedServiceId) return;

    const service = services.find((s) => s.id === selectedServiceId);
    if (!service) return;

    setSelectedService(service);

    if (selectedStaffId && staffMembers) {
      const staff = staffMembers.find((s) => s.user_id === selectedStaffId);
      if (staff) {
        setSelectedStaff(staff);
        setStep("datetime");
        return;
      }
    }

    if (staffMembers && staffMembers.length > 0) {
      setStep("staff");
    } else {
      setStep("datetime");
    }
  }, [selectedServiceId, selectedStaffId, services, staffMembers]);

  function handleServiceSelect(service: Service) {
    setSelectedService(service);
    if (staffMembers && staffMembers.length > 0) {
      setStep("staff");
    } else {
      setStep("datetime");
    }
    setSelectedDate("");
    setSlots([]);
    setSelectedSlot(null);
    setSelectedStaff(null);
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

    if (date && selectedService) {
      setLoading(true);
      fetchAvailableSlots(selectedService.id, date)
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
    setStep("confirm");
  }

  function handleConfirm() {
    if (!selectedService || !selectedSlot) return;

    if (!phone.trim()) {
      setError("El teléfono es obligatorio para recibir recordatorios");
      return;
    }

    const formData = new FormData();
    formData.set("service_id", selectedService.id);
    formData.set("start_time", selectedSlot.start);
    formData.set("end_time", selectedSlot.end);
    formData.set("phone", phone.trim());
    if (selectedStaff) {
      formData.set("staff_id", selectedStaff.user_id);
    }

    startTransition(async () => {
      const result = await createClientAppointment(formData);
      if (result.error) {
        setError(result.error);
      } else {
        router.push("/client/appointments?success=true");
      }
    });
  }

  function getMinDate() {
    const today = new Date();
    return today.toISOString().split("T")[0];
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {(["service", "staff", "datetime", "confirm"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? "bg-violet-600 text-white"
                  : i < ["service", "staff", "datetime", "confirm"].indexOf(step)
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {i + 1}
            </div>
            {i < 3 && (
              <div
                className={`h-1 w-12 ${
                  i < ["service", "staff", "datetime", "confirm"].indexOf(step)
                    ? "bg-green-500"
                    : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Select Service */}
      {step === "service" && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-violet-600" />
            Elegí tu servicio
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => (
              <div
                key={service.id}
                onClick={() => handleServiceSelect(service)}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-violet-300 hover:shadow-md cursor-pointer transition-all"
              >
                <h3 className="font-semibold text-gray-900">{service.name}</h3>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    {service.duration_minutes} min
                  </span>
                  <span className="text-lg font-bold text-violet-600">
                    ${service.price.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Select Staff */}
      {step === "staff" && selectedService && staffMembers && staffMembers.length > 0 && (
        <div className="space-y-6">
          <div>
            <button
              onClick={() => setStep("service")}
              className="text-sm text-violet-600 hover:text-violet-700"
            >
              ← Volver a servicios
            </button>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">
              {selectedService.name}
            </h3>
            <p className="text-sm text-gray-500">
              {selectedService.duration_minutes} min - $
              {selectedService.price.toFixed(2)}
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Elegí tu peluquero
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffMembers.map((staff) => (
                <div
                  key={staff.user_id}
                  onClick={() => handleStaffSelect(staff)}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:border-violet-300 hover:shadow-md cursor-pointer transition-all"
                >
                  <h3 className="font-semibold text-gray-900">{staff.name}</h3>
                </div>
              ))}
              {/* Option for no preference */}
              <div
                onClick={() => handleStaffSelect({ user_id: "", name: "Sin preferencia" })}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-violet-300 hover:shadow-md cursor-pointer transition-all"
              >
                <h3 className="font-semibold text-gray-900">Sin preferencia</h3>
                <p className="text-sm text-gray-500 mt-1">Cualquier peluquero disponible</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Select Date and Time */}
      {step === "datetime" && selectedService && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div>
            <button
              onClick={() => setStep("service")}
              className="text-sm text-violet-600 hover:text-violet-700"
            >
              ← Volver a servicios
            </button>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">
              {selectedService.name}
            </h3>
            <p className="text-sm text-gray-500">
              {selectedService.duration_minutes} min - $
              {selectedService.price.toFixed(2)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha
            </label>
            <input
              type="date"
              min={getMinDate()}
              value={selectedDate}
              onChange={handleDateChange}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {selectedDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Horarios Disponibles
              </label>
              {loading ? (
                <p className="text-sm text-gray-500">Cargando...</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No hay horarios disponibles para esta fecha.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.start}
                      onClick={() => handleSlotSelect(slot)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:border-violet-500 hover:bg-violet-50 transition-colors"
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

      {/* Step 4: Confirm */}
      {step === "confirm" && selectedService && selectedSlot && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Check className="w-5 h-5 text-green-600" />
            Confirmar Turno
          </h2>

          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Servicio</span>
              <span className="text-sm font-medium text-gray-900">
                {selectedService.name}
              </span>
            </div>
            {selectedStaff && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Peluquero</span>
                <span className="text-sm font-medium text-gray-900">
                  {selectedStaff.name}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Fecha</span>
              <span className="text-sm font-medium text-gray-900">
                {new Date(selectedSlot.start).toLocaleDateString("es-AR")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Hora</span>
              <span className="text-sm font-medium text-gray-900">
                {selectedSlot.time}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Duración</span>
              <span className="text-sm font-medium text-gray-900">
                {selectedService.duration_minutes} min
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Precio</span>
              <span className="text-lg font-bold text-violet-600">
                ${selectedService.price.toFixed(2)}
              </span>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="Ej: 11 1234-5678"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500">
                Lo usaremos para enviarte recordatorios
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("datetime")}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Volver
            </button>
            <button
              onClick={handleConfirm}
              disabled={pending}
              className="px-6 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Confirmando..." : "Confirmar Turno"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
