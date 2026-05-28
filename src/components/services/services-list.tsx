"use client";

import { Pencil, Trash2, Plus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ServiceModal from "./service-modal";
import ServiceForm from "./service-form";
import { deleteService } from "@/lib/dashboard/service-actions";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { StatePanel } from "@/components/ui/state-panel";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import type { Industry } from "@/lib/industry/types";

type Service = {
  id: string;
  name: string;
  category: string;
  price: number;
  duration_minutes: number;
};

interface ServicesListProps {
  shopId: string;
  shopSlug?: string;
  industry: Industry;
  initialServices: Service[];
}

export default function ServicesList({ shopId, shopSlug, industry, initialServices }: ServicesListProps) {
  const router = useRouter();
  const [services, setServices] = useState(initialServices);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { addToast } = useToast();
  const [tutorialActive, setTutorialActive] = useState(false);
  const serviceWord = INDUSTRY_CONFIG[industry].labels.serviceSingular;
  const serviceWordLower = serviceWord.toLowerCase();

  useEffect(() => {
    setServices(initialServices);
  }, [initialServices]);

  useEffect(() => {
    const key = `klip-business-onboarding-v1:${shopSlug || "default"}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { active?: boolean; step?: number };
      setTutorialActive(Boolean(parsed?.active && parsed?.step === 4));
    } catch {
      setTutorialActive(false);
    }
  }, [shopSlug]);

  useEffect(() => {
    const channel = supabase
      .channel(`services-${shopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "services", filter: `shop_id=eq.${shopId}` },
        async () => {
          const { data } = await supabase
            .from("services")
            .select("id, name, category, price, duration_minutes")
            .eq("shop_id", shopId)
            .order("created_at", { ascending: false });
          if (data) {
            setServices(data as Service[]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId]);

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
    startTransition(async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name, category, price, duration_minutes")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false });
      if (data) setServices(data as Service[]);
    });
  }

  function handleDelete(id: string) {
    setDeleteTargetId(id);
  }

  function confirmDeleteService() {
    const id = deleteTargetId;
    if (!id) return;
    startTransition(async () => {
      const result = await deleteService(id, shopId);
      if (!result.success) {
        addToast(result.error, "error");
        return;
      }
      setServices((prev) => prev.filter((s) => s.id !== id));
      setDeleteTargetId(null);
    });
  }

  return (
    <>
      {tutorialActive && (
        <div className="mb-4 rounded-2xl border border-violet-300/50 bg-violet-50/80 dark:bg-violet-900/20 px-4 py-3">
          <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">Paso 5: {serviceWord}s</p>
          <p className="mt-1 text-xs text-violet-700/90 dark:text-violet-200/90">Carga o valida tus {serviceWordLower}s y finaliza el recorrido.</p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                const key = `klip-business-onboarding-v1:${shopSlug || "default"}`;
                window.localStorage.setItem(key, JSON.stringify({ active: false, step: 5, doneAt: Date.now() }));
                router.push(shopSlug ? `/dashboard/${shopSlug}` : "/dashboard");
              }}
              className="ui-btn-primary rounded-full px-4 py-1.5 text-xs"
            >
              Finalizar
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">{serviceWord}s</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Las secciones/categorías de /book ahora se editan en Mi Negocio - Personalización.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 transition-colors cursor-pointer select-none"
        >
          <Plus className="w-4 h-4" />
          Nuevo {serviceWord}
        </button>
      </div>

      {services.length === 0 ? (
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] py-16 px-6 text-center">
          <StatePanel title={`Sin ${serviceWordLower}s`} description={`Todavía no hay ${serviceWordLower}s creados.`} />
          <button
            type="button"
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
                  <span className="text-gray-500 dark:text-gray-400">Categoria</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{service.category}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Precio</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">${service.price.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Duración</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{service.duration_minutes} min</span>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1">
                   <button
                    type="button"
                    onClick={() => openEdit(service)}
                    className="p-1.5 rounded-md text-gray-500 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer select-none"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                   <button
                    type="button"
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
            <table className="w-full" aria-label="Tabla de servicios">
              <thead>
                <tr className="bg-white/40 dark:bg-black/20 border-b border-white/20 dark:border-white/10">
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                    Nombre
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                    Categoria
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
                      {service.category}
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
                          type="button"
                          onClick={() => openEdit(service)}
                          className="p-1.5 rounded-md text-gray-500 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer select-none"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                         <button
                          type="button"
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
        title={editingService ? `Editar ${serviceWord}` : `Nuevo ${serviceWord}`}
      >
        <ServiceForm
          shopId={shopId}
          service={editingService ?? undefined}
          onSuccess={handleSuccess}
        />
      </ServiceModal>

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title={`Eliminar ${serviceWordLower}`}
        message={`Esta accion eliminara el ${serviceWordLower} del catalogo.`}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={confirmDeleteService}
      />
    </>
  );
}
