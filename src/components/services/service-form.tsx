"use client";

import { createService, updateService } from "@/lib/dashboard/service-actions";
import { useEffect, useRef, useState, useTransition } from "react";

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
}

const durationOptions = [5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 240, 300];

export default function ServiceForm({ shopId, service, onSuccess }: ServiceFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

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
}
