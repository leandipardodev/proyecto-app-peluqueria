"use client";

import { Pencil, Trash2, Plus, Sparkles, EyeOff, Clock, DollarSign, Tag, Package } from "lucide-react";
import { useEffect, useState, useTransition, memo, useRef } from "react";
import { useRouter } from "next/navigation";
import ServiceModal from "./service-modal";
import ServiceForm from "./service-form";
import ComboForm from "./combo-form";
import { deleteService, fetchServiceStaffMap } from "@/lib/dashboard/service-actions";
import { deleteCombo, toggleComboActive, fetchCombos } from "@/lib/dashboard/combo-actions";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { StatePanel } from "@/components/ui/state-panel";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import type { Industry } from "@/lib/industry/types";

type Service = {
  id: string;
  name: string;
  description?: string;
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
  initialStaffMembers?: { id: string; name: string | null }[];
  initialServiceStaffMap?: Record<string, string[]>;
  role?: string;
}

const ServicesList = memo(function ServicesList({ shopId, shopSlug, industry, initialServices, initialCombos = [], initialStaffMembers = [], initialServiceStaffMap = {}, role = "staff" }: ServicesListProps) {
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
  const [staffMembers, setStaffMembers] = useState(initialStaffMembers);
  const [serviceStaffMap, setServiceStaffMap] = useState(initialServiceStaffMap);
  const serviceWord = INDUSTRY_CONFIG[industry].labels.serviceSingular;
  const serviceWordLower = serviceWord.toLowerCase();
  const isOwnerOrAdmin = role !== "staff";

  useEffect(() => {
    setServices(initialServices);
  }, [initialServices]);

  useEffect(() => {
    setCombos(initialCombos);
  }, [initialCombos]);

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
  const modalOpenRef = useRef(modalOpen);

  useEffect(() => {
    modalOpenRef.current = modalOpen;
  }, [modalOpen]);

  useEffect(() => {
    const channel = supabase
      .channel(`services-${shopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "services", filter: `shop_id=eq.${shopId}` },
        () => {
          if (modalOpenRef.current) return;
          if (realtimeCooldown.current) return;
          realtimeCooldown.current = true;
          setTimeout(() => { realtimeCooldown.current = false; }, 2000);
          supabase
            .from("services")
            .select("id, name, description, category, price, duration_minutes")
            .eq("shop_id", shopId)
            .order("created_at", { ascending: false })
            .then(({ data }) => {
              if (Array.isArray(data)) setServices(data);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId]);

  function openCreate() {
    if (!isOwnerOrAdmin) return;
    setEditingService(null);
    setEditingCombo(null);
    setModalOpen(true);
  }

  function openEdit(service: Service) {
    if (!isOwnerOrAdmin) return;
    setEditingService(service);
    setEditingCombo(null);
    setModalOpen(true);
  }

  function openEditCombo(combo: Combo) {
    if (!isOwnerOrAdmin) return;
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
      const { data: svc } = await supabase
        .from("services")
        .select("id, name, description, category, price, duration_minutes")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false });
      if (Array.isArray(svc)) setServices(svc);
      const mapResult = await fetchServiceStaffMap(shopId);
      if (mapResult.success && mapResult.data) {
        setServiceStaffMap(mapResult.data);
      }
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
    if (!isOwnerOrAdmin) return;
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
    if (!isOwnerOrAdmin) return;
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
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => {
                const catColors: Record<string, string> = {
                  violet: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700",
                  emerald: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700",
                  sky: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-700",
                  amber: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700",
                  rose: "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700",
                };
                const catColorKeys = Object.keys(catColors);
                const catColor = catColors[catColorKeys[service.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % catColorKeys.length]];
                return (
                  <div key={service.id} className="group bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200">
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-500 dark:from-violet-500 dark:to-violet-600 text-white shadow-lg shadow-violet-200/50 dark:shadow-violet-900/50 shrink-0">
                          <Tag className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">{service.name}</h3>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${catColor}`}>
                                <Tag className="w-3 h-3" />
                                {service.category}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <DollarSign className="w-4 h-4 text-gray-400" />
                              <span className="font-semibold text-gray-900 dark:text-white text-lg">${service.price.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                              <Clock className="w-4 h-4" />
                              <span>{service.duration_minutes} min</span>
                            </div>
                          </div>
                        </div>
                      </div>
                          {serviceStaffMap[service.id]?.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                              <span className="font-medium text-zinc-400 dark:text-zinc-500">Profesionales:</span>
                              {serviceStaffMap[service.id].map((sid) => {
                                const s = staffMembers.find((m) => m.id === sid);
                                return s ? (
                                  <span key={sid} className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md">
                                    {s.name || "Sin nombre"}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          )}
                          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(service)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-gray-200 transition-all duration-200 cursor-pointer select-none"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                          <span className="hidden sm:inline">Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(service.id, "service")}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 transition-all duration-200 cursor-pointer select-none"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">Eliminar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {combos.map((combo) => (
                <div key={combo.id} className="group bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200">
                  <div className="p-4 sm:p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600 text-white shadow-lg shadow-amber-200/50 dark:shadow-amber-900/50 shrink-0">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">{combo.name}</h3>
                            {combo.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{combo.description}</p>
                            )}
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${
                            combo.active
                              ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200/50 dark:border-green-800/50"
                              : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200/50 dark:border-zinc-700"
                          }`}>
                            {combo.active ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <DollarSign className="w-4 h-4 text-gray-400" />
                            <span className="font-semibold text-gray-900 dark:text-white text-lg">${combo.price.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                            <Clock className="w-4 h-4" />
                            <span>{combo.duration_minutes ?? combo.total_duration} min</span>
                            {combo.duration_minutes && combo.duration_minutes !== combo.total_duration && (
                              <span className="text-xs text-gray-400">({combo.total_duration} min reales)</span>
                            )}
                          </div>
                        </div>
                        {combo.services.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {combo.services.map((svc) => (
                              <span key={svc.id} className="inline-flex items-center gap-1 text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-2.5 py-1 rounded-full border border-violet-200 dark:border-violet-700">
                                <Package className="w-3 h-3" />
                                {svc.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleCombo(combo.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer select-none ${
                          combo.active
                            ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                            : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                        }`}
                        title={combo.active ? "Desactivar" : "Activar"}
                      >
                        <EyeOff className="w-4 h-4" />
                        <span className="hidden sm:inline">{combo.active ? "Desactivar" : "Activar"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditCombo(combo)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-gray-200 transition-all duration-200 cursor-pointer select-none"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                        <span className="hidden sm:inline">Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(combo.id, "combo")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300 transition-all duration-200 cursor-pointer select-none"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Eliminar</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
            serviceStaffMap={serviceStaffMap}
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
