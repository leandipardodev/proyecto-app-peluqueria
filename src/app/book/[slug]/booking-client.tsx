"use client";

import { useEffect, useMemo, useState, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Scissors,
  Sparkles,
  UserRound,
} from "lucide-react";
import { initMercadoPago, Wallet } from "@mercadopago/sdk-react";
import {
  createPaymentPreference,
  createPublicAppointment,
  fetchPublicAvailableSlots,
} from "@/lib/dashboard/public-booking-actions";
import GoogleSignInButton from "@/components/auth/google-sign-in-button";
import { useAuth } from "@/lib/auth-context";

type Service = { id: string; name: string; price: number; duration_minutes: number };
type StaffMember = { id: string; name: string };
type Slot = { start: string; end: string; time: string };

interface BookingClientProps {
  shop: {
    id: string;
    name: string;
    description: string;
    address: string;
    phone: string;
    instagramUrl: string;
    slug: string;
  };
  services: Service[];
  staffMembers: StaffMember[];
}

const STEP_NAMES = ["Servicio", "Profesional", "Fecha", "Tus datos"];
const STAFF_COLORS = ["#c084fc", "#34d399", "#fbbf24", "#fb7185", "#22d3ee", "#fb923c", "#818cf8", "#f472b6"];

const BackgroundOrbs = memo(function BackgroundOrbs() {
  return (
    <>
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
      <div className="absolute top-[30%] right-[-5%] w-[300px] h-[300px] rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
    </>
  );
});

