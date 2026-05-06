"use client";

import { createService, updateService } from "@/lib/dashboard/service-actions";
import { useState, useTransition } from "react";

interface ServiceFormProps {
  service?: {
    id: string;
    name: string;
    price: number;
    duration_minutes: number;
  };
  onSuccess: () => void;
}

const durationOptions = [15, 30, 45, 60, 90, 120];

export default function ServiceForm({ service, onSuccess }: ServiceFormProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    const action = service
      ? () => updateService(service.id, formData)
      : () => createService(formData);

    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
      } else {
        onSuccess();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Nombre
        </label>
        <input
          type="text"
          id="name"
          name="name"
          defaultValue={service?.name}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          placeholder="Ej: Corte de pelo"
        />
      </div>

      <div>
        <label
          htmlFor="price"
          className="block text-sm font-medium text-gray-700 mb-1"
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

      <div>
        <label
          htmlFor="duration_minutes"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Duración
        </label>
        <select
          id="duration_minutes"
          name="duration_minutes"
          defaultValue={service?.duration_minutes ?? 30}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
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
          className="flex-1 bg-violet-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
