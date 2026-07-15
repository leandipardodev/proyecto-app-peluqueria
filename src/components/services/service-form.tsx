"use client";

import { createService, updateService } from "@/lib/dashboard/services/service-actions";
import { useEffect, useRef, useState, useTransition, memo } from "react";
import { FormWithKeyboardNav } from "@/lib/use-form-keyboard-nav";
import { InputForm } from "@/components/ui/input-form";
import { SelectForm } from "@/components/ui/select-form";
import { TextareaForm } from "@/components/ui/textarea-form";
import { CheckboxForm } from "@/components/ui/checkbox-form";
import { SubmitBtn } from "@/components/ui/submit-btn";

interface ServiceFormProps {
  shopId: string;
  service?: {
    id: string;
    name: string;
    description?: string;
    category: string;
    price: number;
    duration_minutes: number | null;
    pay_at_shop?: boolean;
  };
  onSuccess: () => void;
  staffMembers?: { id: string; name: string | null }[];
  serviceStaffMap?: Record<string, string[]>;
}

const durationOptions = [5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300];

const ServiceForm = memo(function ServiceForm({ shopId, service, onSuccess, staffMembers = [], serviceStaffMap = {} }: ServiceFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);

  useEffect(() => {
    if (!service) {
      setSelectedStaff(staffMembers.map((s) => s.id));
    } else {
      setSelectedStaff(serviceStaffMap[service.id] ?? []);
    }
    setLoadingStaff(false);
  }, [service, staffMembers, serviceStaffMap]);

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
    <FormWithKeyboardNav onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      <InputForm
        ref={nameRef}
        label="Nombre"
        name="name"
        type="text"
        required
        autoFocus
        defaultValue={service?.name || ""}
        placeholder="Ej: Corte de pelo"
      />

      <TextareaForm
        label="Descripción"
        name="description"
        defaultValue={service?.description || ""}
        placeholder="Breve descripción del servicio..."
      />

      <input type="hidden" name="category" value={service?.category ?? "General"} />

      <InputForm
        label="Precio ($)"
        name="price"
        type="number"
        step="0.01"
        min="0"
        required
        defaultValue={service?.price ?? ""}
        placeholder="0.00"
      />

      <CheckboxForm
        name="pay_at_shop"
        defaultChecked={service?.pay_at_shop ?? false}
        label="Pago en el local"
      />

      <SelectForm
        label="Duración"
        name="duration_minutes"
        defaultValue={service?.duration_minutes ?? 30}
        options={durationOptions.map((mins) => ({
          value: String(mins),
          label: `${mins} minutos`,
        }))}
      />

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
        <SubmitBtn
          isPending={pending}
          defaultText={service ? "Actualizar" : "Crear Servicio"}
          pendingText="Guardando..."
        />
      </div>
    </FormWithKeyboardNav>
  );
});

export default ServiceForm;