function getWeekDates(): Date[] {
  const today = new Date();
  const dates: Date[] = [];
  for (let i = 0; i < 21; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function parseHHmmToMinutes(value: string): number {
  const m = value.match(/(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

const BookingClient = memo(function BookingClient({ shop, services, staffMembers }: BookingClientProps) {
  const { user, isLoading: isAuthLoading } = useAuth();

  const [step, setStep] = useState(0);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [fetchedDates, setFetchedDates] = useState<Set<string>>(new Set());

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [creatingPreference, setCreatingPreference] = useState(false);
  const [paymentPreferenceId, setPaymentPreferenceId] = useState<string | null>(null);
  const [paymentInitPoint, setPaymentInitPoint] = useState<string | null>(null);

  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekDates = getWeekDates();
  const isLoggedIn = !!user;
  const hasPhoneFromSession = Boolean(user?.phone?.trim());
  const requiresManualPhone = !isLoggedIn || !hasPhoneFromSession;

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (!publicKey) return;
    initMercadoPago(publicKey, { locale: "es-AR" });
  }, []);

  useEffect(() => {
    if (!selectedService || !selectedDate || fetchedDates.has(formatDate(selectedDate))) return;

    setLoadingSlots(true);
    setSelectedSlot(null);
    const dateStr = formatDate(selectedDate);

    (async () => {
      try {
        const result = await fetchPublicAvailableSlots(shop.id, selectedService.duration_minutes, dateStr, selectedStaff?.id);
        setAvailableSlots(result.success ? (result.data ?? []) : []);
      } catch (e) {
        console.error("[BookingClient] fetch slots error:", e);
        setAvailableSlots([]);
      } finally {
        setLoadingSlots(false);
        setFetchedDates((prev) => new Set(prev).add(dateStr));
      }
    })();
  }, [selectedService, selectedDate, selectedStaff, shop.id, fetchedDates]);

  useEffect(() => {
    setFetchedDates(new Set());
    setAvailableSlots([]);
    setSelectedSlot(null);
    setSelectedDate(null);
  }, [selectedService, selectedStaff]);

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    setCustomerName(user.name?.trim() || user.email?.trim() || "Cliente");
    setCustomerEmail(user.email?.trim() || "");
    setCustomerPhone(user.phone?.trim() || "");
  }, [isLoggedIn, user]);

  const filteredSlots = useMemo(() => {
    if (!selectedDate) return availableSlots;
    const now = new Date();
    const selectedIsToday = selectedDate.toDateString() === now.toDateString();
    if (!selectedIsToday) return availableSlots;

    const minMinutes = 21 * 60;
    return availableSlots.filter((slot) => parseHHmmToMinutes(slot.time) >= minMinutes);
  }, [availableSlots, selectedDate]);

  const canGoNext = (() => {
    switch (step) {
      case 0:
        return selectedService !== null;
      case 1:
        return true;
      case 2:
        return selectedSlot !== null;
      case 3:
        if (isAuthLoading) return false;
        if (isLoggedIn) return customerName.trim().length > 0 && (!requiresManualPhone || customerPhone.trim().length > 0);
        return customerName.trim().length > 0 && customerEmail.trim().length > 0 && customerPhone.trim().length > 0;
      default:
        return false;
    }
  })();

  async function handleConfirm() {
    if (!selectedService || !selectedSlot || !customerName || !customerPhone) return;
    if (!isLoggedIn && !customerEmail.trim()) return;

    setSubmitting(true);
    setCreatingPreference(true);
    setError(null);

    const appointmentResult = await createPublicAppointment({
      shopId: shop.id,
      serviceId: selectedService.id,
      staffId: selectedStaff?.id,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim(),
      authenticatedUserId: user?.id,
      status: "pending_payment",
      startTime: selectedSlot.start,
      endTime: selectedSlot.end,
    });

    if (!appointmentResult.success || !appointmentResult.data?.appointmentId) {
      setSubmitting(false);
      setCreatingPreference(false);
      setError(appointmentResult.success ? "No se pudo crear el turno" : appointmentResult.error || "No se pudo crear el turno");
      return;
    }

    const preferenceResult = await createPaymentPreference({
      appointmentId: appointmentResult.data.appointmentId,
      shopId: shop.id,
      shopSlug: shop.slug,
    });

    setSubmitting(false);
    setCreatingPreference(false);

    if (!preferenceResult.success || !preferenceResult.data) {
      setError(preferenceResult.success ? "No se pudo iniciar el pago" : preferenceResult.error || "No se pudo iniciar el pago");
      return;
    }

    setPaymentPreferenceId(preferenceResult.data.preferenceId);
    setPaymentInitPoint(preferenceResult.data.initPoint);
  }

  function handleReset() {
    setStep(0);
    setSelectedService(null);
    setSelectedStaff(null);
    setSelectedDate(null);
    setSelectedSlot(null);
    setAvailableSlots([]);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setSubmitting(false);
    setCreatingPreference(false);
    setPaymentPreferenceId(null);
    setPaymentInitPoint(null);
    setDone(false);
    setError(null);
    setFetchedDates(new Set());
  }

  const summaryService = selectedService?.name || "Sin servicio";
  const summaryDate = selectedDate ? formatDisplayDate(selectedDate).replace(/^\w/, (c) => c.toUpperCase()) : "Sin fecha";
  const summaryTime = selectedSlot?.time || "Sin hora";

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-950 to-zinc-900 flex items-center justify-center p-4 relative overflow-hidden pb-28">
      <BackgroundOrbs />

      <div className="w-full max-w-4xl relative z-10">
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
          {!done ? (
            <>
              <div className="pb-5 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
                    <Scissors className="w-5 h-5 text-blue-300" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-lg font-semibold text-white truncate">{shop.name}</h1>
                    <p className="text-xs text-zinc-300/80 truncate">{shop.description || "Reservá tu turno online"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 mt-4">
                  {STEP_NAMES.map((name, i) => (
                    <div key={name} className="flex items-center gap-1 flex-1">
                      <div
                        className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold transition-all ${
                          i < step
                            ? "bg-emerald-500 text-white"
                            : i === step
                              ? "bg-blue-500 text-white"
                              : "bg-white/10 text-zinc-400 border border-white/10"
                        }`}
                      >
                        {i < step ? <Check className="w-3 h-3" /> : i + 1}
                      </div>
                      <span className={`text-[10px] hidden sm:inline ${i === step ? "text-white font-medium" : "text-zinc-400"}`}>{name}</span>
                      {i < STEP_NAMES.length - 1 && <div className="flex-1 h-px bg-white/10 mx-1" />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-5 min-h-[380px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {step === 0 && (
                      <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-white">Elegí tu servicio</h2>
                        {services.map((svc) => {
                          const isSelected = selectedService?.id === svc.id;
                          return (
                            <button
                              key={svc.id}
                              onClick={() => setSelectedService(svc)}
                              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left transition-all border ${
                                isSelected ? "bg-blue-500/20 border-blue-400/40" : "bg-white/5 border-white/10 hover:bg-white/10"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`p-2 rounded-full ${isSelected ? "bg-blue-500/25" : "bg-white/10"}`}>
                                  <Scissors className={`w-4 h-4 ${isSelected ? "text-blue-300" : "text-zinc-300"}`} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-white truncate">{svc.name}</p>
                                  <p className="text-xs text-zinc-400">{svc.duration_minutes} min</p>
                                </div>
                              </div>
                              <p className={`text-sm font-semibold shrink-0 ${isSelected ? "text-blue-300" : "text-white"}`}>${svc.price.toFixed(2)}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {step === 1 && (
                      <div className="space-y-3">
                        <h2 className="text-sm font-semibold text-white">Elegí tu profesional</h2>
                        <button
                          onClick={() => setSelectedStaff(null)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all border ${
                            !selectedStaff ? "bg-blue-500/20 border-blue-400/40" : "bg-white/5 border-white/10 hover:bg-white/10"
                          }`}
                        >
                          <div className="w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-zinc-300">
                            <UserRound className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">Sin preferencia</p>
                            <p className="text-xs text-zinc-400">Cualquier profesional disponible</p>
                          </div>
                        </button>
                        {staffMembers.map((s, i) => {
                          const isSelected = selectedStaff?.id === s.id;
                          const color = STAFF_COLORS[i % STAFF_COLORS.length];
                          return (
                            <button
                              key={s.id}
                              onClick={() => setSelectedStaff(s)}
                              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all border ${
                                isSelected ? "bg-blue-500/20 border-blue-400/40" : "bg-white/5 border-white/10 hover:bg-white/10"
                              }`}
                            >
                              <span
                                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
                                style={{ backgroundColor: color }}
                              >
                                {getInitials(s.name)}
                              </span>
                              <p className="text-sm font-medium text-white">{s.name}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {step === 2 && (
                      <div className="space-y-4">
                        <h2 className="text-sm font-semibold text-white">Elegí fecha y horario</h2>

                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {weekDates.map((d) => {
                            const dateStr = formatDate(d);
                            const isSelected = selectedDate && formatDate(selectedDate) === dateStr;
                            const dayName = d.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
                            const dayNum = d.getDate();
                            const isToday = formatDate(d) === formatDate(new Date());
                            return (
                              <button
                                key={dateStr}
                                onClick={() => {
                                  setSelectedDate(d);
                                  setSelectedSlot(null);
                                  setFetchedDates(new Set());
                                }}
                                className={`flex flex-col items-center gap-1 px-4 py-3 rounded-2xl transition-all shrink-0 border ${
                                  isSelected ? "bg-blue-500/20 border-blue-400/40" : "bg-white/5 border-white/10 hover:bg-white/10"
                                } ${isToday ? "ring-1 ring-blue-400/40" : ""}`}
                              >
                                <span className="text-[10px] uppercase text-zinc-400">{dayName}</span>
                                <span className={`text-sm font-semibold ${isSelected ? "text-blue-300" : "text-white"}`}>{dayNum}</span>
                                {isToday && <span className="text-[8px] text-blue-300 font-semibold uppercase">Hoy</span>}
                              </button>
                            );
                          })}
                        </div>

                        {loadingSlots ? (
                          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                            {[...Array(8)].map((_, i) => (
                              <div key={i} className="h-10 rounded-full bg-white/10 border border-white/10 animate-pulse" />
                            ))}
                          </div>
                        ) : (
                          <AnimatePresence mode="wait">
                            {filteredSlots.length > 0 ? (
                              <motion.div
                                key="slots-grid"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="grid grid-cols-3 md:grid-cols-4 gap-3"
                              >
                                {filteredSlots.map((slot) => {
                                  const isSelected = selectedSlot?.start === slot.start;
                                  return (
                                    <motion.button
                                      key={slot.start}
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => setSelectedSlot(slot)}
                                      className={`h-10 rounded-full text-sm font-medium border transition-all ${
                                        isSelected
                                          ? "bg-gradient-to-br from-blue-600 to-purple-600 shadow-[0_0_20px_rgba(59,130,246,0.5)] border-blue-300/40 text-white"
                                          : "bg-white/5 border-white/15 text-zinc-200 hover:bg-white/10"
                                      }`}
                                    >
                                      {slot.time}
                                    </motion.button>
                                  );
                                })}
                              </motion.div>
                            ) : (
                              <motion.p
                                key="slots-empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="text-sm text-zinc-400 text-center py-4"
                              >
                                {selectedDate
                                  ? "No hay horarios disponibles para este día"
                                  : "Seleccioná una fecha para ver horarios"}
                              </motion.p>
                            )}
                          </AnimatePresence>
                        )}
                      </div>
                    )}

                    {step === 3 && (
                      <div className="space-y-4">
                        <h2 className="text-sm font-semibold text-white">Tus datos</h2>

                        {error === "slot_taken" ? (
                          <div className="bg-amber-500/10 text-amber-200 text-sm px-5 py-4 rounded-2xl border border-amber-300/20">
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-full bg-amber-300/10 shrink-0 mt-0.5">
                                <AlertTriangle className="w-4 h-4 text-amber-300" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold tracking-tight">Ese turno ya no está disponible</p>
                                <p className="mt-0.5 text-amber-100/80">Elegí otro horario y volvemos a intentar.</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setStep(2);
                                setError(null);
                                setSelectedSlot(null);
                              }}
                              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-300/10 text-amber-100 text-sm font-medium hover:bg-amber-300/20 transition-all"
                            >
                              <RefreshCw className="w-4 h-4" />
                              Elegir otro horario
                            </button>
                          </div>
                        ) : error ? (
                          <div className="bg-red-500/10 text-red-200 text-sm px-4 py-2.5 rounded-full border border-red-300/20">{error}</div>
                        ) : null}

                        {isAuthLoading ? (
                          <div className="space-y-2">
                            <div className="h-14 rounded-2xl bg-white/10 border border-white/10 animate-pulse" />
                            <div className="h-11 rounded-full bg-white/10 border border-white/10 animate-pulse" />
                          </div>
                        ) : isLoggedIn ? (
                          <>
                            <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-300/20 px-4 py-3">
                              {user?.avatarUrl ? (
                                <img
                                  src={user.avatarUrl}
                                  alt={user.name || "Google avatar"}
                                  className="w-10 h-10 rounded-full object-cover border border-white/30"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                  <UserRound className="w-4 h-4 text-emerald-200" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs uppercase tracking-wide text-emerald-200/80">Sesión activa</p>
                                <p className="text-sm font-medium text-white truncate">{user?.name || user?.email || "Cliente"}</p>
                                {user?.email && <p className="text-xs text-zinc-300 truncate">{user.email}</p>}
                              </div>
                            </div>

                            {requiresManualPhone && (
                              <div>
                                <label className="block text-sm font-medium text-zinc-200 mb-1.5">WhatsApp / Teléfono</label>
                                <div className="relative">
                                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                  <input
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                    className="w-full rounded-full bg-white/5 border border-white/15 pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-all"
                                    placeholder="11 1234-5678"
                                  />
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <GoogleSignInButton shopSlug={shop.slug} />

                            <div className="flex items-center gap-3">
                              <div className="h-px bg-white/15 flex-1" />
                              <span className="text-xs uppercase tracking-wide text-zinc-400">OR</span>
                              <div className="h-px bg-white/15 flex-1" />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-zinc-200 mb-1.5">Nombre</label>
                              <div className="relative">
                                <UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                  value={customerName}
                                  onChange={(e) => setCustomerName(e.target.value)}
                                  className="w-full rounded-full bg-white/5 border border-white/15 pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-all"
                                  placeholder="Tu nombre"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-zinc-200 mb-1.5">Email</label>
                              <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                  type="email"
                                  value={customerEmail}
                                  onChange={(e) => setCustomerEmail(e.target.value)}
                                  className="w-full rounded-full bg-white/5 border border-white/15 pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-all"
                                  placeholder="tu@email.com"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-zinc-200 mb-1.5">WhatsApp / Teléfono</label>
                              <div className="relative">
                                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                  value={customerPhone}
                                  onChange={(e) => setCustomerPhone(e.target.value)}
                                  className="w-full rounded-full bg-white/5 border border-white/15 pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-400/40 transition-all"
                                  placeholder="11 1234-5678"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        {paymentPreferenceId && (
                          <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4 space-y-3">
                            <p className="text-sm font-medium text-white">Pago listo para completar</p>
                            <div className="rounded-xl overflow-hidden bg-white p-2">
                              <Wallet initialization={{ preferenceId: paymentPreferenceId }} />
                            </div>
                            {paymentInitPoint && (
                              <a
                                href={paymentInitPoint}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 border border-white/15 text-zinc-100 transition-all"
                              >
                                Abrir checkout en otra pestaña
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="pt-4 flex items-center gap-3">
                {step > 0 && (
                  <button
                    onClick={() => setStep((s) => s - 1)}
                    className="inline-flex items-center gap-1 px-4 py-2.5 rounded-full text-sm font-medium text-zinc-200 hover:bg-white/10 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Atrás
                  </button>
                )}
                <div className="flex-1" />
                {step < 3 && (
                  <button
                    onClick={() => canGoNext && setStep((s) => s + 1)}
                    disabled={!canGoNext}
                    className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                      canGoNext
                        ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white"
                        : "bg-white/10 text-zinc-500 cursor-not-allowed"
                    }`}
                  >
                    Continuar
                  </button>
                )}
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="py-12 text-center"
            >
              <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Check className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">¡Turno reservado!</h2>
              <p className="text-sm text-zinc-300 mb-6">Ya quedó todo listo.</p>
              <button
                onClick={handleReset}
                className="px-6 py-2.5 rounded-full text-sm font-medium bg-white/10 text-zinc-100 hover:bg-white/15 transition-all border border-white/15"
              >
                Nueva reserva
              </button>
            </motion.div>
          )}
        </div>

        {!done && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-400">
            {shop.address && (
              <a
                href={`https://www.google.com/maps/search/${encodeURIComponent(shop.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-zinc-200 transition-colors"
              >
                <MapPin className="w-3 h-3" /> {shop.address}
              </a>
            )}
            {shop.phone && (
              <a
                href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`}
                className="flex items-center gap-1 hover:text-zinc-200 transition-colors"
              >
                <Phone className="w-3 h-3" /> {shop.phone}
              </a>
            )}
            {shop.instagramUrl && (
              <a
                href={shop.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-zinc-200 transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Instagram
              </a>
            )}
          </div>
        )}
      </div>

      {!done && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="mx-2 mb-2 rounded-2xl bg-white/10 backdrop-blur-2xl border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.35)] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="text-xs sm:text-sm text-zinc-100 min-w-0 flex-1">
                <p className="truncate"><span className="text-zinc-300">Selected Service:</span> {summaryService}</p>
                <p className="truncate"><span className="text-zinc-300">Date:</span> {summaryDate}</p>
                <p className="truncate"><span className="text-zinc-300">Time:</span> {summaryTime}</p>
              </div>

              <button
                onClick={handleConfirm}
                disabled={step !== 3 || submitting || creatingPreference || !canGoNext || !!paymentPreferenceId}
                className="relative overflow-hidden inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_18px_rgba(59,130,246,0.45)]"
              >
                <span className="absolute inset-0 -translate-x-full animate-[shimmer_2.2s_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                {submitting || creatingPreference ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Confirm Appointment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes shimmer {
          100% {
            transform: translateX(220%);
          }
        }
      `}</style>
    </div>
  );
});

export default BookingClient;
