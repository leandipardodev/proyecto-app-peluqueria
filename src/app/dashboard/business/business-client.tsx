"use client";

import { useState, useTransition, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Store, Eye, EyeOff, Save, CreditCard, MessageSquareText, Smartphone, Link2, MapPin, Phone, Clock } from "lucide-react";
import Link from "next/link";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import {
  fetchBusinessData,
  updateBusinessInfo,
  updateMercadoPagoKeysAction,
  updateWhatsappTemplateAction,
  fetchBusinessHours,
  updateBusinessHours,
  type BusinessData,
  type BusinessHoursData,
} from "@/lib/dashboard/business-actions";

type MessageType = { type: "success" | "error"; text: string } | null;

export default function BusinessClient({
  initialData,
  initialError,
  summaryStats,
  metricStats,
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
    growth: number;
    topServicesCount: number;
    income: number;
    expenses: number;
  } | null;
}) {
  const { playSuccess, playError, playClick } = useKlipSounds();
  const [data, setData] = useState(initialData);
  const [error] = useState(initialError);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(data?.nombre || "");
  const [description, setDescription] = useState(data?.description || "");
  const [address, setAddress] = useState(data?.address || "");
  const [localidad, setLocalidad] = useState(data?.localidad || "");
  const [phone, setPhone] = useState(data?.phone || "");
  const [instagramUrl, setInstagramUrl] = useState(data?.instagram_url || "");
  const [mpPublicKey, setMpPublicKey] = useState(data?.mp_public_key || "");
  const [mpAccessToken, setMpAccessToken] = useState(data?.mp_access_token || "");
  const [whatsappTemplate, setWhatsappTemplate] = useState(data?.whatsapp_template || "");
  const [showMpKey, setShowMpKey] = useState(false);
  const [showMpToken, setShowMpToken] = useState(false);
  const [message, setMessage] = useState<MessageType>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHoursData | null>(null);
  const [hoursLoading, setHoursLoading] = useState(true);
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

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

  function handleSaveMpKeys() {
    startTransition(async () => {
      const result = await updateMercadoPagoKeysAction(mpPublicKey, mpAccessToken);
      if (!result.success) {
        playError();
        showError(result.error);
      } else {
        playSuccess();
        showSuccess("Claves de Mercado Pago guardadas");
        const fresh = await fetchBusinessData();
        if (fresh.success) {
          setData(fresh.data ?? null);
        }
      }
    });
  }

  function handleSaveWhatsapp() {
    if (!whatsappTemplate.match(/\{ubicacion\}/)) {
      setLocationError("Debés incluir {ubicacion} en el mensaje antes de guardar.");
      playError();
      return;
    }
    setLocationError(null);
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
            href="/dashboard/services"
            className="inline-flex items-center rounded-full border border-sky-300/60 dark:border-sky-500/30 bg-sky-100/80 dark:bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-500/25 shadow-sm transition-all"
          >
            Gestionar servicios
          </Link>
          <Link
            href="/dashboard/staff"
            className="inline-flex items-center rounded-full border border-emerald-300/60 dark:border-emerald-500/30 bg-emerald-100/80 dark:bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 shadow-sm transition-all"
          >
            Gestionar personal
          </Link>
        </div>
      </div>

      <section id="estadisticas" className="bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[2rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Estadísticas del Negocio</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Indicadores clave para tomar decisiones rápidas</p>
          </div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">Live</span>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2 lg:col-span-3 rounded-2xl bg-white/40 dark:bg-white/[0.03] border border-white/30 dark:border-white/10 p-4">
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-3">
              <span>Flujo financiero</span>
              <span>Ingresos vs Gastos</span>
            </div>

            <div className="group/flow space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-emerald-700 dark:text-emerald-300 font-medium">Ingresos</span>
                  <span className="text-zinc-600 dark:text-zinc-300">${incomeValue.toFixed(2)}</span>
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
                  <span className="text-zinc-600 dark:text-zinc-300">${expenseValue.toFixed(2)}</span>
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

          <div className="rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Turnos de hoy</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{summaryStats?.appointmentsCount ?? "-"}</p>
            <div className="mt-3 h-1.5 rounded-full bg-sky-100 dark:bg-sky-900/30 overflow-hidden">
              <div className="h-full w-3/4 bg-gradient-to-r from-sky-400 to-sky-300 dark:from-sky-500 dark:to-sky-400" />
            </div>
          </div>

          <div className="rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Ingresos de hoy</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">${(summaryStats?.revenue ?? 0).toFixed(2)}</p>
            <div className="mt-3 h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 overflow-hidden">
              <div className="h-full w-4/5 bg-gradient-to-r from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-400" />
            </div>
          </div>

          <div className="rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Clientes totales</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{metricStats?.totalClients ?? "-"}</p>
            <div className="mt-3 h-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 overflow-hidden">
              <div className="h-full w-2/3 bg-gradient-to-r from-indigo-400 to-indigo-300 dark:from-indigo-500 dark:to-indigo-400" />
            </div>
          </div>

          <div className="rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Crecimiento mensual</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${(metricStats?.growth ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
              {(metricStats?.growth ?? 0) >= 0 ? "+" : ""}{metricStats?.growth ?? 0}%
            </p>
            <div className="mt-3 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div className={`h-full ${(metricStats?.growth ?? 0) >= 0 ? "bg-gradient-to-r from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-400" : "bg-gradient-to-r from-rose-400 to-rose-300 dark:from-rose-500 dark:to-rose-400"}`} style={{ width: `${Math.min(Math.max(Math.abs(metricStats?.growth ?? 0), 10), 100)}%` }} />
            </div>
          </div>

          <div className="rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Alertas de stock</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{summaryStats?.lowStockCount ?? "-"}</p>
            <div className="mt-3 h-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 overflow-hidden">
              <div className="h-full w-1/2 bg-gradient-to-r from-amber-400 to-amber-300 dark:from-amber-500 dark:to-amber-400" />
            </div>
          </div>

          <div className="rounded-2xl bg-white/45 dark:bg-white/[0.04] border border-white/30 dark:border-white/10 px-4 py-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Servicios activos</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{metricStats?.topServicesCount ?? "-"}</p>
            <div className="mt-3 h-1.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 overflow-hidden">
              <div className="h-full w-3/5 bg-gradient-to-r from-cyan-400 to-cyan-300 dark:from-cyan-500 dark:to-cyan-400" />
            </div>
          </div>
        </div>
      </section>
      <style>{`
        .flow-bar {
          position: relative;
          overflow: hidden;
        }
        .flow-bar::before {
          content: "";
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            120deg,
            rgba(255,255,255,0.16) 0,
            rgba(255,255,255,0.16) 14px,
            rgba(255,255,255,0.03) 14px,
            rgba(255,255,255,0.03) 28px
          );
          animation: flowMove 2.2s linear infinite;
          mix-blend-mode: screen;
        }
        .flow-bar-emerald {
          background: linear-gradient(90deg, rgba(52,211,153,0.7) 0%, rgba(16,185,129,0.82) 100%);
        }
        .flow-bar-rose {
          background: linear-gradient(90deg, rgba(251,146,160,0.7) 0%, rgba(244,114,182,0.8) 100%);
        }
        @keyframes flowMove {
          0% { transform: translateX(-32px); }
          100% { transform: translateX(32px); }
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

      {/* Card: Información Pública */}
      <form onSubmit={handleSavePublicInfo}>
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[2rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
          <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
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
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-zinc-400" />
                  Instagram
                </label>
                <input
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                  className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                  placeholder="https://instagram.com/tu-local"
                />
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
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[2rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="p-2 rounded-full bg-amber-500/15">
            <Smartphone className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Configuración Técnica</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Integraciones y plantillas de comunicación</p>
          </div>
        </div>
        <div className="p-6 space-y-8">

          {/* MP Keys */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">Mercado Pago</h3>
            </div>
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer">MP_PUBLIC_KEY</label>
                <div className="relative">
                  <input
                    value={mpPublicKey}
                    onChange={(e) => setMpPublicKey(e.target.value)}
                    type={showMpKey ? "text" : "password"}
                    className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-5 py-2.5 pr-12 text-sm font-mono text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    placeholder="APP_USR-xxxx-xxxxxxx"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMpKey(!showMpKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer select-none"
                    tabIndex={-1}
                  >
                    {showMpKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 cursor-pointer">MP_ACCESS_TOKEN</label>
                <div className="relative">
                  <input
                    value={mpAccessToken}
                    onChange={(e) => setMpAccessToken(e.target.value)}
                    type={showMpToken ? "text" : "password"}
                    className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-5 py-2.5 pr-12 text-sm font-mono text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxx"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMpToken(!showMpToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer select-none"
                    tabIndex={-1}
                  >
                    {showMpToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onMouseDown={playClick}
                  onClick={handleSaveMpKeys}
                  disabled={pending}
                  className="inline-flex w-full sm:w-auto justify-center items-center gap-2 bg-violet-600 text-white px-6 py-2.5 rounded-full text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 transition-all cursor-pointer select-none"
                >
                  <Save className="w-4 h-4" />
                  {pending ? "Guardando..." : "Guardar Claves"}
                </button>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* WhatsApp Template */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquareText className="w-4 h-4 text-zinc-400" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">Mensaje de WhatsApp</h3>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">
              Usá <code className="bg-white/30 dark:bg-black/30 px-1.5 py-0.5 rounded text-[11px]">{'{Nombre}'}</code>,{" "}
              <code className="bg-white/30 dark:bg-black/30 px-1.5 py-0.5 rounded text-[11px]">{'{Peluqueria}'}</code> y{" "}
              <code className="bg-white/30 dark:bg-black/30 px-1.5 py-0.5 rounded text-[11px]">{'{Hora}'}</code>. La etiqueta <code className="bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded text-[11px] text-red-700 dark:text-red-300">{'{ubicacion}'}</code> es obligatoria.
            </p>
            <textarea
              value={whatsappTemplate}
              onChange={(e) => {
                setWhatsappTemplate(e.target.value);
                if (locationError && e.target.value.match(/\{ubicacion\}/)) {
                  setLocationError(null);
                }
              }}
              rows={3}
              className={`w-full rounded-2xl bg-white/40 dark:bg-black/30 backdrop-blur-md border px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all resize-none ${locationError ? "border-red-500 focus:ring-red-500/50" : "border-white/20 dark:border-white/10 focus:ring-violet-500/50"}`}
            />
            {locationError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-medium">{locationError}</p>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-3">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {whatsappTemplate.match(/\{Hora\}/) ? (
                    <span className="text-green-600 dark:text-green-400">✓ Incluye {`{Hora}`}</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">⚠ No incluye {`{Hora}`} — no se mostrará el horario</span>
                  )}
                </p>
                <p className="text-xs">
                  {whatsappTemplate.match(/\{ubicacion\}/) ? (
                    <span className="text-green-600 dark:text-green-400">✓ Incluye {`{ubicacion}`}</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400">⚠ Falta {`{ubicacion}`} (obligatorio)</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onMouseDown={playSuccess}
                onClick={handleSaveWhatsapp}
                disabled={pending || !whatsappTemplate.match(/\{ubicacion\}/)}
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
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[2rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] overflow-hidden transition-colors">
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
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

      {/* Footer hint */}
      <p className="text-xs text-center text-zinc-400 dark:text-zinc-600 pt-2">
        Los tokens de Mercado Pago se almacenan de forma segura en la base de datos.
      </p>
    </motion.div>
  );
}
