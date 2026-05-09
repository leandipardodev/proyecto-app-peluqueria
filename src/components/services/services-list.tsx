"use client";

import { Pencil, Trash2, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import ServiceModal from "./service-modal";
import ServiceForm from "./service-form";
import { deleteService } from "@/lib/dashboard/service-actions";

type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
};

interface ServicesListProps {
  initialServices: Service[];
}

export default function ServicesList({ initialServices }: ServicesListProps) {
  const [services, setServices] = useState(initialServices);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [, startTransition] = useTransition();

  function openCreate() {
    setEditingService(null);
    setModalOpen(true);
  }

  function openEdit(service: Service) {
    setEditingService(service);
    setModalOpen(true);
  }

  function handleClose() {
    setModalOpen(false);
    setEditingService(null);
  }

  function handleSuccess() {
    setModalOpen(false);
    setEditingService(null);
    window.location.reload();
  }

  function handleDelete(id: string) {
    if (!confirm("¿Estás seguro de eliminar este servicio?")) return;

    startTransition(async () => {
      await deleteService(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
    });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Servicios</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo Servicio
        </button>
      </div>

      {services.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 py-16 px-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No hay servicios creados aún.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 text-violet-600 text-sm font-medium hover:text-violet-700"
          >
            <Plus className="w-4 h-4" />
            Crear el primero
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                    Nombre
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                    Precio
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                    Duración
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {services.map((service) => (
                  <tr key={service.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {service.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      ${service.price.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {service.duration_minutes} min
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(service)}
                          className="p-1.5 rounded-md text-gray-500 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(service.id)}
                          className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ServiceModal
        open={modalOpen}
        onClose={handleClose}
        title={editingService ? "Editar Servicio" : "Nuevo Servicio"}
      >
        <ServiceForm
          service={editingService ?? undefined}
          onSuccess={handleSuccess}
        />
      </ServiceModal>
    </>
  );
}
