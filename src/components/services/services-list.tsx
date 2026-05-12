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
      const result = await deleteService(id);
      if (!result.success) {
        alert(result.error);
        return;
      }
      setServices((prev) => prev.filter((s) => s.id !== id));
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Servicios</h1>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 transition-colors cursor-pointer select-none"
        >
          <Plus className="w-4 h-4" />
          Nuevo Servicio
        </button>
      </div>

      {services.length === 0 ? (
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] py-16 px-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No hay servicios creados aún.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-2 text-violet-600 text-sm font-medium hover:text-violet-700 cursor-pointer select-none"
          >
            <Plus className="w-4 h-4" />
            Crear el primero
          </button>
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {services.map((service) => (
              <div key={service.id} className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[1.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-4">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{service.name}</p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Precio</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">${service.price.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Duración</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{service.duration_minutes} min</span>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1">
                  <button
                    onClick={() => openEdit(service)}
                    className="p-1.5 rounded-md text-gray-500 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer select-none"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(service.id)}
                    className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer select-none"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-white/40 dark:bg-black/20 border-b border-white/20 dark:border-white/10">
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
              <tbody className="divide-y divide-white/20 dark:divide-white/10">
                {services.map((service) => (
                  <tr key={service.id} className="hover:bg-white/40 dark:hover:bg-white/5 cursor-pointer">
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
                          className="p-1.5 rounded-md text-gray-500 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer select-none"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(service.id)}
                          className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer select-none"
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
        </>
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
