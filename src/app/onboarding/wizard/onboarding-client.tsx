"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const DAY_LABELS: Record<string, string> = {
  monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles",
  thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo",
};

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

type DayHours = { open: boolean; start: string; end: string; break_start?: string | null; break_end?: string | null };

const DEFAULT_HOURS: Record<string, DayHours> = {
  monday: { open: true, start: "09:00", end: "20:00" },
  tuesday: { open: true, start: "09:00", end: "20:00" },
  wednesday: { open: true, start: "09:00", end: "20:00" },
  thursday: { open: true, start: "09:00", end: "20:00" },
  friday: { open: true, start: "09:00", end: "20:00" },
  saturday: { open: true, start: "09:00", end: "20:00" },
  sunday: { open: false, start: "09:00", end: "20:00" },
};

const WIZARD_KEY = "klip-wizard-v2";

type SavedState = {
  step: number;
  info: { nombre: string; address: string; phone: string; description: string };
  hours: Record<string, DayHours>;
  services: { name: string; price: string; duration_minutes: string; category: string }[];
  staff: { name: string; email: string; payModel: string; percentageRate: string; fixedAmount: string }[];
};

type ShopInfo = { id: string; slug: string; name: string; address: string; phone: string };
interface Props { shop: ShopInfo; hasServices: boolean; hasStaff: boolean; isOwner: boolean }

