"use client";

import { useState, useTransition, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Store, Eye, EyeOff, Save, CreditCard, MessageSquareText, Smartphone, Link2, MapPin, Phone, Clock, Share2, AlertTriangle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import { createAdditionalShop } from "@/lib/dashboard/auth-actions";
import {
  fetchBusinessData,
  updateBusinessInfo,
  getMercadoPagoOauthUrlAction,
  disconnectMercadoPagoOauthAction,
  updateBookingDepositPolicyAction,
  updateWhatsappTemplateAction,
  fetchBusinessHours,
  updateBusinessHours,
  type BusinessData,
  type BusinessHoursData,
} from "@/lib/dashboard/business-actions";
import { deleteCurrentShop } from "@/lib/dashboard/shop-actions";

type MessageType = { type: "success" | "error"; text: string } | null;

const TOUR_STEPS = [
  { id: "setup-public-info", title: "1. Informacion publica", text: "Completa nombre, descripcion, direccion y telefono de tu local." },
  { id: "setup-hours", title: "2. Horarios de atencion", text: "Defini los dias y horarios para que las reservas muestren disponibilidad real." },
  { id: "setup-payments", title: "3. Formas de cobro", text: "Configura Mercado Pago y la politica de seña para cobrar sin friccion." },
  { id: "setup-staff", title: "4. Empleados", text: "Agrega y administra tu equipo para asignar turnos correctamente." },
  { id: "setup-services", title: "5. Servicios", text: "Carga tu catalogo de servicios con precio y duracion." },
] as const;

export default function BusinessClient({
  initialData,
  initialError,
  summaryStats,
  metricStats,
  canManageBilling,
  shopSlug,
}: {
  initialData: BusinessData | null;
  initialError: string | null;
  summaryStats: {
    appointmentsCount: number;
    revenue: number;
    lowStockCount: number;
  } | null;
  metricStats: {
    totalClients: number;
    totalAppointments: number;
    growth: number;
    topServicesCount: number;
    income: number;
    expenses: number;
  } | null;
  canManageBilling: boolean;
  shopSlug: string | null;
}) {
  const { playSuccess, playError, playClick } = useKlipSounds();
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [error] = useState(initialError);
  const [pending, startTransition] = useTransition();
  const [creatingShop, startCreateShopTransition] = useTransition();

  const [name, setName] = useState(data?.nombre || "");
  const [description, setDescription] = useState(data?.description || "");
  const [address, setAddress] = useState(data?.address || "");
  const [localidad, setLocalidad] = useState(data?.localidad || "");
  const [phone, setPhone] = useState(data?.phone || "");
  const [instagramUrl, setInstagramUrl] = useState(data?.instagram_url || "");
  const [facebookUrl, setFacebookUrl] = useState(data?.facebook_url || "");
  const [tiktokUrl, setTiktokUrl] = useState(data?.tiktok_url || "");
  const [whatsappTemplate, setWhatsappTemplate] = useState(data?.whatsapp_template || "");
  const [showStats, setShowStats] = useState(false);
  const [bookingDepositEnabled, setBookingDepositEnabled] = useState(data?.booking_deposit_enabled ?? true);
  const [bookingDepositAmount, setBookingDepositAmount] = useState(String(data?.booking_deposit_amount ?? 3000));
  const [message, setMessage] = useState<MessageType>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHoursData | null>(null);
  const [hoursLoading, setHoursLoading] = useState(true);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [closeConfirm, setCloseConfirm] = useState("");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [newShopName, setNewShopName] = useState("");
  const [showCreateShopModal, setShowCreateShopModal] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourRect, setTourRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  const DAYS = [
    { key: "monday", label: "Lunes" },
    { key: "tuesday", label: "Martes" },
    { key: "wednesday", label: "Miércoles" },
    { key: "thursday", label: "Jueves" },
    { key: "friday", label: "Viernes" },
    { key: "saturday", label: "Sábado" },
    { key: "sunday", label: "Domingo" },
  ];

  const incomeValue = metricStats?.income ?? summaryStats?.revenue ?? 0;
  const expenseValue = metricStats?.expenses ?? 0;
  const flowTotal = Math.max(incomeValue + expenseValue, 1);
  const incomePct = Math.max(8, Math.round((incomeValue / flowTotal) * 100));
  const expensePct = Math.max(8, Math.round((expenseValue / flowTotal) * 100));
  const dashboardBasePath = shopSlug ? `/dashboard/${shopSlug}` : "/dashboard";
  const netValue = incomeValue - expenseValue;

  const maskValue = (value: string) => (showStats ? value : "••••");

  const withDashboardBase = (href: string) => {
    if (!href.startsWith("/dashboard")) return href;
    const tail = href.slice("/dashboard".length);
    return `${dashboardBasePath}${tail}`;
  };

  useEffect(() => {
    fetchBusinessHours()
      .then((h) => {
        if (h.success) {
          setBusinessHours(h.data ?? null);
        }
        setHoursLoading(false);
      })
      .catch(() => {
        setHoursLoading(false);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mpStatus = params.get("mp");
    if (!mpStatus) return;

    if (mpStatus === "connected") {
      setMessage({ type: "success", text: "Mercado Pago conectado correctamente" });
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage({ type: "error", text: "No se pudo conectar Mercado Pago. Intenta de nuevo." });
    }

    params.delete("mp");
    const next = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const key = `klip-business-onboarding-v1:${shopSlug || "default"}`;
    const done = window.localStorage.getItem(key) === "1";
    if (!done) {
      setTourOpen(true);
      setTourStep(0);
      window.setTimeout(() => {
        document.getElementById(TOUR_STEPS[0].id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 140);
    }
  }, [shopSlug]);

  useEffect(() => {
    if (!tourOpen) return;
    const target = TOUR_STEPS[tourStep];
    if (!target) return;
    document.getElementById(target.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [tourOpen, tourStep]);

  useEffect(() => {
    if (!tourOpen) {
      setTourRect(null);
      return;
    }

    let rafId = 0;

    const updateRect = () => {
      const target = TOUR_STEPS[tourStep];
      if (!target) return;
      const el = document.getElementById(target.id);
      if (!el) {
        setTourRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setTourRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const tick = () => {
      updateRect();
      rafId = window.requestAnimationFrame(tick);
    };

    updateRect();
    rafId = window.requestAnimationFrame(tick);
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [tourOpen, tourStep]);

  function completeTour() {
    window.localStorage.setItem(`klip-business-onboarding-v1:${shopSlug || "default"}`, "1");
    setTourOpen(false);
  }

  function showSuccess(text: string) {
    setMessage({ type: "success", text });
    setTimeout(() => setMessage(null), 3000);
  }

  function showError(text: string) {
    setMessage({ type: "error", text });
  }

  function handleSavePublicInfo(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("nombre", name);
    formData.set("description", description);
    formData.set("address", address);
    formData.set("localidad", localidad);
    formData.set("phone", phone);
    formData.set("instagram_url", instagramUrl);
    formData.set("facebook_url", facebookUrl);
    formData.set("tiktok_url", tiktokUrl);

    startTransition(async () => {
      const result = await updateBusinessInfo(formData);
      if (!result.success) {
        playError();
        showError(result.error);
      } else {
        playSuccess();
        showSuccess("Información pública guardada");
        setSavedSection("info");
        setTimeout(() => setSavedSection(null), 1500);
        const fresh = await fetchBusinessData();
        if (fresh.success) {
          setData(fresh.data ?? null);
        }
      }
    });
  }

  function handleConnectMercadoPago() {
    startTransition(async () => {
      const result = await getMercadoPagoOauthUrlAction();
      if (!result.success) {
        playError();
        showError(result.error);
        return;
      }

      if (!result.data?.url) {
        playError();
        showError("No se pudo iniciar la conexion con Mercado Pago");
        return;
      }

      window.location.href = result.data.url;
    });
  }

  function handleDisconnectMercadoPago() {
    startTransition(async () => {
      const result = await disconnectMercadoPagoOauthAction();
      if (!result.success) {
        playError();
        showError(result.error);
        return;
      }
      playSuccess();
      showSuccess("Mercado Pago desconectado");
      const fresh = await fetchBusinessData();
      if (fresh.success) setData(fresh.data ?? null);
    });
  }

  function handleSaveBookingDepositPolicy() {
    startTransition(async () => {
      const amount = Math.max(0, Number(bookingDepositAmount) || 0);
      const result = await updateBookingDepositPolicyAction(bookingDepositEnabled, amount);
      if (!result.success) {
        playError();
        showError(result.error);
        return;
      }
      playSuccess();
      showSuccess("Politica de cobro online guardada");
      const fresh = await fetchBusinessData();
      if (fresh.success && fresh.data) {
        setData(fresh.data);
        setBookingDepositEnabled(fresh.data.booking_deposit_enabled);
        setBookingDepositAmount(String(fresh.data.booking_deposit_amount ?? 3000));
      }
    });
  }

  function handleSaveWhatsapp() {
    startTransition(async () => {
      const result = await updateWhatsappTemplateAction(whatsappTemplate);
      if (!result.success) {
        playError();
        showError(result.error);
      } else {
        playSuccess();
        showSuccess("Plantilla de WhatsApp guardada");
        const fresh = await fetchBusinessData();
        if (fresh.success) {
          setData(fresh.data ?? null);
        }
      }
    });
  }


  function handleCloseShop() {
    if (!canManageBilling) return;
    if (closeConfirm.trim().toUpperCase() !== "CERRAR") {
      showError("Escribí CERRAR para confirmar el cierre del local.");
      playError();
      return;
    }

    startTransition(async () => {
      const result = await deleteCurrentShop();
      if (!result.success) {
        playError();
        showError(result.error);
        return;
      }
      playSuccess();
      router.push("/landing");
      router.refresh();
    });
  }

  function handleCreateNewShop() {
    const trimmed = newShopName.trim();
    if (!trimmed) return;

    startCreateShopTransition(async () => {
      const result = await createAdditionalShop(trimmed);
      if (!result.success || !result.data?.slug) {
        showError(result.success ? "No se pudo crear el local" : result.error);
        playError();
        return;
      }
      playSuccess();
      setShowCreateShopModal(false);
      setNewShopName("");
      router.push(`/dashboard/${result.data.slug}/business`);
      router.refresh();
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Mi Negocio</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Información pública y configuración técnica de tu local</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            id="setup-staff"
            href={withDashboardBase("/dashboard/staff")}
            className="ui-btn-ghost inline-flex items-center rounded-full border-emerald-300/60 dark:border-emerald-500/30 bg-emerald-100/80 dark:bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 shadow-sm"
          >
            Gestionar personal
          </Link>
          <Link
            id="setup-services"
            href={withDashboardBase("/dashboard/services")}
            className="ui-btn-ghost inline-flex items-center rounded-full border-sky-300/60 dark:border-sky-500/30 bg-sky-100/80 dark:bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-500/25 shadow-sm"
          >
            Gestionar servicios
          </Link>
          <button
            type="button"
            onClick={() => setShowCreateShopModal(true)}
            disabled={creatingShop}
            className="inline-flex items-center rounded-full border border-violet-300/60 dark:border-violet-500/30 bg-violet-100/80 dark:bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-800 dark:text-violet-200 hover:bg-violet-100 dark:hover:bg-violet-500/25 shadow-sm transition-all disabled:opacity-60"
          >
            {creatingShop ? "Creando..." : "+ Crear nuevo local"}
          </button>
        </div>
      </div>

      <section id="estadisticas" className="glass-sheen-card bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[2rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Estadísticas del Negocio</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Indicadores acumulados desde el inicio del local</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowStats((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 dark:border-white/10 bg-white/40 dark:bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-300 transition hover:bg-white/60 dark:hover:bg-white/[0.11]"
              aria-label={showStats ? "Ocultar estadísticas" : "Mostrar estadísticas"}
            >
              {showStats ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {showStats ? "Visible" : "Oculto"}
            </button>
            <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">Histórico</span>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showStats && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="glass-sheen-stagger p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <div className="glass-sheen-card sm:col-span-2 lg:col-span-3 rounded-2xl bg-white/40 dark:bg-white/[0.03] border border-white/30 dark:border-white/10 p-4">
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              <span>Flujo financiero</span>
              <span>Ingresos vs Gastos</span>
            </div>

            <div className="group/flow space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-emerald-700 dark:text-emerald-300 font-medium">Ingresos</span>
                  <span className="text-zinc-600 dark:text-zinc-300">{maskValue(`$${incomeValue.toFixed(2)}`)}</span>
                </div>
                <div className="h-3 rounded-full bg-emerald-100/55 dark:bg-emerald-900/20 overflow-hidden">
                  <div
                    className="h-full rounded-full flow-bar flow-bar-emerald opacity-70 group-hover/flow:opacity-95 transition-opacity duration-300"
                    style={{ width: `${incomePct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-rose-700 dark:text-rose-300 font-medium">Gastos</span>
                  <span className="text-zinc-600 dark:text-zinc-300">{maskValue(`$${expenseValue.toFixed(2)}`)}</span>
                </div>
                <div className="h-3 rounded-full bg-rose-100/55 dark:bg-rose-900/20 overflow-hidden">
                  <div
                    className="h-full rounded-full flow-bar flow-bar-rose opacity-70 group-hover/flow:opacity-95 transition-opacity duration-300"
                    style={{ width: `${expensePct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="glass-sheen-card h-full min-h-[118px] md:min-h-[124px] rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4 flex flex-col">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Turnos totales</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{maskValue(String(metricStats?.totalAppointments ?? "-"))}</p>
            <div className="mt-auto pt-3 h-1.5 rounded-full bg-sky-100 dark:bg-sky-900/30 overflow-hidden">
              <div className="h-full w-3/4 bg-gradient-to-r from-sky-400 to-sky-300 dark:from-sky-500 dark:to-sky-400" />
            </div>
          </div>

          <div className="glass-sheen-card h-full min-h-[118px] md:min-h-[124px] rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4 flex flex-col">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Ingresos totales</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{maskValue(`$${incomeValue.toFixed(2)}`)}</p>
            <div className="mt-auto pt-3 h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 overflow-hidden">
              <div className="h-full w-4/5 bg-gradient-to-r from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-400" />
            </div>
          </div>

          <div className="glass-sheen-card h-full min-h-[118px] md:min-h-[124px] rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4 flex flex-col">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Clientes totales</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{maskValue(String(metricStats?.totalClients ?? "-"))}</p>
            <div className="mt-auto pt-3 h-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 overflow-hidden">
              <div className="h-full w-2/3 bg-gradient-to-r from-indigo-400 to-indigo-300 dark:from-indigo-500 dark:to-indigo-400" />
            </div>
          </div>

          <div className="glass-sheen-card h-full min-h-[118px] md:min-h-[124px] rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4 flex flex-col">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Crecimiento mensual</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${(metricStats?.growth ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
              {maskValue(`${(metricStats?.growth ?? 0) >= 0 ? "+" : ""}${metricStats?.growth ?? 0}%`)}
            </p>
            <div className="mt-auto pt-3 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div className={`h-full ${(metricStats?.growth ?? 0) >= 0 ? "bg-gradient-to-r from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-400" : "bg-gradient-to-r from-rose-400 to-rose-300 dark:from-rose-500 dark:to-rose-400"}`} style={{ width: `${Math.min(Math.max(Math.abs(metricStats?.growth ?? 0), 10), 100)}%` }} />
            </div>
          </div>

          <div className="glass-sheen-card h-full min-h-[118px] md:min-h-[124px] rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4 flex flex-col">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Alertas de stock</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{maskValue(String(summaryStats?.lowStockCount ?? "-"))}</p>
            <div className="mt-auto pt-3 h-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 overflow-hidden">
              <div className="h-full w-1/2 bg-gradient-to-r from-amber-400 to-amber-300 dark:from-amber-500 dark:to-amber-400" />
            </div>
          </div>

          <div className="glass-sheen-card h-full min-h-[118px] md:min-h-[124px] rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4 flex flex-col">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Servicios activos</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{maskValue(String(metricStats?.topServicesCount ?? "-"))}</p>
            <div className="mt-auto pt-3 h-1.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 overflow-hidden">
              <div className="h-full w-3/5 bg-gradient-to-r from-cyan-400 to-cyan-300 dark:from-cyan-500 dark:to-cyan-400" />
            </div>
          </div>

          <div className="glass-sheen-card h-full min-h-[118px] md:min-h-[124px] rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4 flex flex-col sm:col-span-2 lg:col-span-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Balance neto histórico</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${netValue >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
              {maskValue(`${netValue >= 0 ? "+" : "-"}$${Math.abs(netValue).toFixed(2)}`)}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Ingresos acumulados menos gastos acumulados.</p>
          </div>
        </motion.div>
          )}
        </AnimatePresence>
      </section>
      <style>{`
        .flow-bar {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .flow-bar::before {
          content: "";
          position: absolute;
          inset: -35%;
          border-radius: inherit;
          background:
            linear-gradient(112deg, transparent 24%, rgba(255,255,255,0.3) 50%, transparent 76%),
            linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.02) 52%, rgba(0,0,0,0.12) 100%);
          background-size: 220% 100%, 100% 100%;
          animation: flowBarSheen 5.6s cubic-bezier(0.28, 0.16, 0.2, 1) infinite;
          mix-blend-mode: screen;
          pointer-events: none;
        }
        .flow-bar::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0));
          opacity: 0.38;
          pointer-events: none;
        }
        .flow-bar-emerald {
          background: linear-gradient(90deg, rgba(52,211,153,0.7) 0%, rgba(16,185,129,0.82) 100%);
        }
        .flow-bar-rose {
          background: linear-gradient(90deg, rgba(251,146,160,0.7) 0%, rgba(244,114,182,0.8) 100%);
        }
        @keyframes flowBarSheen {
          0% { background-position: 170% 0, 0 0; }
          55% { background-position: 18% 0, 0 0; }
          100% { background-position: -90% 0, 0 0; }
        }
      `}</style>

      {error && (
        <div className="bg-red-50/80 backdrop-blur-md text-red-700 dark:text-red-300 text-sm px-5 py-3 rounded-full border border-red-200/30 dark:border-red-500/20">
          {error}
        </div>
      )}

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`text-sm px-5 py-3 rounded-full border ${
              message.type === "success"
                ? "bg-green-50/80 backdrop-blur-md text-green-700 border-green-200/30"
                : "bg-red-50/80 backdrop-blur-md text-red-700 border-red-200/30"
            }`}
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-6">
      {/* Card: Información Pública */}
      <form id="setup-public-info" onSubmit={handleSavePublicInfo} className="order-1">
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[2rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
          <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/15 text-base font-bold text-violet-700 dark:text-violet-200">1</span>
            <div className="p-2 rounded-full bg-violet-500/15">
              <Store className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Información Pública</h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Estos datos se muestran en tu página de reservas</p>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer">Nombre del Local</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                placeholder="Ej: Klip Barbería"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer">Descripción</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-2xl bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all resize-none"
                placeholder="Contanos brevemente sobre tu local..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                  Dirección
                </label>
                <input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    if (e.target.value.trim()) setLocationError(null);
                  }}
                  className={`w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all ${locationError ? "border-red-400 focus:ring-red-400/50" : "border-white/20 dark:border-white/10 focus:ring-violet-500/50"}`}
                  placeholder="Av. Siempre Viva 123"
                />
                {locationError && <p className="mt-1 text-xs text-red-500">{locationError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                  Localidad
                </label>
                <input
                  value={localidad}
                  onChange={(e) => setLocalidad(e.target.value)}
                  className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                  placeholder="Ej: Palermo, CABA"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-zinc-400" />
                  Teléfono
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                  placeholder="11 1234-5678"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/20 dark:border-white/10 bg-white/25 dark:bg-black/20 p-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 tracking-tight">
                <Share2 className="w-4 h-4 text-zinc-500" />
                Redes sociales
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Mostramos estos enlaces en el inicio cuando estén configurados.</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5 cursor-pointer flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-zinc-400" />
                    Instagram
                  </label>
                  <input
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                    className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-4 py-2 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    placeholder="https://instagram.com/tu-local"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5 cursor-pointer flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-zinc-400" />
                    Facebook
                  </label>
                  <input
                    value={facebookUrl}
                    onChange={(e) => setFacebookUrl(e.target.value)}
                    className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-4 py-2 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    placeholder="https://facebook.com/tu-local"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5 cursor-pointer flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-zinc-400" />
                    TikTok
                  </label>
                  <input
                    value={tiktokUrl}
                    onChange={(e) => setTiktokUrl(e.target.value)}
                    className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-4 py-2 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    placeholder="https://tiktok.com/@tu-local"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={pending}
                className={`inline-flex w-full sm:w-auto justify-center items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium shadow-sm transition-all duration-200 cursor-pointer select-none ${
                  savedSection === "info"
                    ? "bg-green-500 text-white scale-105"
                    : "bg-violet-600 text-white hover:bg-violet-700"
                } ${pending ? "opacity-50" : ""}`}
              >
                {savedSection === "info" ? (
                  <motion.span
                    key="saved-info"
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    className="inline-flex items-center gap-1"
                  >
                    Guardado ✓
                  </motion.span>
                ) : pending ? (
                  "Guardando..."
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Card: Configuración Técnica */}
      <div id="setup-payments" className="order-3 bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[2rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-base font-bold text-amber-700 dark:text-amber-200">3</span>
          <div className="p-2 rounded-full bg-amber-500/15">
            <Smartphone className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Forma de cobro</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Mercado Pago, seña online y mensaje automático</p>
          </div>
        </div>
        <div className="p-6 space-y-8">

          {/* Mercado Pago OAuth */}
          {canManageBilling ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">Mercado Pago</h3>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/20 dark:border-white/10 bg-white/40 dark:bg-black/30 px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {data?.mp_oauth_connected ? "Cuenta conectada" : "Cuenta no conectada"}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {data?.mp_oauth_connected
                      ? "Ya podes cobrar senas online con tu cuenta de Mercado Pago."
                      : "Conecta tu cuenta para activar cobros online sin cargar tokens manualmente."}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!data?.mp_oauth_connected ? (
                    <button
                      type="button"
                      onMouseDown={playClick}
                      onClick={handleConnectMercadoPago}
                      disabled={pending}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      <Link2 className="w-4 h-4" />
                      {pending ? "Conectando..." : "Conectar Mercado Pago"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onMouseDown={playClick}
                      onClick={handleDisconnectMercadoPago}
                      disabled={pending}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-300 bg-white px-5 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700/50 dark:bg-black/30 dark:text-rose-200"
                    >
                      <Trash2 className="w-4 h-4" />
                      {pending ? "Desconectando..." : "Desconectar"}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-rose-200/70 dark:border-rose-700/40 bg-rose-50/80 dark:bg-rose-900/20 p-4 space-y-3">
                <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">Recomendacion fuerte de cobro</p>
                <p className="text-xs text-rose-700/90 dark:text-rose-200/90">
                  Mercado Pago descuenta aproximadamente un 7% por transaccion. Si cobras el servicio completo desde /book, perdes margen en cada turno.
                  Te conviene cobrar solo una seña online y finalizar el resto en el local.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBookingDepositEnabled((prev) => !prev)}
                    className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      bookingDepositEnabled
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-zinc-100 text-zinc-700 border-zinc-300"
                    }`}
                  >
                    {bookingDepositEnabled ? "Cobrando seña online" : "Cobro total online"}
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={bookingDepositAmount}
                    onChange={(e) => setBookingDepositAmount(e.target.value)}
                    className="w-full rounded-full bg-white/70 dark:bg-black/30 border border-rose-200/80 dark:border-rose-700/50 px-4 py-2.5 text-sm text-gray-900 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="Monto de seña (ARS)"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onMouseDown={playClick}
                    onClick={handleSaveBookingDepositPolicy}
                    disabled={pending}
                    className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {pending ? "Guardando..." : "Guardar politica de cobro"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          ) : (
            <div className="rounded-2xl border border-amber-200/60 bg-amber-50/70 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
              Solo el owner del local puede conectar Mercado Pago y gestionar facturacion.
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* WhatsApp Template */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquareText className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">Mensaje de WhatsApp</h3>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">
              Podes usar <code className="bg-white/30 dark:bg-black/30 px-1.5 py-0.5 rounded text-[11px]">{'{Nombre}'}</code> y <code className="bg-white/30 dark:bg-black/30 px-1.5 py-0.5 rounded text-[11px]">{'{Peluqueria}'}</code> y se autocompletara con los datos del turno. Es obligatorio incluir <code className="bg-white/30 dark:bg-black/30 px-1.5 py-0.5 rounded text-[11px]">{'{Hora}'}</code> y <code className="bg-white/30 dark:bg-black/30 px-1.5 py-0.5 rounded text-[11px]">{'{ubicacion}'}</code> (o <code className="bg-white/30 dark:bg-black/30 px-1.5 py-0.5 rounded text-[11px]">{'{Lugar}'}</code>).
            </p>
            <textarea
              value={whatsappTemplate}
              onChange={(e) => {
                setWhatsappTemplate(e.target.value);
              }}
              rows={3}
              className="w-full rounded-2xl bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all resize-none"
            />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-3">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {whatsappTemplate.match(/\{Hora\}/) ? (
                    <span className="text-green-600 dark:text-green-400">✓ Incluye {`{Hora}`}</span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400">✕ No incluye {`{Hora}`}</span>
                  )}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {whatsappTemplate.match(/\{ubicacion\}|\{Lugar\}/) ? (
                    <span className="text-green-600 dark:text-green-400">✓ Incluye {`{ubicacion}`} / {`{Lugar}`}</span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400">✕ No incluye {`{ubicacion}`} ni {`{Lugar}`}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onMouseDown={playSuccess}
                onClick={handleSaveWhatsapp}
                disabled={pending}
                className="inline-flex w-full sm:w-auto justify-center items-center gap-2 bg-violet-600 text-white px-6 py-2.5 rounded-full text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 transition-all cursor-pointer select-none"
              >
                <Save className="w-4 h-4" />
                {pending ? "Guardando..." : "Guardar Plantilla"}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Card: Horarios de Atención */}
      <div id="setup-hours" className="order-2 bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[2rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/15 text-base font-bold text-blue-700 dark:text-blue-200">2</span>
          <div className="p-2 rounded-full bg-blue-500/15">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Horarios de Atención</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Días y horarios de apertura del local</p>
          </div>
          {businessHours && (
            <button
              type="button"
              onClick={() => {
                setSavedSection(null);
                startTransition(async () => {
                  const result = await updateBusinessHours(businessHours);
                  if (!result.success) {
                    playError();
                    showError(result.error);
                  } else {
                    showSuccess("Horarios guardados");
                    playSuccess();
                    setSavedSection("hours");
                    setTimeout(() => setSavedSection(null), 1500);
                  }
                });
              }}
              disabled={pending}
              className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium shadow-sm transition-all duration-200 cursor-pointer select-none shrink-0 ${
                savedSection === "hours"
                  ? "bg-green-500 text-white scale-105"
                  : "bg-violet-600 text-white hover:bg-violet-700"
              } ${pending ? "opacity-50" : ""}`}
            >
              {savedSection === "hours" ? (
                <motion.span
                  key="saved"
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  className="inline-flex items-center gap-1"
                >
                  Guardado ✓
                </motion.span>
              ) : pending ? (
                "Guardando..."
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Guardar
                </>
              )}
            </button>
          )}
        </div>
        <div className="p-4">
          {hoursLoading ? (
            <div className="py-8 text-center text-sm text-zinc-400">Cargando horarios...</div>
          ) : businessHours ? (
            <div className="space-y-1">
              {DAYS.map((day) => {
                const h = businessHours[day.key];
                if (!h) return null;
                return (
                  <div key={day.key} className="flex flex-wrap items-center gap-3 py-3 px-3 rounded-2xl hover:bg-white/20 dark:hover:bg-white/5 transition-colors">
                    <p className={`text-sm font-medium min-w-[64px] ${h.open ? "text-gray-900 dark:text-white" : "text-zinc-400 dark:text-zinc-500"}`}>
                      {day.label}
                    </p>
                    <button
                      type="button"
                      onClick={() => setBusinessHours({ ...businessHours, [day.key]: { ...h, open: !h.open } })}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer select-none shrink-0 ${h.open ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600"}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${h.open ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </button>
                    <span className="hidden sm:block w-px h-6 bg-white/10 shrink-0" />
                    <div className={`flex flex-wrap items-center gap-2 transition-all duration-200 ${h.open ? "opacity-100" : "opacity-25"}`}>
                      <input
                        type="time"
                        value={h.start}
                        disabled={!h.open}
                        onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, start: e.target.value } })}
                        className="rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
                      />
                      <span className="hidden sm:inline text-xs text-zinc-400">→</span>
                      <input
                        type="time"
                        value={h.end}
                        disabled={!h.open}
                        onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, end: e.target.value } })}
                        className="rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
                      />

                      <button
                        type="button"
                        disabled={!h.open}
                        onClick={() => {
                          const hasBreak = Boolean(h.break_start && h.break_end);
                          setBusinessHours({
                            ...businessHours,
                            [day.key]: {
                              ...h,
                              break_start: hasBreak ? null : "13:00",
                              break_end: hasBreak ? null : "16:00",
                            },
                          });
                        }}
                        className="rounded-full border border-white/30 dark:border-white/15 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-300 disabled:opacity-50"
                      >
                        {h.break_start && h.break_end ? "Quitar corte" : "Agregar horario cortado"}
                      </button>

                      {h.break_start && h.break_end && (
                        <>
                          <span className="hidden sm:inline text-xs text-zinc-400">Corte</span>
                          <input
                            type="time"
                            value={h.break_start}
                            disabled={!h.open}
                            onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, break_start: e.target.value } })}
                            className="rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
                          />
                          <span className="hidden sm:inline text-xs text-zinc-400">→</span>
                          <input
                            type="time"
                            value={h.break_end}
                            disabled={!h.open}
                            onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, break_end: e.target.value } })}
                            className="rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-red-500">Error al cargar horarios</div>
          )}
        </div>
      </div>

      {portalReady && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {tourOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none fixed inset-0 z-[80] bg-black/28"
              />
              {tourRect && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none fixed z-[81] rounded-[2rem] border-2 border-violet-400/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.08),0_0_0_6px_rgba(167,139,250,0.22)]"
                  style={{
                    top: Math.max(8, tourRect.top - 8),
                    left: Math.max(8, tourRect.left - 8),
                    width: Math.max(120, tourRect.width + 16),
                    height: Math.max(70, tourRect.height + 16),
                  }}
                />
              )}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="fixed bottom-4 left-1/2 z-[90] w-[min(94vw,620px)] -translate-x-1/2 rounded-3xl border border-white/25 dark:border-white/10 bg-white/92 dark:bg-zinc-900/92 backdrop-blur-2xl p-4 shadow-2xl"
              >
                <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Recorrido guiado</p>
                <h3 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{TOUR_STEPS[tourStep].title}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{TOUR_STEPS[tourStep].text}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={completeTour}
                    className="ui-btn-ghost rounded-full px-3 py-1.5 text-xs font-semibold"
                  >
                    Omitir
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{tourStep + 1}/{TOUR_STEPS.length}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (tourStep >= TOUR_STEPS.length - 1) {
                          completeTour();
                          return;
                        }
                        setTourStep((s) => Math.min(s + 1, TOUR_STEPS.length - 1));
                      }}
                      className="ui-btn-primary rounded-full px-4 py-1.5 text-xs font-semibold"
                    >
                      {tourStep >= TOUR_STEPS.length - 1 ? "Finalizar" : "Siguiente"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
      </div>

      {/* Footer hint */}
      {canManageBilling && (
        <div className="rounded-[2rem] border border-red-200/70 dark:border-red-600/30 bg-red-50/70 dark:bg-red-950/20 p-6">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4" />
            <h3 className="text-sm font-semibold">Zona de riesgo (solo owner)</h3>
          </div>
          <p className="mt-2 text-xs text-red-700/90 dark:text-red-300/90">
            Esta accion elimina el local actual y sus datos asociados. Es irreversible.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center">
            <input
              value={closeConfirm}
              onChange={(e) => setCloseConfirm(e.target.value)}
              placeholder="Escribi CERRAR para confirmar"
              className="w-full sm:max-w-xs rounded-full border border-red-200 dark:border-red-700 bg-white/70 dark:bg-black/30 px-4 py-2 text-sm text-red-800 dark:text-red-200 outline-none"
            />
            <button
              type="button"
              onMouseDown={playClick}
              onClick={() => setShowCloseModal(true)}
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {pending ? "Cerrando local..." : "Continuar cierre"}
            </button>
          </div>
        </div>
      )}

      {portalReady && createPortal(
      <AnimatePresence>
        {showCreateShopModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4"
            onClick={() => {
              if (creatingShop) return;
              setShowCreateShopModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-md rounded-3xl border border-violet-200/80 dark:border-violet-700/40 bg-white dark:bg-zinc-950 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="text-base font-semibold text-violet-700 dark:text-violet-300">Crear nuevo local</h4>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                Elegi un nombre para el local. Luego podras editarlo desde configuracion.
              </p>
              <div className="mt-4">
                <input
                  value={newShopName}
                  onChange={(e) => setNewShopName(e.target.value)}
                  placeholder="Nombre del nuevo local"
                  className="w-full rounded-xl border border-violet-200 dark:border-violet-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none"
                  autoFocus
                />
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-full px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  onClick={() => setShowCreateShopModal(false)}
                  disabled={creatingShop}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateNewShop}
                  disabled={creatingShop || !newShopName.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {creatingShop ? "Creando..." : "Crear local"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}

      {portalReady && createPortal(
      <AnimatePresence>
        {showCloseModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4"
            onClick={() => setShowCloseModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-md rounded-3xl border border-red-200/80 dark:border-red-700/40 bg-white dark:bg-zinc-950 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="text-base font-semibold text-red-700 dark:text-red-300">Confirmar cierre definitivo</h4>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                Vas a eliminar el local y datos asociados. Esta accion no se puede deshacer.
              </p>
              <p className="mt-3 text-xs text-zinc-500">Para confirmar, escribi <strong>CERRAR</strong> y luego presiona el boton rojo.</p>

              <div className="mt-4 flex flex-col gap-2">
                <input
                  value={closeConfirm}
                  onChange={(e) => setCloseConfirm(e.target.value)}
                  placeholder="CERRAR"
                  className="rounded-xl border border-red-200 dark:border-red-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-full px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  onClick={() => setShowCloseModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleCloseShop();
                    if (closeConfirm.trim().toUpperCase() === "CERRAR") {
                      setShowCloseModal(false);
                    }
                  }}
                  disabled={pending || closeConfirm.trim().toUpperCase() !== "CERRAR"}
                  className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Confirmar cierre
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}

      <p className="text-xs text-center text-zinc-400 dark:text-zinc-600 pt-2">
        Los tokens de Mercado Pago se almacenan de forma segura en la base de datos.
      </p>
    </motion.div>
  );
}
