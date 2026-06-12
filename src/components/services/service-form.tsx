"use client";

import { createService, updateService, fetchServices } from "@/lib/dashboard/service-actions";
import { getServiceStaffIds } from "@/lib/dashboard/staff-actions";
import { useEffect, useRef, useState, useTransition, memo } from "react";

interface ServiceFormProps {
  shopId: string;
  service?: {
    id: string;
    name: string;
    category: string;
    price: number;
    duration_minutes: number;
    pay_at_shop?: boolean;
  };
  onSuccess: () => void;
  staffMembers?: { id: string; name: string | null }[];
}

const durationOptions = [5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300];

const ServiceForm = memo(function ServiceForm({ shopId, service, onSuccess, staffMembers = [] }: ServiceFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);

  useEffect(() => {
    if (!service) {
      setSelectedStaff(staffMembers.map((s) => s.id));
      setLoadingStaff(false);
      return;
    }
    getServiceStaffIds(service.id).then((res) => {
      if (res.success) setSelectedStaff(res.data ?? []);
      setLoadingStaff(false);
    });
  }, [service, staffMembers]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("has_staff_ids", "true");
    formData.set("staff_ids", selectedStaff.join(","));

    const action = service
      ? () => updateService(service.id, formData, shopId)
      : () => createService(formData, shopId);

    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error);
      } else {
        onSuccess();
      }
    });
  };

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function toggleStaff(id: string) {
    setSelectedStaff((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer">
          Nombre
        </label>
        <input
          ref={nameRef}
          type="text"
          id="name"
          name="name"
          required
          defaultValue={service?.name || ""}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          placeholder="Ej: Corte de pelo"
        />
      </div>

      <input type="hidden" name="category" value={service?.category ?? "General"} />

      <div>
        <label
            htmlFor="price"
            className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer"
          >
            Precio ($)
          </label>
        <input
          type="number"
          id="price"
          name="price"
          step="0.01"
          min="0"
          defaultValue={service?.price ?? ""}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          placeholder="0.00"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          name="pay_at_shop"
          defaultChecked={service?.pay_at_shop ?? false}
          className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
        />
        <span className="text-sm text-gray-700">Pago en el local</span>
      </label>

      <div>
        <label
            htmlFor="duration_minutes"
            className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer"
          >
            Duración
          </label>
          <select
            id="duration_minutes"
            name="duration_minutes"
            defaultValue={service?.duration_minutes ?? 30}
            className="ui-select w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        >
          {durationOptions.map((mins) => (
            <option key={mins} value={mins}>
              {mins} minutos
            </option>
          ))}
        </select>
      </div>

      {staffMembers.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ¿Quiénes realizan este servicio?
          </label>
          {loadingStaff ? (
            <div className="text-sm text-zinc-400">Cargando personal...</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {staffMembers.map((s) => {
                const isOn = selectedStaff.includes(s.id);
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => toggleStaff(s.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all cursor-pointer select-none ${
                      isOn
                        ? "bg-violet-100 border-violet-300 text-violet-800"
                        : "bg-white border-zinc-300 text-zinc-500 hover:border-zinc-400"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isOn ? "bg-violet-500" : "bg-zinc-300"}`} />
                    {s.name || "Sin nombre"}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
        >
          {pending
            ? "Guardando..."
            : service
              ? "Actualizar"
              : "Crear Servicio"}
        </button>
      </div>
    </form>
  );
});

export default ServiceForm;