function loadState(slug: string): SavedState | null {
  try { const raw = localStorage.getItem(`${WIZARD_KEY}-${slug}`); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveState(slug: string, state: SavedState) { localStorage.setItem(`${WIZARD_KEY}-${slug}`, JSON.stringify(state)); }
function clearState(slug: string) { localStorage.removeItem(`${WIZARD_KEY}-${slug}`); }

const CATEGORIES = ["General", "Corte", "Color", "Lavado", "Peinado", "Tratamiento", "Manicuría", "Pedicuría", "Barbería", "Depilación", "Maquillaje", "Masajes", "Otro"];
const PAY_MODEL_LABELS: Record<string, string> = { percentage: "Porcentaje", fixed: "Fijo", fixed_plus_percentage: "Mixto" };

export default function OnboardingClient({ shop, hasServices, hasStaff, isOwner }: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const saved = loadState(shop.slug);
  const initialStep = saved?.step ?? 0;

  const [step, setStep] = useState(initialStep);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [mpConnected, setMpConnected] = useState(false);
  const [mpPublicKey, setMpPublicKey] = useState("");
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [checkingMp, setCheckingMp] = useState(true);

  const [info, setInfo] = useState(saved?.info ?? { nombre: shop.name, address: shop.address, phone: shop.phone, description: "" });
  const [hours, setHours] = useState<Record<string, DayHours>>(saved?.hours ?? DEFAULT_HOURS);
  const [services, setServices] = useState<{ name: string; price: string; duration_minutes: string; category: string }[]>(
    saved?.services ?? (hasServices ? [] : [{ name: "", price: "", duration_minutes: "30", category: "General" }])
  );
  const [staff, setStaff] = useState<{ name: string; email: string; payModel: string; percentageRate: string; fixedAmount: string }[]>(
    saved?.staff ?? (hasStaff ? [] : [{ name: "", email: "", payModel: "percentage", percentageRate: "50", fixedAmount: "0" }])
  );

  // Check MP connection status on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/onboarding/mp-status");
        const data = await res.json();
        setMpConnected(data.connected);
      } catch {} finally { setCheckingMp(false); }
    })();
  }, []);

  // Auto-save progress
  useEffect(() => {
    if (!completed) saveState(shop.slug, { step, info, hours, services, staff });
  }, [step, info, hours, services, staff, completed, shop.slug]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  const STEPS = [
    { id: "info", label: "Negocio" },
    { id: "hours", label: "Horarios" },
    { id: "services", label: "Servicios" },
    { id: "staff", label: "Personal" },
    { id: "payment", label: "Pagos" },
  ];

  const isLastStep = step === STEPS.length - 1;

  const validateInfo = () => {
    const errs: Record<string, string> = {};
    if (!info.nombre.trim()) errs.nombre = "Requerido";
    if (!info.address.trim()) errs.address = "Requerido";
    if (!info.phone.trim()) errs.phone = "Requerido";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveInfo = useCallback(async () => {
    if (!validateInfo()) return false;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("nombre", info.nombre.trim());
      fd.set("address", info.address.trim());
      fd.set("phone", info.phone.trim());
      fd.set("description", info.description.trim() || "");
      const res = await fetch("/api/onboarding/shop-info", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) { addToast(data.error || "Error al guardar", "error"); return false; }
      return true;
    } catch { addToast("Error de red", "error"); return false; } finally { setLoading(false); }
  }, [info]);

  const handleSaveHours = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/business-hours", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(hours),
      });
      const data = await res.json();
      if (!data.success) { addToast(data.error, "error"); return false; }
      return true;
    } catch { addToast("Error de red", "error"); return false; } finally { setLoading(false); }
  }, [hours]);

  const handleSaveServices = useCallback(async () => {
    const valid = services.filter(s => s.name.trim() && s.price);
    if (valid.length === 0) { addToast("Agregá al menos un servicio", "error"); return false; }
    setLoading(true);
    try {
      for (const s of valid) {
        const fd = new FormData();
        fd.set("name", s.name.trim()); fd.set("price", s.price); fd.set("duration_minutes", s.duration_minutes || "30"); fd.set("category", s.category || "General");
        const res = await fetch("/api/onboarding/services", { method: "POST", body: fd });
        const data = await res.json();
        if (!data.success) { addToast(`Error al crear "${s.name}": ${data.error}`, "error"); return false; }
      }
      return true;
    } catch { addToast("Error de red", "error"); return false; } finally { setLoading(false); }
  }, [services]);

  const handleSaveStaff = useCallback(async () => {
    const valid = staff.filter(s => s.name.trim() && s.email.trim());
    if (valid.length === 0) { addToast("Agregá al menos un miembro del personal", "error"); return false; }
    setLoading(true);
    try {
      for (const s of valid) {
        const fd = new FormData();
        fd.set("name", s.name.trim()); fd.set("email", s.email.trim()); fd.set("role", "staff");
        fd.set("pay_model", s.payModel || "percentage"); fd.set("percentage_rate", s.percentageRate || "0"); fd.set("fixed_amount", s.fixedAmount || "0");
        const res = await fetch("/api/onboarding/staff", { method: "POST", body: fd });
        const data = await res.json();
        if (!data.success) { addToast(`Error al agregar "${s.name}": ${data.error}`, "error"); return false; }
      }
      return true;
    } catch { addToast("Error de red", "error"); return false; } finally { setLoading(false); }
  }, [staff]);

  const handleSaveMp = useCallback(async () => {
    if (!mpConnected && mpPublicKey && mpAccessToken) {
      const res = await fetch("/api/onboarding/mp-keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: mpPublicKey, accessToken: mpAccessToken }),
      });
      const data = await res.json();
      if (!data.success) { addToast(data.error, "error"); return false; }
    }
    return true;
  }, [mpConnected, mpPublicKey, mpAccessToken]);

  const next = async () => {
    let ok = true;
    if (step === 0) ok = await handleSaveInfo();
    else if (step === 1) ok = await handleSaveHours();
    else if (step === 2) ok = await handleSaveServices();
    else if (step === 3) ok = await handleSaveStaff();
    else if (step === 4) ok = await handleSaveMp();
    if (!ok) return;
    if (isLastStep) {
      clearState(shop.slug);
      localStorage.setItem(`klip-onboarding-v1-${shop.slug}`, "1");
      setCompleted(true);
      return;
    }
    setStep(s => s + 1);
    setFieldErrors({});
  };

  const prev = () => { if (step > 0) { setStep(s => s - 1); setFieldErrors({}); } };

  const skipAll = async () => {
    if (step === 2 && services.some(s => s.name.trim() && s.price)) await handleSaveServices();
    if (step === 3 && staff.some(s => s.name.trim() && s.email.trim())) await handleSaveStaff();
    clearState(shop.slug);
    localStorage.setItem(`klip-onboarding-v1-${shop.slug}`, "1");
    setCompleted(true);
  };

  const handleConnectMp = () => {
    saveState(shop.slug, { step, info, hours, services, staff });
    window.location.href = "/api/payments/mercadopago-oauth/start";
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }} className="text-6xl mb-4">🎉</motion.div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Todo listo!</h1>
          <p className="text-gray-600 mb-2">Tu negocio ya está configurado y listo para recibir turnos.</p>
          <p className="text-sm text-gray-400 mb-6">Podés ajustar todo desde el panel de control.</p>
          <Button onClick={() => router.push(`/dashboard/${shop.slug}`)} size="lg">Ir al dashboard</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center p-4">
      <motion.div layout className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-center gap-2 mb-6">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  i <= step ? "bg-violet-600 text-white" : "bg-gray-200 text-gray-400"
                }`}>{i + 1}</div>
                <span className={`text-sm font-medium hidden sm:block ${i <= step ? "text-violet-700" : "text-gray-400"}`}>{s.label}</span>
                {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < step ? "bg-violet-600" : "bg-gray-200"}`} />}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 text-right">Paso {step + 1} de {STEPS.length}</p>
        </div>

        {/* Body */}
        <div className="px-8 pb-6">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.2 }}>
              {step === 0 && <InfoStep info={info} setInfo={setInfo} fieldErrors={fieldErrors} setFieldErrors={setFieldErrors} />}
              {step === 1 && <HoursStep hours={hours} setHours={setHours} />}
              {step === 2 && <ServicesStep services={services} setServices={setServices} />}
              {step === 3 && <StaffStep staff={staff} setStaff={setStaff} />}
              {step === 4 && <PaymentStep mpConnected={mpConnected} checkingMp={checkingMp} isOwner={isOwner}
                publicKey={mpPublicKey} setPublicKey={setMpPublicKey}
                accessToken={mpAccessToken} setAccessToken={setMpAccessToken}
                onConnectMp={handleConnectMp} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <div>
            {step > 0 ? (
              <Button variant="outline" onClick={prev} disabled={loading}>Atrás</Button>
            ) : (
              <Button variant="ghost" onClick={() => { clearState(shop.slug); router.push(`/dashboard/${shop.slug}`); }} disabled={loading}>Salir</Button>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="ghost" onClick={skipAll} disabled={loading} className="text-gray-400 text-xs">Omitir</Button>
            <Button onClick={next} disabled={loading} className="min-w-[120px]">
              {loading ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Guardando...</span>
              ) : isLastStep ? "Finalizar" : "Siguiente"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ───── Step 1: Shop Info ───── */
function InfoStep({ info, setInfo, fieldErrors, setFieldErrors }: {
  info: { nombre: string; address: string; phone: string; description: string };
  setInfo: (v: any) => void; fieldErrors: Record<string, string>; setFieldErrors: (v: any) => void;
}) {
  const update = (field: string, value: string) => {
    setInfo((p: any) => ({ ...p, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((p: any) => ({ ...p, [field]: "" }));
  };
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Información del negocio</h2>
      <p className="text-sm text-gray-500">Completá los datos básicos de tu negocio.</p>
      <Field label="Nombre del negocio *" error={fieldErrors.nombre}>
        <Input value={info.nombre} onChange={e => update("nombre", e.target.value)} placeholder="Ej: Peluquería Central"
          className={fieldErrors.nombre ? "border-red-400 focus-visible:ring-red-500" : ""} />
      </Field>
      <Field label="Dirección *" error={fieldErrors.address}>
        <Input value={info.address} onChange={e => update("address", e.target.value)} placeholder="Ej: Av. Corrientes 1234"
          className={fieldErrors.address ? "border-red-400 focus-visible:ring-red-500" : ""} />
      </Field>
      <Field label="Teléfono *" error={fieldErrors.phone}>
        <Input value={info.phone} onChange={e => update("phone", e.target.value)} placeholder="Ej: +54 11 1234 5678"
          className={fieldErrors.phone ? "border-red-400 focus-visible:ring-red-500" : ""} />
      </Field>
      <Field label="Descripción">
        <textarea value={info.description} onChange={e => update("description", e.target.value)}
          className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 min-h-[80px]"
          placeholder="Contale a tus clientes qué ofrecés..." />
      </Field>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

/* ───── Step 2: Business Hours ───── */
function HoursStep({ hours, setHours }: { hours: Record<string, DayHours>; setHours: (v: any) => void }) {
  const toggleDay = (day: string) => setHours((p: any) => ({ ...p, [day]: { ...p[day], open: !p[day].open } }));
  const updateDay = (day: string, field: string, value: string) => setHours((p: any) => ({ ...p, [day]: { ...p[day], [field]: value || null } }));
  const toggleBreak = (day: string) => {
    setHours((p: any) => {
      const h = p[day];
      if (h.break_start) return { ...p, [day]: { ...h, break_start: null, break_end: null } };
      return { ...p, [day]: { ...h, break_start: "12:00", break_end: "13:00" } };
    });
  };
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Horarios de atención</h2>
      <p className="text-sm text-gray-500">Configurá los días y horarios en que tu negocio está abierto.</p>
      {DAY_ORDER.map(day => {
        const h = hours[day] || DEFAULT_HOURS[day];
        return (
          <div key={day} className="py-2 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 w-28 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={h.open} onChange={() => toggleDay(day)} className="accent-violet-600" />
                <span className={h.open ? "" : "line-through text-gray-400"}>{DAY_LABELS[day]}</span>
              </label>
              {h.open && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Input type="time" value={h.start} onChange={e => updateDay(day, "start", e.target.value)} className="w-24" />
                  <span className="text-gray-400">a</span>
                  <Input type="time" value={h.end} onChange={e => updateDay(day, "end", e.target.value)} className="w-24" />
                  <button type="button" onClick={() => toggleBreak(day)}
                    className={`text-xs px-2 py-1 rounded-md transition-colors ${h.break_start ? "bg-violet-100 text-violet-700" : "text-gray-400 hover:text-gray-600"}`}>
                    {h.break_start ? "Corte" : "+ Corte"}
                  </button>
                </div>
              )}
            </div>
            {h.open && h.break_start && (
              <div className="flex items-center gap-2 mt-2 ml-20">
                <span className="text-xs text-gray-400">Corte:</span>
                <Input type="time" value={h.break_start ?? ""} onChange={e => updateDay(day, "break_start", e.target.value)} className="w-24 h-8 text-xs" />
                <span className="text-gray-400 text-xs">a</span>
                <Input type="time" value={h.break_end ?? ""} onChange={e => updateDay(day, "break_end", e.target.value)} className="w-24 h-8 text-xs" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ───── Step 3: Services ───── */
function ServicesStep({ services, setServices }: {
  services: { name: string; price: string; duration_minutes: string; category: string }[];
  setServices: (v: any) => void;
}) {
  const update = (i: number, field: string, value: string) => setServices((p: any[]) => {
    const next = [...p]; next[i] = { ...next[i], [field]: value }; return next;
  });
  const add = () => setServices((p: any[]) => [...p, { name: "", price: "", duration_minutes: "30", category: "General" }]);
  const remove = (i: number) => setServices((p: any[]) => p.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Servicios</h2>
      <p className="text-sm text-gray-500">Agregá los servicios que ofrecés. Podés agregar más desde el panel después.</p>
      {services.map((s, i) => (
        <div key={i} className="flex items-start gap-2 p-4 bg-gray-50 rounded-xl">
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><label className="block text-xs text-gray-500 mb-0.5">Nombre *</label>
              <Input value={s.name} onChange={e => update(i, "name", e.target.value)} placeholder="Ej: Corte" className="h-9 text-sm" /></div>
            <div><label className="block text-xs text-gray-500 mb-0.5">Precio ($) *</label>
              <Input type="number" min={0} value={s.price} onChange={e => update(i, "price", e.target.value)} placeholder="0" className="h-9 text-sm" /></div>
            <div><label className="block text-xs text-gray-500 mb-0.5">Duración (min)</label>
              <Input type="number" min={5} step={5} value={s.duration_minutes} onChange={e => update(i, "duration_minutes", e.target.value)} className="h-9 text-sm" /></div>
            <div><label className="block text-xs text-gray-500 mb-0.5">Categoría</label>
              <select value={s.category} onChange={e => update(i, "category", e.target.value)}
                className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          {services.length > 1 && <Button variant="ghost" size="sm" onClick={() => remove(i)} className="mt-4 text-red-500 shrink-0">✕</Button>}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>+ Agregar otro servicio</Button>
    </div>
  );
}

/* ───── Step 4: Staff ───── */
function StaffStep({ staff, setStaff }: {
  staff: { name: string; email: string; payModel: string; percentageRate: string; fixedAmount: string }[];
  setStaff: (v: any) => void;
}) {
  const update = (i: number, field: string, value: string) => setStaff((p: any[]) => {
    const next = [...p]; next[i] = { ...next[i], [field]: value }; return next;
  });
  const add = () => setStaff((p: any[]) => [...p, { name: "", email: "", payModel: "percentage", percentageRate: "50", fixedAmount: "0" }]);
  const remove = (i: number) => setStaff((p: any[]) => p.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Personal</h2>
      <p className="text-sm text-gray-500">Agregá los miembros de tu equipo. Podés agregar más desde el panel después.</p>
      {staff.map((s, i) => (
        <div key={i} className="p-4 bg-gray-50 rounded-xl space-y-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><label className="block text-xs text-gray-500 mb-0.5">Nombre *</label>
                <Input value={s.name} onChange={e => update(i, "name", e.target.value)} placeholder="Ej: Ana García" className="h-9 text-sm" /></div>
              <div><label className="block text-xs text-gray-500 mb-0.5">Email *</label>
                <Input type="email" value={s.email} onChange={e => update(i, "email", e.target.value)} placeholder="Ej: ana@ejemplo.com" className="h-9 text-sm" /></div>
            </div>
            {staff.length > 1 && <Button variant="ghost" size="sm" onClick={() => remove(i)} className="text-red-500 shrink-0">✕</Button>}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500">Pago:</span>
            <select value={s.payModel} onChange={e => update(i, "payModel", e.target.value)}
              className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
              {Object.entries(PAY_MODEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            {s.payModel !== "fixed" && (
              <span className="inline-flex items-center gap-1 text-xs"><span className="text-gray-500">%</span>
                <Input type="number" min={0} max={100} value={s.percentageRate} onChange={e => update(i, "percentageRate", e.target.value)} className="w-16 h-8 text-xs" /></span>)}
            {s.payModel !== "percentage" && (
              <span className="inline-flex items-center gap-1 text-xs"><span className="text-gray-500">$</span>
                <Input type="number" min={0} value={s.fixedAmount} onChange={e => update(i, "fixedAmount", e.target.value)} className="w-20 h-8 text-xs" /></span>)}
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>+ Agregar otro miembro</Button>
    </div>
  );
}

/* ───── Step 5: Payment / Mercado Pago ───── */
function PaymentStep({ mpConnected, checkingMp, isOwner, publicKey, setPublicKey, accessToken, setAccessToken, onConnectMp }: {
  mpConnected: boolean; checkingMp: boolean; isOwner: boolean;
  publicKey: string; setPublicKey: (v: string) => void;
  accessToken: string; setAccessToken: (v: string) => void;
  onConnectMp: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Medios de pago</h2>
      <p className="text-sm text-gray-500">Conectá Mercado Pago para cobrar señas online desde la web de reservas.</p>

      {checkingMp ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4"><Loader2 className="w-4 h-4 animate-spin" />Verificando conexión...</div>
      ) : mpConnected ? (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-800">Mercado Pago conectado</p>
            <p className="text-xs text-emerald-600">Ya podés cobrar señas online.</p>
          </div>
        </div>
      ) : isOwner ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-violet-50 border border-violet-200 p-4">
            <p className="text-sm font-medium text-violet-800 mb-1">Conectá tu cuenta de Mercado Pago</p>
            <p className="text-xs text-violet-600 mb-3">Te redirigimos a Mercado Pago para autorizar la conexión. Volvés automáticamente al wizard.</p>
            <Button onClick={onConnectMp} variant="default" size="sm">
              <ExternalLink className="w-4 h-4 mr-1" />Conectar Mercado Pago
            </Button>
          </div>
          <details className="text-xs text-gray-400">
            <summary className="cursor-pointer hover:text-gray-600">O ingresá las claves manualmente</summary>
            <div className="mt-3 space-y-3">
              <Field label="Public Key">
                <Input value={publicKey} onChange={e => setPublicKey(e.target.value)} placeholder="APP_USR-xxxxx-..." className="text-xs" />
              </Field>
              <Field label="Access Token">
                <Input value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="APP_USR-xxxxx-..." className="text-xs" />
              </Field>
            </div>
          </details>
        </div>
      ) : (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">
          Solo el dueño del negocio puede conectar Mercado Pago. Podés saltear este paso y hacerlo después desde Mi Negocio.
        </div>
      )}
    </div>
  );
}
