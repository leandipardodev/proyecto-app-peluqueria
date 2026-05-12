"use client";

import { useEffect, useMemo, useState, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
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

const BackgroundOrbs = memo(function BackgroundOrbs() {
  return (
    <>
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#0071E3]/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-sky-300/20 blur-3xl pointer-events-none" />
      <div className="absolute top-[30%] right-[-5%] w-[300px] h-[300px] rounded-full bg-white/70 blur-3xl pointer-events-none" />
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
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-3 sm:p-6 relative overflow-hidden pb-28 text-[#1D1D1F]">
      <BackgroundOrbs />

      <div className="w-full max-w-4xl relative z-10">
        <div className="bg-white/90 backdrop-blur-xl border border-white rounded-[24px] p-4 sm:p-8 shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
          {!done ? (
            <>
              <div className="pb-6 border-b border-[#E5E5EA]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0071E3]/10 border border-[#0071E3]/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold tracking-tight text-[#0071E3]">Klip</span>
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl font-semibold tracking-tight text-[#1D1D1F] truncate">{shop.name}</h1>
                    <p className="text-xs text-[#86868B] truncate uppercase tracking-[0.14em]">{shop.description || "Reserva online"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-5">
                  {STEP_NAMES.map((name, i) => (
                    <div key={name} className="flex items-center gap-1 flex-1">
                      <div
                        className={`h-1 rounded-full text-[10px] font-semibold transition-all flex-1 ${
                          i < step
                            ? "bg-[#0071E3]"
                            : i === step
                              ? "bg-[#0071E3]/70"
                              : "bg-[#D2D2D7]"
                        }`}
                      />
                      <span className={`text-[11px] tracking-wide whitespace-nowrap ${i === step ? "text-[#1D1D1F] font-medium" : "text-[#86868B]"}`}>{name}</span>
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
                        <h2 className="text-xl font-semibold tracking-tight text-[#1D1D1F]">Elegi tu servicio</h2>
                        {services.map((svc) => {
                          const isSelected = selectedService?.id === svc.id;
                          return (
                            <button
                              key={svc.id}
                              onClick={() => setSelectedService(svc)}
                              className={`w-full text-left px-5 py-4 rounded-[20px] transition-all border ${
                                isSelected ? "bg-[#0071E3]/8 border-[#0071E3]" : "bg-white border-[#E5E5EA] hover:border-[#0071E3]/40"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="text-lg sm:text-xl font-semibold text-[#1D1D1F] truncate tracking-tight">{svc.name}</p>
                                  <p className="text-xs text-[#86868B] mt-1 uppercase tracking-[0.12em]">{svc.duration_minutes} min</p>
                                </div>
                                <p className={`text-base font-semibold shrink-0 ${isSelected ? "text-[#0071E3]" : "text-[#1D1D1F]"}`}>${svc.price.toFixed(2)}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {step === 1 && (
                      <div className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight text-[#1D1D1F]">Elegi tu profesional</h2>
                        <button
                          onClick={() => setSelectedStaff(null)}
                          className={`w-full px-5 py-4 rounded-[20px] text-left transition-all border ${
                            !selectedStaff ? "bg-[#0071E3]/8 border-[#0071E3]" : "bg-white border-[#E5E5EA] hover:border-[#0071E3]/40"
                          }`}
                        >
                          <div>
                            <p className="text-lg sm:text-xl font-semibold text-[#1D1D1F] tracking-tight">Sin preferencia</p>
                            <p className="text-xs text-[#86868B] uppercase tracking-[0.12em] mt-1">Cualquier profesional disponible</p>
                          </div>
                        </button>
                        {staffMembers.map((s) => {
                          const isSelected = selectedStaff?.id === s.id;
                          return (
                            <button
                              key={s.id}
                              onClick={() => setSelectedStaff(s)}
                              className={`w-full px-5 py-4 rounded-[20px] text-left transition-all border ${
                                isSelected ? "bg-[#0071E3]/8 border-[#0071E3]" : "bg-white border-[#E5E5EA] hover:border-[#0071E3]/40"
                              }`}
                            >
                              <p className="text-lg sm:text-xl font-semibold text-[#1D1D1F] tracking-tight">{s.name}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {step === 2 && (
                      <div className="space-y-4">
                        <h2 className="text-xl font-semibold tracking-tight text-[#1D1D1F]">Elegi fecha y horario</h2>

                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 sm:gap-3">
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
                                className={`flex flex-col items-center justify-center gap-1 py-3 rounded-[20px] transition-all border min-h-[78px] ${
                                  isSelected ? "bg-[#0071E3]/8 border-[#0071E3]" : "bg-white border-[#E5E5EA] hover:border-[#0071E3]/40"
                                } ${isToday ? "ring-1 ring-blue-400/40" : ""}`}
                              >
                                <span className="text-[10px] uppercase text-[#86868B]">{dayName}</span>
                                <span className={`text-sm font-semibold ${isSelected ? "text-[#0071E3]" : "text-[#1D1D1F]"}`}>{dayNum}</span>
                                {isToday && <span className="text-[8px] text-[#0071E3] font-semibold uppercase">Hoy</span>}
                              </button>
                            );
                          })}
                        </div>

                        {loadingSlots ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
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
                                className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4"
                              >
                                {filteredSlots.map((slot) => {
                                  const isSelected = selectedSlot?.start === slot.start;
                                  return (
                                    <motion.button
                                      key={slot.start}
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => setSelectedSlot(slot)}
                                      className={`h-12 sm:h-14 rounded-full text-base font-medium border transition-all px-3 ${
                                        isSelected
                                          ? "bg-[#0071E3] border-[#0071E3] text-white"
                                          : "bg-white border-[#D2D2D7] text-[#1D1D1F] hover:border-[#0071E3]/40"
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
                        <h2 className="text-xl font-semibold tracking-tight text-[#1D1D1F]">Tus datos</h2>

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
                            <div className="flex items-center gap-3 rounded-[20px] bg-emerald-50 border border-emerald-200 px-4 py-3">
                              <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center">
                                <UserRound className="w-4 h-4 text-emerald-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs uppercase tracking-wide text-emerald-600">Sesion activa</p>
                                <p className="text-sm font-medium text-[#1D1D1F] truncate">{user?.name || user?.email || "Cliente"}</p>
                                {user?.email && <p className="text-xs text-[#86868B] truncate">{user.email}</p>}
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
                                    className="w-full rounded-full bg-white border border-[#D2D2D7] pl-10 pr-4 py-2.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40 transition-all"
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
                                  className="w-full rounded-full bg-white border border-[#D2D2D7] pl-10 pr-4 py-2.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40 transition-all"
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
                                  className="w-full rounded-full bg-white border border-[#D2D2D7] pl-10 pr-4 py-2.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40 transition-all"
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
                                  className="w-full rounded-full bg-white border border-[#D2D2D7] pl-10 pr-4 py-2.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40 transition-all"
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
                    className="inline-flex items-center justify-center gap-1 px-4 py-2.5 rounded-full text-sm font-medium text-zinc-200 hover:bg-white/10 transition-colors w-full sm:w-auto"
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
                    className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all w-full sm:w-auto ${
                      canGoNext
                        ? "bg-[#0071E3] text-white"
                        : "bg-[#D2D2D7] text-[#86868B] cursor-not-allowed"
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
              <h2 className="text-xl font-semibold text-[#1D1D1F] mb-2">Turno reservado</h2>
              <p className="text-sm text-[#86868B] mb-6">Ya quedo todo listo.</p>
              <button
                onClick={handleReset}
                className="px-6 py-2.5 rounded-full text-sm font-medium bg-white text-[#1D1D1F] hover:bg-[#F5F5F7] transition-all border border-[#D2D2D7]"
              >
                Nueva reserva
              </button>
            </motion.div>
          )}
        </div>

        {!done && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-[#86868B]">
            {shop.address && (
              <a
                href={`https://www.google.com/maps/search/${encodeURIComponent(shop.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-[#1D1D1F] transition-colors"
              >
                <MapPin className="w-3 h-3" /> {shop.address}
              </a>
            )}
            {shop.phone && (
              <a
                href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`}
                className="flex items-center gap-1 hover:text-[#1D1D1F] transition-colors"
              >
                <Phone className="w-3 h-3" /> {shop.phone}
              </a>
            )}
            {shop.instagramUrl && (
              <a
                href={shop.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-[#1D1D1F] transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Instagram
              </a>
            )}
          </div>
        )}
      </div>

      {!done && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="mx-2 mb-2 rounded-2xl bg-white/95 backdrop-blur-2xl border border-white shadow-[0_12px_30px_rgba(0,0,0,0.12)] px-4 py-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="text-xs sm:text-sm text-[#1D1D1F] min-w-0 flex-1">
                <p className="truncate"><span className="text-[#86868B]">Servicio:</span> {summaryService}</p>
                <p className="truncate"><span className="text-[#86868B]">Fecha:</span> {summaryDate}</p>
                <p className="truncate"><span className="text-[#86868B]">Hora:</span> {summaryTime}</p>
              </div>

              <button
                onClick={handleConfirm}
                disabled={step !== 3 || submitting || creatingPreference || !canGoNext || !!paymentPreferenceId}
                className="relative overflow-hidden inline-flex justify-center items-center gap-2 px-5 py-3 rounded-full text-sm font-medium text-white bg-[#0071E3] hover:bg-[#0062c6] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(0,113,227,0.35)] w-full sm:w-auto"
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
                    Confirmar turno
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
