"use client";

import { useState, useTransition, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Store, Eye, EyeOff, Save, CreditCard, MessageSquareText, Smartphone, Link2, MapPin, Phone, Clock } from "lucide-react";
import { playPop } from "@/lib/sound";
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
}: {
  initialData: BusinessData | null;
  initialError: string | null;
}) {
  const [data, setData] = useState(initialData);
  const [error] = useState(initialError);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(data?.name || "");
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

  const DAYS = [
    { key: "monday", label: "Lunes" },
    { key: "tuesday", label: "Martes" },
    { key: "wednesday", label: "Miércoles" },
    { key: "thursday", label: "Jueves" },
    { key: "friday", label: "Viernes" },
    { key: "saturday", label: "Sábado" },
    { key: "sunday", label: "Domingo" },
  ];

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
    formData.set("name", name);
    formData.set("description", description);
    formData.set("address", address);
    formData.set("localidad", localidad);
    formData.set("phone", phone);
    formData.set("instagram_url", instagramUrl);

    startTransition(async () => {
      const result = await updateBusinessInfo(formData);
      if (!result.success) {
        showError(result.error);
      } else {
        playPop();
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
        showError(result.error);
      } else {
        playPop();
        showSuccess("Claves de Mercado Pago guardadas");
        const fresh = await fetchBusinessData();
        if (fresh.success) {
          setData(fresh.data ?? null);
        }
      }
    });
  }

  function handleSaveWhatsapp() {
    startTransition(async () => {
      const result = await updateWhatsappTemplateAction(whatsappTemplate);
      if (!result.success) {
        showError(result.error);
      } else {
        playPop();
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
      </div>

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
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                  placeholder="Av. Siempre Viva 123"
                />
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
                className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium shadow-sm transition-all duration-200 cursor-pointer select-none ${
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
                  onClick={handleSaveMpKeys}
                  disabled={pending}
                  className="inline-flex items-center gap-2 bg-violet-600 text-white px-6 py-2.5 rounded-full text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 transition-all cursor-pointer select-none"
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
              <code className="bg-white/30 dark:bg-black/30 px-1.5 py-0.5 rounded text-[11px]">{'{Hora}'}</code> como placeholders.
            </p>
            <textarea
              value={whatsappTemplate}
              onChange={(e) => setWhatsappTemplate(e.target.value)}
              rows={3}
              className="w-full rounded-2xl bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all resize-none"
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                {whatsappTemplate.includes("{Hora}") ? (
                  <span className="text-green-600 dark:text-green-400">✓ Incluye {`{Hora}`}</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">⚠ No incluye {`{Hora}`} — no se mostrará el horario</span>
                )}
              </p>
              <button
                type="button"
                onClick={handleSaveWhatsapp}
                disabled={pending}
                className="inline-flex items-center gap-2 bg-violet-600 text-white px-6 py-2.5 rounded-full text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 transition-all cursor-pointer select-none"
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
                    showError(result.error);
                  } else {
                    showSuccess("Horarios guardados");
                    playPop();
                    setSavedSection("hours");
                    setTimeout(() => setSavedSection(null), 1500);
                  }
                });
              }}
              disabled={pending}
              className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium shadow-sm transition-all duration-200 cursor-pointer select-none ${
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
                  <div key={day.key} className="flex items-center gap-3 py-3 px-3 rounded-2xl hover:bg-white/20 dark:hover:bg-white/5 transition-colors">
                    <p className={`text-sm font-medium min-w-[72px] ${h.open ? "text-gray-900 dark:text-white" : "text-zinc-400 dark:text-zinc-500"}`}>
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
                    <span className="w-px h-6 bg-white/10 shrink-0" />
                    <div className={`flex items-center gap-2 transition-all duration-200 ${h.open ? "opacity-100" : "opacity-25"}`}>
                      <input
                        type="time"
                        value={h.start}
                        disabled={!h.open}
                        onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, start: e.target.value } })}
                        className="rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[110px] disabled:cursor-not-allowed cursor-pointer"
                      />
                      <span className="text-xs text-zinc-400">→</span>
                      <input
                        type="time"
                        value={h.end}
                        disabled={!h.open}
                        onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, end: e.target.value } })}
                        className="rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[110px] disabled:cursor-not-allowed cursor-pointer"
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
