"use client";

import { createCombo, updateCombo } from "@/lib/dashboard/services/combo-actions";
import { useEffect, useMemo, useRef, useState, useTransition, memo } from "react";

type ServiceOption = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
};

type ComboFormProps = {
  shopId: string;
  services: ServiceOption[];
  combo?: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    duration_minutes: number | null;
    service_ids: string[];
  };
  onSuccess: () => void;
};

const ComboForm = memo(function ComboForm({ shopId, services, combo, onSuccess }: ComboFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(combo?.service_ids || []);
  const [durationMinutes, setDurationMinutes] = useState<number | "">(combo?.duration_minutes ?? "");
  const durationTouched = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const totalDuration = useMemo(() => {
    return services
      .filter((s) => selectedIds.includes(s.id))
      .reduce((sum, s) => sum + s.duration_minutes, 0);
  }, [services, selectedIds]);

  const totalOriginalPrice = useMemo(() => {
    return services
      .filter((s) => selectedIds.includes(s.id))
      .reduce((sum, s) => sum + s.price, 0);
  }, [services, selectedIds]);

  function toggleService(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  useEffect(() => {
    if (!durationTouched.current && (durationMinutes === "" || durationMinutes === 0)) {
      setDurationMinutes(totalDuration);
    }
  }, [totalDuration]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (selectedIds.length === 0) {
      setError("Seleccioná al menos un servicio");
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.set("service_ids", selectedIds.join(","));

    const action = combo
      ? () => updateCombo(combo.id, formData, shopId)
      : () => createCombo(formData, shopId);

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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer">Nombre del combo</label>
        <input
          ref={nameRef}
          type="text"
          name="name"
          required
          defaultValue={combo?.name || ""}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          placeholder="Ej: Corte + Tintura"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer">Descripción (opcional)</label>
        <textarea
          name="description"
          rows={2}
          defaultValue={combo?.description || ""}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
          placeholder="Describí qué incluye este combo"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer">Precio del combo ($)</label>
        <input
          type="number"
          name="price"
          step="0.01"
          min="0"
          required
          defaultValue={combo?.price ?? ""}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          placeholder="0.00"
        />
        {totalOriginalPrice > 0 && (
          <p className="mt-1 text-xs text-gray-400">
            Precio original sin combo: ${totalOriginalPrice.toFixed(2)}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2 cursor-pointer">Servicios incluidos</label>
        <div className="max-h-48 overflow-y-auto space-y-1.5 border border-gray-200 rounded-lg p-2">
          {services.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">Creá servicios primero</p>
          ) : (
            services.map((svc) => {
              const checked = selectedIds.includes(svc.id);
              return (
                <label
                  key={svc.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    checked ? "bg-violet-50 border border-violet-200" : "hover:bg-gray-50 border border-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleService(svc.id)}
                    className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{svc.name}</p>
                    <p className="text-xs text-gray-400">{svc.duration_minutes} min · ${svc.price.toFixed(2)}</p>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 cursor-pointer">Duración del combo (minutos)</label>
          <input
            type="number"
            name="duration_minutes"
            min="1"
            value={durationMinutes}
            onChange={(e) => {
              durationTouched.current = true;
              const val = e.target.value;
              setDurationMinutes(val === "" ? "" : parseInt(val, 10));
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            placeholder={`${totalDuration} min (suma de servicios)`}
          />
          <p className="mt-1 text-xs text-gray-400">
            Suma de servicios: {totalDuration} min · {selectedIds.length} servicio{selectedIds.length > 1 ? "s" : ""}
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
        >
          {pending ? "Guardando..." : combo ? "Actualizar Combo" : "Crear Combo"}
        </button>
      </div>
    </form>
  );
});

export default ComboForm;
