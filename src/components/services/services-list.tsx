"use client";

import { Pencil, Trash2, Plus, Sparkles, EyeOff } from "lucide-react";
import { useEffect, useState, useTransition, memo, useRef } from "react";
import { useRouter } from "next/navigation";
import ServiceModal from "./service-modal";
import ServiceForm from "./service-form";
import ComboForm from "./combo-form";
import { deleteService } from "@/lib/dashboard/service-actions";
import { deleteCombo, toggleComboActive, fetchCombos } from "@/lib/dashboard/combo-actions";
import { fetchStaffMembers } from "@/lib/dashboard/staff-actions";
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

type ComboService = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
};

type Combo = {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
  services: ComboService[];
  total_duration: number;
};

interface ServicesListProps {
  shopId: string;
  shopSlug?: string;
  industry: Industry;
  initialServices: Service[];
  initialCombos?: Combo[];
}

const ServicesList = memo(function ServicesList({ shopId, shopSlug, industry, initialServices, initialCombos = [] }: ServicesListProps) {
  const router = useRouter();
  const [services, setServices] = useState(initialServices);
  const [combos, setCombos] = useState(initialCombos);
  const [activeTab, setActiveTab] = useState<"services" | "combos">("services");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetType, setDeleteTargetType] = useState<"service" | "combo">("service");
  const [, startTransition] = useTransition();
  const { addToast } = useToast();
  const [tutorialActive, setTutorialActive] = useState(false);
  const [staffMembers, setStaffMembers] = useState<{ id: string; name: string | null }[]>([]);
  const serviceWord = INDUSTRY_CONFIG[industry].labels.serviceSingular;
  const serviceWordLower = serviceWord.toLowerCase();

  useEffect(() => {
    setServices(initialServices);
  }, [initialServices]);

  useEffect(() => {
    setCombos(initialCombos);
  }, [initialCombos]);

  useEffect(() => {
    fetchStaffMembers(shopId).then((res) => {
      if (res.success) setStaffMembers(res.data?.map((s) => ({ id: s.id, name: s.name })) ?? []);
    });
  }, [shopId]);

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

  const realtimeCooldown = useRef(false);

  useEffect(() => {
    const channel = supabase
      .channel(`services-${shopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "services", filter: `shop_id=eq.${shopId}` },
        () => {
          if (realtimeCooldown.current) return;
          realtimeCooldown.current = true;
          setTimeout(() => { realtimeCooldown.current = false; }, 2000);
          startTransition(async () => {
            const { data } = await supabase
              .from("services")
              .select("id, name, category, price, duration_minutes")
              .eq("shop_id", shopId)
              .order("created_at", { ascending: false });
            if (Array.isArray(data)) setServices(data);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId, startTransition]);

  function openCreate() {
    setEditingService(null);
    setEditingCombo(null);
    setModalOpen(true);
  }

  function openEdit(service: Service) {
    setEditingService(service);
    setEditingCombo(null);
    setModalOpen(true);
  }

  function openEditCombo(combo: Combo) {
    setEditingCombo(combo);
    setEditingService(null);
    setModalOpen(true);
  }

  function handleClose() {
    setModalOpen(false);
    setEditingService(null);
    setEditingCombo(null);
  }

  function handleServiceSuccess() {
    setModalOpen(false);
    setEditingService(null);
    startTransition(async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name, category, price, duration_minutes")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false });
      if (Array.isArray(data)) setServices(data);
    });
  }

  function handleComboSuccess() {
    setModalOpen(false);
    setEditingCombo(null);
    startTransition(async () => {
      const result = await fetchCombos(shopId);
      if (result.success) setCombos(result.data ?? []);
    });
  }

  function handleDelete(id: string, type: "service" | "combo") {
    setDeleteTargetId(id);
    setDeleteTargetType(type);
  }

  function confirmDelete() {
    const id = deleteTargetId;
    if (!id) return;
    startTransition(async () => {
      if (deleteTargetType === "service") {
        const result = await deleteService(id, shopId);
        if (!result.success) {
          addToast(result.error, "error");
          return;
        }
        setServices((prev) => prev.filter((s) => s.id !== id));
      } else {
        const result = await deleteCombo(id, shopId);
        if (!result.success) {
          addToast(result.error, "error");
          return;
        }
        setCombos((prev) => prev.filter((c) => c.id !== id));
      }
      setDeleteTargetId(null);
    });
  }

  function handleToggleCombo(id: string) {
    startTransition(async () => {
      const result = await toggleComboActive(id, shopId);
      if (!result.success) {
        addToast(result.error, "error");
        return;
      }
      setCombos((prev) => prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c)));
      addToast("Estado actualizado", "success");
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

      <div className="flex gap-1 mb-6 bg-zinc-100 dark:bg-zinc-800 rounded-2xl p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("services")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer select-none ${
            activeTab === "services"
              ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          {serviceWord}s
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("combos")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer select-none ${
            activeTab === "combos"
              ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Combos
        </button>
      </div>

      {activeTab === "services" && (
        <>
          {services.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm py-16 px-6 text-center">
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
                  <div key={service.id} className="bg-white dark:bg-zinc-900 rounded-[1.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
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
                        onClick={() => handleDelete(service.id, "service")}
                        className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer select-none"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" aria-label="Tabla de servicios">
                  <thead>
                    <tr className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
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
                      <tr key={service.id} className="hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
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
                              onClick={() => handleDelete(service.id, "service")}
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
        </>
      )}

      {activeTab === "combos" && (
        <>
          {combos.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm py-16 px-6 text-center">
              <StatePanel title="Sin combos" description="Agrupá servicios en combos para que tus clientes los reserven juntos." />
              <button
                type="button"
                onClick={() => {
                  setEditingService(null);
                  setModalOpen(true);
                }}
                className="mt-4 inline-flex items-center gap-2 text-violet-600 text-sm font-medium hover:text-violet-700 cursor-pointer select-none"
              >
                <Sparkles className="w-4 h-4" />
                Crear combo
              </button>
            </div>
          ) : (
            <>
              <div className="md:hidden space-y-3">
                {combos.map((combo) => (
                  <div key={combo.id} className="bg-white dark:bg-zinc-900 rounded-[1.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{combo.name}</p>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        combo.active
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-gray-50 text-gray-500 border border-gray-200"
                      }`}>
                        {combo.active ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                    {combo.description && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{combo.description}</p>
                    )}
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Precio</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">${combo.price.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Duración</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{combo.duration_minutes ?? combo.total_duration} min{combo.duration_minutes && combo.duration_minutes !== combo.total_duration ? <span className="ml-1 text-xs text-gray-400">({combo.total_duration} min reales)</span> : null}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {combo.services.map((svc) => (
                        <span key={svc.id} className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full border border-violet-200">
                          {svc.name}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleCombo(combo.id)}
                        className="p-1.5 rounded-md text-gray-500 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer select-none"
                        title={combo.active ? "Desactivar" : "Activar"}
                      >
                        <EyeOff className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditCombo(combo)}
                        className="p-1.5 rounded-md text-gray-500 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer select-none"
                        title="Editar combo"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(combo.id, "combo")}
                        className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer select-none"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" aria-label="Tabla de combos">
                  <thead>
                    <tr className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                      <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                        Combo
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                        Incluye
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                        Precio
                      </th>
                      <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                        Duración
                      </th>
                      <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                        Estado
                      </th>
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/20 dark:divide-white/10">
                    {combos.map((combo) => (
                      <tr key={combo.id} className="hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{combo.name}</p>
                            {combo.description && (
                              <p className="text-xs text-gray-400 mt-0.5">{combo.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {combo.services.map((svc) => (
                              <span key={svc.id} className="inline-flex items-center gap-1 text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-700">
                                {svc.name}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          ${combo.price.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {combo.duration_minutes ?? combo.total_duration} min{combo.duration_minutes && combo.duration_minutes !== combo.total_duration ? <span className="ml-1 text-xs text-gray-400">({combo.total_duration})</span> : null}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            combo.active
                              ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
                              : "bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"
                          }`}>
                            {combo.active ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleToggleCombo(combo.id)}
                              className="p-1.5 rounded-md text-gray-500 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer select-none"
                              title={combo.active ? "Desactivar" : "Activar"}
                            >
                              <EyeOff className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditCombo(combo)}
                              className="p-1.5 rounded-md text-gray-500 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer select-none"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(combo.id, "combo")}
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

          {services.length > 0 && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setEditingService(null);
                  setModalOpen(true);
                }}
                className="inline-flex items-center gap-2 text-violet-600 text-sm font-medium hover:text-violet-700 cursor-pointer select-none"
              >
                <Sparkles className="w-4 h-4" />
                Crear combo
              </button>
            </div>
          )}
        </>
      )}

      <ServiceModal
        open={modalOpen}
        onClose={handleClose}
        title={editingCombo ? "Editar Combo" : editingService ? `Editar ${serviceWord}` : activeTab === "combos" ? "Nuevo Combo" : `Nuevo ${serviceWord}`}
      >
        {editingCombo || (activeTab === "combos" && !editingService) ? (
          <ComboForm
            shopId={shopId}
            services={services.map((s) => ({ id: s.id, name: s.name, duration_minutes: s.duration_minutes, price: s.price }))}
            combo={editingCombo ? {
              id: editingCombo.id,
              name: editingCombo.name,
              description: editingCombo.description,
              price: editingCombo.price,
              duration_minutes: editingCombo.duration_minutes,
              service_ids: editingCombo.services.map((s) => s.id),
            } : undefined}
            onSuccess={handleComboSuccess}
          />
        ) : (
          <ServiceForm
            shopId={shopId}
            service={editingService ?? undefined}
            onSuccess={handleServiceSuccess}
            staffMembers={staffMembers}
          />
        )}
      </ServiceModal>

      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title={deleteTargetType === "service" ? `Eliminar ${serviceWordLower}` : "Eliminar combo"}
        message={
          deleteTargetType === "service"
            ? `Esta accion eliminara el ${serviceWordLower} del catalogo.`
            : "Esta accion eliminara el combo del catalogo."
        }
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
});

export default ServicesList;
