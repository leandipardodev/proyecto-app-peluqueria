"use client";

import { useEffect, useMemo, useState, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
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
  deletePublicAppointment,
  fetchPublicAvailableSlots,
} from "@/lib/dashboard/public-booking-actions";
import GoogleSignInButton from "@/components/auth/google-sign-in-button";
import { useAuth } from "@/lib/auth-context";
import type { BookingTemplateId } from "@/lib/booking/theme-presets";
import type { Industry } from "@/lib/industry/types";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";

type Service = { id: string; name: string; price: number; duration_minutes: number; category: string | null };
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
    industry: Industry;
    mpPublicKey: string;
    logoUrl: string;
    heroTitle: string;
    heroSubtitle: string;
    aboutTitle: string;
    aboutText: string;
    sectionOrder: string[];
    sectionServiceOrder: string[];
    templateId: BookingTemplateId;
  };
  services: Service[];
  staffMembers: StaffMember[];
}

const stepReveal = {
  initial: { opacity: 0, y: 14, filter: "blur(2px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const, staggerChildren: 0.055, delayChildren: 0.03 },
  },
  exit: { opacity: 0, y: -8, filter: "blur(1px)", transition: { duration: 0.2 } },
};

const stepItemReveal = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const } },
};

let lastHapticAt = 0;

const triggerHaptic = (duration = 15, target?: HTMLElement | null) => {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastHapticAt < 70) return;
  lastHapticAt = now;

  if (navigator.vibrate) {
    navigator.vibrate(duration);
    return;
  }

  if (target?.animate) {
    target.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(0.985)", opacity: 0.92 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 130, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }
};
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

function to24HourTimeLabel(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Math.max(0, Math.min(23, Number(hhmm[1])));
    const m = Math.max(0, Math.min(59, Number(hhmm[2])));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const ampm = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2] || "0");
    const period = ampm[3];
    if (period === "p" && hour !== 12) hour += 12;
    if (period === "a" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return value;
}

function formatTimeFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
  const [chargedAmount, setChargedAmount] = useState<number | null>(null);
  const [isDepositPayment, setIsDepositPayment] = useState(false);

  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const industryConfig = INDUSTRY_CONFIG[shop.industry] || INDUSTRY_CONFIG.peluqueria;
  const serviceWord = industryConfig.labels.serviceSingular;
  const staffWord = industryConfig.labels.staffSingular;
  const serviceWordLower = serviceWord.toLowerCase();
  const staffWordLower = staffWord.toLowerCase();
  const STEP_NAMES = [serviceWord, staffWord, "Fecha", "Tus datos"];

  const weekDates = getWeekDates();
  const isLoggedIn = !!user;
  const hasPhoneFromSession = Boolean(user?.phone?.trim());
  const requiresManualPhone = !isLoggedIn || !hasPhoneFromSession;
  const categories = useMemo(() => {
    const found = Array.from(new Set(services.map((svc) => (svc.category || "General").trim()).filter(Boolean)));
    const preferred = (shop.sectionOrder || []).map((item) => item.trim()).filter(Boolean);
    const merged: string[] = [];
    for (const item of preferred) {
      if (found.includes(item) && !merged.includes(item)) merged.push(item);
    }
    for (const item of found) {
      if (!merged.includes(item)) merged.push(item);
    }
    return ["Todos", ...merged];
  }, [services, shop.sectionOrder]);

  const filteredServices = useMemo(() => {
    const base = selectedCategory === "Todos"
      ? services
      : services.filter((svc) => (svc.category || "General") === selectedCategory);
    const order = shop.sectionServiceOrder || [];
    if (!order.length) return base;
    const ranked = new Map(order.map((id, idx) => [id, idx]));
    return [...base].sort((a, b) => {
      const ai = ranked.get(a.id);
      const bi = ranked.get(b.id);
      if (ai === undefined && bi === undefined) return 0;
      if (ai === undefined) return 1;
      if (bi === undefined) return -1;
      return ai - bi;
    });
  }, [services, selectedCategory, shop.sectionServiceOrder]);

  useEffect(() => {
    const publicKey = shop.mpPublicKey || process.env.NEXT_PUBLIC_MP_PUBLIC_KEY || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (!publicKey) return;
    initMercadoPago(publicKey, { locale: "es-AR" });
  }, [shop.mpPublicKey]);

  useEffect(() => {
    if (!selectedService || !selectedDate || fetchedDates.has(formatDate(selectedDate))) return;

    setLoadingSlots(true);
    setSelectedSlot(null);
    const dateStr = formatDate(selectedDate);

    (async () => {
      try {
        const result = await fetchPublicAvailableSlots(shop.id, selectedService.duration_minutes, dateStr, selectedStaff?.id);
        setAvailableSlots(
          result.success
            ? (result.data ?? []).map((slot) => ({
                ...slot,
                time: to24HourTimeLabel(slot.time),
              }))
            : [],
        );
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
    const safeName = user.name?.trim();
    const normalizedName = safeName && !safeName.includes("@") ? safeName : "Cliente";
    setCustomerName(normalizedName);
    setCustomerEmail(user.email?.trim() || "");
    setCustomerPhone(user.phone?.trim() || "");
  }, [isLoggedIn, user]);

  const googleCalendarUrl = useMemo(() => {
    if (!selectedSlot || !selectedService) return null;
    const toGoogleDate = (iso: string) => {
      const d = new Date(iso);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const min = String(d.getUTCMinutes()).padStart(2, "0");
      const ss = String(d.getUTCSeconds()).padStart(2, "0");
      return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
    };
    const title = `${shop.name} - ${selectedService.name}`;
    const details = `Turno reservado en ${shop.name}`;
    const location = shop.address || "";
    const dates = `${toGoogleDate(selectedSlot.start)}/${toGoogleDate(selectedSlot.end)}`;
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}&dates=${encodeURIComponent(dates)}`;
  }, [selectedSlot, selectedService, shop.name, shop.address]);

  const filteredSlots = useMemo(() => {
    if (!selectedDate) return availableSlots;
    const now = new Date();
    const selectedIsToday = selectedDate.toDateString() === now.toDateString();
    if (!selectedIsToday) return availableSlots;

    const minMinutes = now.getHours() * 60 + now.getMinutes();
    return availableSlots.filter((slot) => {
      const date = new Date(slot.start);
      if (Number.isNaN(date.getTime())) return parseHHmmToMinutes(to24HourTimeLabel(slot.time)) >= minMinutes;
      const slotMinutes = date.getHours() * 60 + date.getMinutes();
      return slotMinutes >= minMinutes;
    });
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
      await deletePublicAppointment({
        appointmentId: appointmentResult.data.appointmentId,
        shopId: shop.id,
      });
      setError(preferenceResult.success ? "No se pudo iniciar el pago" : preferenceResult.error || "No se pudo iniciar el pago");
      return;
    }

    const safePreferenceId = String(preferenceResult.data.preferenceId || "").trim();
    if (!safePreferenceId) {
      await deletePublicAppointment({
        appointmentId: appointmentResult.data.appointmentId,
        shopId: shop.id,
      });
      setError("No se pudo iniciar el checkout");
      return;
    }

    setPaymentPreferenceId(safePreferenceId);
    setPaymentInitPoint(preferenceResult.data.initPoint);
    setChargedAmount(preferenceResult.data.chargedAmount ?? null);
    setIsDepositPayment(Boolean(preferenceResult.data.isDeposit));
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
    setChargedAmount(null);
    setIsDepositPayment(false);
    setDone(false);
    setError(null);
    setFetchedDates(new Set());
  }

  const summaryService = selectedService?.name || "Sin servicio";
  const summaryDate = selectedDate ? formatDisplayDate(selectedDate).replace(/^\w/, (c) => c.toUpperCase()) : "Sin fecha";
  const summaryTime = selectedSlot ? formatTimeFromIso(selectedSlot.start) || to24HourTimeLabel(selectedSlot.time) : "Sin hora";

  const resolvedTemplate: "minimal-light" | "carbon-glass" | "editorial-cream" | "pastel-colorful" =
    shop.templateId === "classic-dark"
      ? "carbon-glass"
      : shop.templateId === "editorial-luxury"
        ? "editorial-cream"
        : shop.templateId === "street-bold"
          ? "pastel-colorful"
          : "minimal-light";

  const templateStyles = {
    "minimal-light": {
      isDark: false,
      page: "bg-[#EEF4FF] text-[#1C1C1E]",
      pageAura: "from-[#cfe1ff] via-[#f5faff] to-[#dffbee]",
      pageLightFx: "[background:radial-gradient(circle_at_12%_16%,rgba(118,167,255,0.48),transparent_38%),radial-gradient(circle_at_88%_84%,rgba(85,211,177,0.38),transparent_34%),radial-gradient(circle_at_58%_40%,rgba(165,194,255,0.26),transparent_42%)]",
      glowBlend: "mix-blend-multiply",
      motionPreset: "airy",
      shell: "bg-white/58 border border-[#cfdcec] backdrop-blur-[24px] shadow-[0_28px_90px_-45px_rgba(7,13,32,0.32)]",
      heading: "text-[#111114]",
      headingFx: "drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]",
      titleGradient: "from-[#0f172a] via-[#2c61b8] to-[#60a5fa]",
      subtitleGradient: "from-[#4f6584] via-[#6c8ec0] to-[#5fa7c6]",
      tiny: "text-[#5A6472]",
      accent: "text-[#0071E3]",
      selected: "bg-white/18 border-[#111114]/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_20px_35px_-25px_rgba(0,113,227,0.55)]",
      plain: "bg-white/8 border-black/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
      sectionChip: "bg-white/78 border-[#d4deea] text-[#4f6078] hover:border-[#8fb3ef]",
      sectionChipActive: "bg-[#eef5ff] border-[#78a7f0] text-[#1f56a8] shadow-[0_14px_28px_-20px_rgba(15,95,204,0.5)]",
      sectionFocus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ca2f1]/55 focus-visible:ring-offset-1 focus-visible:ring-offset-white/70",
      sectionTag: "bg-white/86 border-[#d5dfec] text-[#5b6a80] hover:bg-white hover:border-[#8fb3ef]",
      sectionTagActive: "bg-[#e8f2ff] border-[#74a1ec] text-[#1f56a8] shadow-[0_10px_22px_-16px_rgba(15,95,204,0.6)]",
      sectionTagAll: "bg-transparent border-transparent text-[#7f8ea5] hover:text-[#4b5d79]",
      hoverBorder: "hover:border-[#0071E3]/35",
      progressDone: "bg-[#0071E3]",
      progressCurrent: "bg-[#0071E3]/65",
      progressPending: "bg-[#D2D2D7]",
      progressShell: "bg-white/55 border-black/10 shadow-[0_16px_36px_-22px_rgba(15,23,42,0.24)]",
      progressTrack: "bg-[#ced8e6]",
      progressFill: "bg-gradient-to-r from-[#0f5fcc] to-[#66a5ff]",
      progressStepDone: "bg-[#e7f1ff] text-[#1b5ab8] border-[#b9d3ff]",
      progressStepActive: "bg-[#0f5fcc] text-white border-[#5f9fff] shadow-[0_10px_22px_-14px_rgba(15,95,204,0.7)]",
      progressStepIdle: "bg-white/75 text-[#6b778a] border-[#d3dbe8]",
      divider: "bg-black/10",
      ctaMain: "bg-[#111114] text-white",
      ctaDepth: "shadow-[0_18px_34px_-18px_rgba(7,13,32,0.55),inset_0_1px_0_rgba(255,255,255,0.2)]",
      next: "bg-[#111114] text-white hover:bg-black",
      nextDisabled: "bg-[#d5deea] text-[#7a8798]",
      label: "text-zinc-700",
      input: "w-full rounded-full bg-white border border-[#D2D2D7] pl-10 pr-4 py-2.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40 transition-all",
      back: "border border-[#cfd8e6] bg-white/72 text-[#46566e] hover:bg-white",
      doneTitle: "text-[#1D1D1F]",
      doneText: "text-[#86868B]",
      meta: "text-[#86868B]",
      metaHover: "hover:text-[#1D1D1F]",
      footer: "bg-white/85 backdrop-blur-md border-white/80",
      footerText: "text-[#1D1D1F]",
      glowA: "bg-[#6aa6ff]/70",
      glowB: "bg-[#72e2c0]/62",
      glowC: "bg-[#9db9ff]/58",
      plate: "bg-white/40 border-black/5",
      cardDepth: "shadow-[0_18px_42px_-24px_rgba(15,23,42,0.3),inset_0_1px_0_rgba(255,255,255,0.75)]",
      line: "border-black/10",
      skeleton: "bg-black/5 border-black/10",
      successChip: "bg-emerald-50/90 border-emerald-200 text-emerald-800",
      warningBox: "bg-amber-100/60 border-amber-300/40 text-amber-900",
      errorBox: "bg-rose-100/70 border-rose-300/40 text-rose-900",
      checkout: "bg-white/45 border-black/10",
      checkoutKicker: "text-[#44566F]",
      checkoutTitle: "text-[#111114]",
      checkoutAmount: "text-[#111114]",
      checkoutBadge: "border-[#A8C7E9] bg-[#EAF3FF] text-[#1A4B7A]",
      checkoutWallet: "border-black/10 bg-white/90",
      checkoutLink: "border-black/15 bg-white/70 text-[#1D1D1F] hover:bg-white",
      calendar: "bg-[#0071E3] text-white hover:bg-[#0062c6]",
      checkoutOrbA: "bg-[#8bb9ff]/35",
      checkoutOrbB: "bg-[#8de4cc]/30",
      priceText: "text-[1.58rem] sm:text-[1.8rem] font-bold tracking-[-0.03em] font-['SF_Pro_Display','Segoe_UI','Inter','system-ui',sans-serif]",
      priceFx: "text-[#0c4a98] drop-shadow-[0_10px_22px_rgba(15,79,163,0.28)]",
      pricePill: "border-[#b9cade] bg-white/55 text-[#41526a]",
      ghostBtn: "border-[#cfd8e6] bg-white/75 text-[#2a3950] hover:bg-white",
    },
    "carbon-glass": {
      isDark: true,
      page: "bg-[#05070D] text-[#F5F5F7]",
      pageAura: "from-[#0a1a33] via-[#070c17] to-[#122746]",
      pageLightFx: "[background:radial-gradient(circle_at_14%_14%,rgba(55,122,230,0.42),transparent_42%),radial-gradient(circle_at_86%_82%,rgba(41,90,175,0.36),transparent_38%),radial-gradient(circle_at_55%_44%,rgba(76,135,234,0.2),transparent_46%)]",
      glowBlend: "mix-blend-screen",
      motionPreset: "cinematic",
      shell: "bg-[#0e1522]/45 border border-[#2a3448] backdrop-blur-[24px] shadow-[0_28px_90px_-40px_rgba(0,0,0,0.9)]",
      heading: "text-[#FAFAFA]",
      headingFx: "drop-shadow-[0_1px_10px_rgba(122,184,255,0.2)]",
      titleGradient: "from-[#e5edf9] via-[#88bcff] to-[#e7f2ff]",
      subtitleGradient: "from-[#9fb2cf] via-[#88bcff] to-[#d2e4ff]",
      tiny: "text-[#A6AAB3]",
      accent: "text-[#7AB8FF]",
      selected: "bg-white/12 border-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_22px_38px_-26px_rgba(88,153,255,0.5)]",
      plain: "bg-white/[0.04] border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
      sectionChip: "bg-[#0f1b2e]/90 border-[#2c4163] text-[#9db2cf] hover:border-[#6eaaf8]",
      sectionChipActive: "bg-[#122745] border-[#6eaaf8] text-[#d7eaff] shadow-[0_14px_28px_-20px_rgba(84,153,255,0.6)]",
      sectionFocus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7ab8ff]/55 focus-visible:ring-offset-1 focus-visible:ring-offset-[#091322]",
      sectionTag: "bg-[#0f1b2e]/95 border-[#2d4264] text-[#9fb5d3] hover:bg-[#13213a] hover:border-[#6eaaf8]",
      sectionTagActive: "bg-[#17325a] border-[#74b3ff] text-[#dcecff] shadow-[0_10px_22px_-16px_rgba(84,153,255,0.7)]",
      sectionTagAll: "bg-transparent border-transparent text-[#768aa8] hover:text-[#b9d0f1]",
      hoverBorder: "hover:border-[#7AB8FF]/55",
      progressDone: "bg-[#7AB8FF]",
      progressCurrent: "bg-[#7AB8FF]/70",
      progressPending: "bg-white/15",
      progressShell: "bg-[#0d1626]/60 border-[#2a3750] shadow-[0_20px_42px_-24px_rgba(0,0,0,0.9)]",
      progressTrack: "bg-[#25344f]",
      progressFill: "bg-gradient-to-r from-[#4e94ff] to-[#8ac1ff]",
      progressStepDone: "bg-[#11213b] text-[#9fc8ff] border-[#2d4f7d]",
      progressStepActive: "bg-[#7ab8ff] text-[#061224] border-[#a7d0ff] shadow-[0_12px_24px_-16px_rgba(122,184,255,0.75)]",
      progressStepIdle: "bg-[#0f1b2e]/75 text-[#7f8fa8] border-[#2a3750]",
      divider: "bg-white/15",
      ctaMain: "bg-white text-black",
      ctaDepth: "shadow-[0_20px_42px_-20px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.8)]",
      next: "bg-white text-black hover:bg-zinc-200",
      nextDisabled: "bg-[#2a3448] text-[#7f8ba1]",
      label: "text-zinc-200",
      input: "w-full rounded-full bg-white border border-[#D2D2D7] pl-10 pr-4 py-2.5 text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/40 transition-all",
      back: "border border-[#2c3f5f] bg-[#111c2d]/80 text-[#bad2f3] hover:bg-[#15253d]",
      doneTitle: "text-white",
      doneText: "text-zinc-400",
      meta: "text-zinc-400",
      metaHover: "hover:text-zinc-100",
      footer: "bg-black/85 backdrop-blur-md border-white/15",
      footerText: "text-neutral-100",
      glowA: "bg-[#2f74d8]/62",
      glowB: "bg-[#183f76]/58",
      glowC: "bg-[#4e8cf2]/46",
      plate: "bg-neutral-900/30 border-white/10",
      cardDepth: "shadow-[0_24px_46px_-24px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.14)]",
      line: "border-white/15",
      skeleton: "bg-white/10 border-white/10",
      successChip: "bg-emerald-400/10 border-emerald-300/20 text-emerald-100",
      warningBox: "bg-amber-500/10 border-amber-300/20 text-amber-200",
      errorBox: "bg-red-500/10 border-red-300/20 text-red-200",
      checkout: "bg-neutral-900/35 border-white/15",
      checkoutKicker: "text-sky-100/70",
      checkoutTitle: "text-white",
      checkoutAmount: "text-white",
      checkoutBadge: "border-emerald-300/40 bg-emerald-400/15 text-emerald-100",
      checkoutWallet: "border-white/15 bg-white p-2",
      checkoutLink: "border-white/25 bg-white/12 text-white hover:bg-white/20",
      calendar: "bg-[#7AB8FF] text-black hover:bg-[#95c6ff]",
      checkoutOrbA: "bg-[#62a6ff]/30",
      checkoutOrbB: "bg-[#74c8ff]/22",
      priceText: "text-[1.58rem] sm:text-[1.8rem] font-bold tracking-[-0.03em] font-['SF_Pro_Display','Segoe_UI','Inter','system-ui',sans-serif]",
      priceFx: "text-[#b1d5ff] drop-shadow-[0_12px_24px_rgba(122,184,255,0.34)]",
      pricePill: "border-white/20 bg-white/10 text-[#c7d6eb]",
      ghostBtn: "border-[#2f4466] bg-[#101c2d]/85 text-[#c5daf6] hover:bg-[#172940]",
    },
    "editorial-cream": {
      isDark: false,
      page: "bg-[#f9f1e7] text-[#2E221A]",
      pageAura: "from-[#efd4b7] via-[#fff6ec] to-[#e7c6a7]",
      pageLightFx: "[background:radial-gradient(circle_at_12%_18%,rgba(219,152,91,0.38),transparent_40%),radial-gradient(circle_at_88%_80%,rgba(207,137,74,0.32),transparent_36%),radial-gradient(circle_at_54%_46%,rgba(237,185,135,0.24),transparent_44%)]",
      glowBlend: "mix-blend-multiply",
      motionPreset: "elegant",
      shell: "bg-[#fff8ef]/68 border border-[#ddc7b0] backdrop-blur-[24px] shadow-[0_28px_80px_-45px_rgba(121,89,45,0.28)]",
      heading: "text-[#2E221A]",
      headingFx: "drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]",
      titleGradient: "from-[#39281b] via-[#8a5f39] to-[#d3a47a]",
      subtitleGradient: "from-[#765740] via-[#9e7047] to-[#bf8e63]",
      tiny: "text-[#7A6855]",
      accent: "text-[#1A1A1A]",
      selected: "bg-white/26 border-[#B98850]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_20px_34px_-24px_rgba(163,112,58,0.45)]",
      plain: "bg-white/10 border-[#D8D0C6]",
      sectionChip: "bg-[#fff9f2] border-[#dcc7b1] text-[#7b6652] hover:border-[#bb8b5f]",
      sectionChipActive: "bg-[#f8e9d7] border-[#b8875c] text-[#7a4f2f] shadow-[0_14px_28px_-20px_rgba(138,95,57,0.55)]",
      sectionFocus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8875c]/45 focus-visible:ring-offset-1 focus-visible:ring-offset-[#fff7ed]",
      sectionTag: "bg-[#fff9f2] border-[#dcc8b3] text-[#7c6753] hover:bg-[#fff4e7] hover:border-[#b8875c]",
      sectionTagActive: "bg-[#f5e4d0] border-[#b8875c] text-[#73492c] shadow-[0_10px_22px_-16px_rgba(138,95,57,0.62)]",
      sectionTagAll: "bg-transparent border-transparent text-[#907c67] hover:text-[#6f5640]",
      hoverBorder: "hover:border-[#B98850]/45",
      progressDone: "bg-[#7D5C3A]",
      progressCurrent: "bg-[#7D5C3A]/65",
      progressPending: "bg-[#D8D0C6]",
      progressShell: "bg-[#fff8ef]/70 border-[#d9c6b1] shadow-[0_18px_38px_-24px_rgba(121,89,45,0.28)]",
      progressTrack: "bg-[#dbc9b7]",
      progressFill: "bg-gradient-to-r from-[#8a5f39] to-[#c58a57]",
      progressStepDone: "bg-[#faeddc] text-[#7a5535] border-[#d9bc9e]",
      progressStepActive: "bg-[#8a5f39] text-[#fff3e5] border-[#be8a5f] shadow-[0_12px_26px_-16px_rgba(138,95,57,0.6)]",
      progressStepIdle: "bg-[#fffaf3] text-[#8a7865] border-[#dbcbb9]",
      divider: "bg-[#D8D0C6]",
      ctaMain: "bg-[#1A1A1A] text-[#F4F0EA]",
      ctaDepth: "shadow-[0_20px_38px_-22px_rgba(108,73,39,0.55),inset_0_1px_0_rgba(255,255,255,0.15)]",
      next: "bg-[#1A1A1A] text-[#F4F0EA] hover:bg-black",
      nextDisabled: "bg-[#dfd3c4] text-[#8a7863]",
      label: "text-[#4E453C]",
      input: "w-full rounded-full bg-[#FFFDF9] border border-[#D8D0C6] pl-10 pr-4 py-2.5 text-sm text-[#1A1A1A] placeholder-[#9A8D7E] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/20 transition-all",
      back: "border border-[#d7c5b1] bg-[#fff9f2] text-[#6a5845] hover:bg-[#fff3e6]",
      doneTitle: "text-[#1A1A1A]",
      doneText: "text-[#7A6F63]",
      meta: "text-[#7A6F63]",
      metaHover: "hover:text-[#1A1A1A]",
      footer: "bg-[#F8F4EE]/95 backdrop-blur-md border-[#D8D0C6]",
      footerText: "text-[#1A1A1A]",
      glowA: "bg-[#e4aa78]/62",
      glowB: "bg-[#ca8f63]/52",
      glowC: "bg-[#f2caa6]/50",
      plate: "bg-white/50 border-stone-200/40",
      cardDepth: "shadow-[0_20px_40px_-24px_rgba(123,89,50,0.35),inset_0_1px_0_rgba(255,255,255,0.7)]",
      line: "border-stone-300/40",
      skeleton: "bg-stone-100/60 border-stone-300/35",
      successChip: "bg-emerald-50/80 border-emerald-200 text-emerald-800",
      warningBox: "bg-amber-100/70 border-amber-300/40 text-amber-900",
      errorBox: "bg-rose-100/70 border-rose-300/40 text-rose-900",
      checkout: "bg-white/55 border-stone-200/50",
      checkoutKicker: "text-[#8C6D4C]",
      checkoutTitle: "text-[#2E221A]",
      checkoutAmount: "text-[#2E221A]",
      checkoutBadge: "border-[#D6B892] bg-[#F8E9D8] text-[#6A4A2D]",
      checkoutWallet: "border-stone-200/60 bg-white/95 p-2",
      checkoutLink: "border-stone-300/55 bg-white/65 text-[#2E221A] hover:bg-white",
      calendar: "bg-[#7D5C3A] text-white hover:bg-[#6a4d31]",
      checkoutOrbA: "bg-[#e8b88a]/30",
      checkoutOrbB: "bg-[#d9a774]/25",
      priceText: "text-[1.58rem] sm:text-[1.8rem] font-bold tracking-[-0.03em] font-['SF_Pro_Display','Segoe_UI','Inter','system-ui',sans-serif]",
      priceFx: "text-[#7a4f30] drop-shadow-[0_10px_22px_rgba(127,85,54,0.3)]",
      pricePill: "border-[#ceb79f] bg-[#fff8ef] text-[#715944]",
      ghostBtn: "border-[#d8c4af] bg-[#fff9f2] text-[#5f4d3a] hover:bg-[#fff2e4]",
    },
    "pastel-colorful": {
      isDark: false,
      page: "bg-[#eef2ff] text-[#2D3142]",
      pageAura: "from-[#bdd7ff] via-[#ffe2ec] to-[#cef3e7]",
      pageLightFx: "[background:radial-gradient(circle_at_14%_14%,rgba(137,167,255,0.45),transparent_40%),radial-gradient(circle_at_86%_80%,rgba(255,162,198,0.35),transparent_36%),radial-gradient(circle_at_56%_48%,rgba(129,223,187,0.3),transparent_44%)]",
      glowBlend: "mix-blend-multiply",
      motionPreset: "playful",
      shell: "bg-white/72 border border-[#d7deef] backdrop-blur-[24px] shadow-[0_28px_90px_-42px_rgba(25,33,52,0.28)]",
      heading: "text-[#2D3142]",
      headingFx: "drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]",
      titleGradient: "from-[#2d3142] via-[#5f6dd8] to-[#f18fb7]",
      subtitleGradient: "from-[#667196] via-[#7f8de6] to-[#d487b5]",
      tiny: "text-[#677189]",
      accent: "text-[#5a72cd]",
      selected: "bg-white/75 border-[#95A8E8]/55 shadow-[0_20px_38px_-24px_rgba(104,131,216,0.35)]",
      plain: "bg-white/55 border-neutral-200/60",
      sectionChip: "bg-white/86 border-[#d4ddef] text-[#6a7692] hover:border-[#8ca4e8]",
      sectionChipActive: "bg-[#eef1ff] border-[#8ca4e8] text-[#4b63bb] shadow-[0_14px_28px_-20px_rgba(97,125,214,0.55)]",
      sectionFocus: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea5ea]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-white/70",
      sectionTag: "bg-white/88 border-[#d5deef] text-[#6a7693] hover:bg-white hover:border-[#8ea6ea]",
      sectionTagActive: "bg-[#e9edff] border-[#89a1e8] text-[#4a63b9] shadow-[0_10px_22px_-16px_rgba(97,125,214,0.62)]",
      sectionTagAll: "bg-transparent border-transparent text-[#818ca8] hover:text-[#566287]",
      hoverBorder: "hover:border-[#95A8E8]/60",
      progressDone: "bg-[#6883D8]",
      progressCurrent: "bg-[#6883D8]/65",
      progressPending: "bg-neutral-200",
      progressShell: "bg-white/72 border-[#d6deee] shadow-[0_18px_36px_-22px_rgba(66,83,132,0.26)]",
      progressTrack: "bg-[#d7deef]",
      progressFill: "bg-gradient-to-r from-[#617dd6] to-[#ef95ba]",
      progressStepDone: "bg-[#edf1ff] text-[#546dc2] border-[#c5d1f0]",
      progressStepActive: "bg-[#617dd6] text-white border-[#9db1ec] shadow-[0_12px_26px_-16px_rgba(97,125,214,0.62)]",
      progressStepIdle: "bg-white/80 text-[#7a85a0] border-[#d3dced]",
      divider: "bg-neutral-200",
      ctaMain: "bg-[#2D3142] text-white",
      ctaDepth: "shadow-[0_20px_38px_-20px_rgba(45,49,66,0.55),inset_0_1px_0_rgba(255,255,255,0.18)]",
      next: "bg-[#2D3142] text-white hover:bg-[#23293A]",
      nextDisabled: "bg-[#d7deea] text-[#8791a8]",
      label: "text-[#3A3F53]",
      input: "w-full rounded-full bg-white border border-[#D2D2D7] pl-10 pr-4 py-2.5 text-sm text-[#2D3142] placeholder-[#8A91A6] focus:outline-none focus:ring-2 focus:ring-[#8FB1E8]/45 transition-all",
      back: "border border-[#d0dbec] bg-white/78 text-[#4f5c79] hover:bg-white",
      doneTitle: "text-[#2D3142]",
      doneText: "text-[#677189]",
      meta: "text-[#677189]",
      metaHover: "hover:text-[#2D3142]",
      footer: "bg-white/75 backdrop-blur-md border-neutral-200/65",
      footerText: "text-[#2D3142]",
      glowA: "bg-[#9ebdff]/66",
      glowB: "bg-[#ffb8d2]/62",
      glowC: "bg-[#a9e9cf]/58",
      plate: "bg-white/60 border-neutral-200/50",
      cardDepth: "shadow-[0_20px_40px_-24px_rgba(66,83,132,0.34),inset_0_1px_0_rgba(255,255,255,0.78)]",
      line: "border-neutral-200/60",
      skeleton: "bg-white/65 border-neutral-200/70",
      successChip: "bg-emerald-50/90 border-emerald-200 text-emerald-800",
      warningBox: "bg-amber-100/70 border-amber-300/40 text-amber-900",
      errorBox: "bg-rose-100/75 border-rose-300/45 text-rose-900",
      checkout: "bg-white/60 border-neutral-200/60",
      checkoutKicker: "text-[#6C7A97]",
      checkoutTitle: "text-[#2D3142]",
      checkoutAmount: "text-[#2D3142]",
      checkoutBadge: "border-[#B7C4EC] bg-[#EEF2FF] text-[#4E63A8]",
      checkoutWallet: "border-neutral-200/70 bg-white/95 p-2",
      checkoutLink: "border-neutral-300/70 bg-white/70 text-[#2D3142] hover:bg-white",
      calendar: "bg-[#6883D8] text-white hover:bg-[#5673cb]",
      checkoutOrbA: "bg-[#b7c7ff]/35",
      checkoutOrbB: "bg-[#ffc8dc]/30",
      pricePill: "text-[#5f6c8a]",
      priceText: "text-[1.58rem] sm:text-[1.8rem] font-bold tracking-[-0.03em] font-['SF_Pro_Display','Segoe_UI','Inter','system-ui',sans-serif]",
      priceFx: "text-[#4c60be] drop-shadow-[0_10px_22px_rgba(82,102,194,0.3)]",
      ghostBtn: "border-[#cfdaec] bg-white/78 text-[#4f5f80] hover:bg-white",
    },
  }[resolvedTemplate];

  const tactileClass = "transition-all duration-500 ease-[0.16,1,0.3,1] hover:scale-[1.01] active:scale-[0.98]";
  const progressPercent = (step / (STEP_NAMES.length - 1)) * 100;

  return (
    <div className={`relative z-0 min-h-screen w-full overflow-hidden pb-28 font-sans ${templateStyles.page} ${templateStyles.isDark ? "bg-[#000000]" : ""}`}>
      <div className={`pointer-events-none absolute inset-0 z-0 bg-gradient-to-br ${templateStyles.pageAura}`} />
      <div className={`pointer-events-none absolute inset-0 z-[1] ${templateStyles.pageLightFx}`} />
      <div
        aria-hidden
        className={`pointer-events-none absolute top-[-12%] right-[-10%] z-[2] h-[270px] w-[270px] sm:h-[420px] sm:w-[420px] rounded-full blur-[100px] sm:blur-[135px] ${templateStyles.glowA} ${templateStyles.glowBlend}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute bottom-[-12%] left-[-10%] z-[2] h-[260px] w-[260px] sm:h-[400px] sm:w-[400px] rounded-full blur-[100px] sm:blur-[130px] ${templateStyles.glowB} ${templateStyles.glowBlend}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute top-[34%] right-[18%] z-[2] h-[220px] w-[220px] sm:h-[340px] sm:w-[340px] rounded-full blur-[90px] sm:blur-[125px] ${templateStyles.glowC} ${templateStyles.glowBlend}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute top-[58%] left-[22%] z-[2] h-[160px] w-[160px] sm:h-[260px] sm:w-[260px] rounded-full blur-[78px] sm:blur-[110px] ${templateStyles.glowA} ${templateStyles.glowBlend}`}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.10), transparent 52%), radial-gradient(circle at 28% 68%, rgba(255,255,255,0.08), transparent 48%)",
        }}
        animate={{ opacity: [0.12, 0.2, 0.12] }}
        transition={{ duration: 11.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-md md:max-w-xl">
        <div className={`rounded-[32px] p-6 sm:p-10 lg:p-12 h-[min(860px,calc(100dvh-2rem))] sm:h-[min(900px,calc(100dvh-3rem))] flex flex-col ${templateStyles.shell}`}>
          {!done ? (
            <>
              <div className="pb-10">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 flex items-center justify-center shrink-0 overflow-hidden">
                    {shop.logoUrl ? (
                      <Image
                        src={shop.logoUrl}
                        alt={`Logo ${shop.name}`}
                        width={120}
                        height={120}
                        quality={100}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className={`text-sm font-semibold tracking-tight ${templateStyles.accent}`}>K</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <motion.h1
                      className={`text-[1.85rem] sm:text-[2.35rem] md:text-[2.75rem] font-black truncate leading-[0.98] tracking-[-0.035em] ${templateStyles.headingFx} bg-gradient-to-r ${templateStyles.titleGradient} bg-[length:220%_100%] bg-clip-text text-transparent`}
                      animate={{ backgroundPositionX: ["0%", "100%", "0%"] }}
                      transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      {shop.heroTitle || shop.name}
                    </motion.h1>
                    <motion.p
                      className={`text-xs sm:text-sm truncate uppercase tracking-[0.18em] bg-gradient-to-r ${templateStyles.subtitleGradient} bg-[length:200%_100%] bg-clip-text text-transparent`}
                      animate={{ backgroundPositionX: ["0%", "100%", "0%"] }}
                      transition={{ duration: 10.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      {shop.heroSubtitle || "Reserva online"}
                    </motion.p>
                    <div className={`mt-3 relative h-[2px] w-full overflow-hidden rounded-full ${templateStyles.progressTrack}`}>
                      <motion.div
                        className={`absolute left-0 top-0 h-[2px] rounded-full ${templateStyles.progressFill}`}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <motion.div
                          className="absolute inset-0"
                          style={{
                            backgroundImage: "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.92) 50%, transparent 100%)",
                            backgroundSize: "54px 100%",
                            backgroundRepeat: "no-repeat",
                            filter: "drop-shadow(0 0 5px rgba(255,255,255,0.6))",
                          }}
                          animate={{ backgroundPositionX: ["-50px", "calc(100% + 50px)"] }}
                          transition={{ duration: 1.15, repeat: Infinity, ease: "linear" }}
                        />
                      </motion.div>
                    </div>
                  </div>
                </div>

              </div>

              <div className="pt-4 min-h-0 flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    variants={stepReveal}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="h-full overflow-y-auto delicate-scroll pr-1"
                  >
                    {step === 0 && (
                      <div className="space-y-8">
                        <motion.h2 variants={stepItemReveal} className={`text-xl font-medium ${templateStyles.heading} ${templateStyles.headingFx}`}>{`Elegi tu ${serviceWordLower}`}</motion.h2>
                        <motion.div variants={stepItemReveal} className="-mx-1 overflow-x-auto pb-1">
                          <div className="flex items-center gap-2 px-1">
                            {categories.map((category) => {
                              const active = selectedCategory === category;
                              const isAll = category === "Todos";
                              return (
                                <button
                                  type="button"
                                  key={category}
                                  onClick={(e) => {
                                    triggerHaptic(10, e.currentTarget);
                                    setSelectedCategory(category);
                                  }}
                                  className={`min-h-10 rounded-full px-3 text-xs sm:text-sm whitespace-nowrap border transition-all duration-300 ${
                                    isAll
                                      ? (active ? `${templateStyles.sectionTagActive} font-semibold` : templateStyles.sectionTagAll)
                                      : (active ? `${templateStyles.sectionTagActive} font-semibold` : templateStyles.sectionTag)
                                  } ${templateStyles.sectionFocus} active:scale-[0.97] transition-transform duration-150`}
                                >
                                  {category}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>

                        <motion.div variants={stepItemReveal} className="space-y-4">
                          {filteredServices.map((svc) => {
                            const isSelected = selectedService?.id === svc.id;
                            return (
                                <motion.div
                                  key={svc.id}
                                  layout
                                  whileHover={{ y: -2 }}
                                  whileTap={{ scale: 0.995 }}
                                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                className={`overflow-hidden rounded-3xl border transition-all duration-300 ease-[0.16,1,0.3,1] ${templateStyles.cardDepth} ${isSelected ? `${templateStyles.selected} scale-[1.01]` : `${templateStyles.plain} ${templateStyles.plate} ${templateStyles.hoverBorder}`}`}
                                >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    triggerHaptic(15, e.currentTarget);
                                    setSelectedService(svc);
                                  }}
                                  className={`w-full px-6 py-6 text-left ${tactileClass} active:scale-[0.97] transition-transform duration-150`}
                                >
                                  <div className="flex items-center justify-between gap-4">
                                    <div>
                                      <p className={`text-xl font-medium ${templateStyles.heading}`}>{svc.name}</p>
                                      <p className={`mt-1 text-sm ${templateStyles.tiny}`}>{svc.duration_minutes} min</p>
                                    </div>
                                    <p className={`${templateStyles.priceText} ${templateStyles.priceFx} tabular-nums`}>
                                      <span className="mr-1.5 align-top text-[0.72em] font-semibold opacity-85">$</span>
                                      <span className="tracking-[-0.045em]">{svc.price.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                    </p>
                                  </div>
                                </button>
                              </motion.div>
                            );
                          })}
                        </motion.div>
                      </div>
                    )}

                    {step === 1 && (
                      <div className="space-y-5">
                        <motion.h2 variants={stepItemReveal} className={`font-semibold leading-[1.02] ${templateStyles.heading} ${templateStyles.headingFx}`}>{`Elegi tu ${staffWordLower}`}</motion.h2>
                        <button
                          onClick={() => setSelectedStaff(null)}
                          className={`w-full px-6 py-5 rounded-[14px] text-left border ${tactileClass} ${
                            !selectedStaff ? templateStyles.selected : `${templateStyles.plain} ${templateStyles.hoverBorder}`
                          }`}
                        >
                          <div>
                            <p className={`text-lg sm:text-xl font-semibold tracking-tight ${templateStyles.heading}`}>Sin preferencia</p>
                            <p className={`text-[11px] uppercase tracking-[0.16em] mt-1 ${templateStyles.tiny}`}>{`Cualquier ${staffWordLower} disponible`}</p>
                          </div>
                        </button>
                        {staffMembers.map((s) => {
                          const isSelected = selectedStaff?.id === s.id;
                          return (
                            <button
                              key={s.id}
                              onClick={() => setSelectedStaff(s)}
                              className={`w-full px-6 py-5 rounded-[14px] text-left border ${tactileClass} ${
                                isSelected ? templateStyles.selected : `${templateStyles.plain} ${templateStyles.hoverBorder}`
                              }`}
                            >
                              <p className={`text-lg sm:text-xl font-semibold tracking-tight ${templateStyles.heading}`}>{s.name}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {step === 2 && (
                      <div className="space-y-6">
                        <motion.h2 variants={stepItemReveal} className={`font-semibold leading-[1.02] ${templateStyles.heading} ${templateStyles.headingFx}`}>Elegi fecha y horario</motion.h2>

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
                                className={`flex flex-col items-center justify-center gap-1 py-3 rounded-[12px] border min-h-[78px] ${tactileClass} ${
                                  isSelected ? templateStyles.selected : `${templateStyles.plain} ${templateStyles.hoverBorder}`
                                } ${isToday ? "ring-1 ring-blue-400/40" : ""}`}
                              >
                                <span className={`text-[10px] uppercase ${templateStyles.tiny}`}>{dayName}</span>
                                <span className={`text-sm font-semibold ${isSelected ? templateStyles.accent : templateStyles.heading}`}>{dayNum}</span>
                                {isToday && <span className={`text-[8px] font-semibold uppercase ${templateStyles.accent}`}>Hoy</span>}
                              </button>
                            );
                          })}
                        </div>

                        {loadingSlots ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                            {[...Array(8)].map((_, i) => (
                              <div key={i} className={`h-10 rounded-full animate-pulse border ${templateStyles.skeleton}`} />
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
                                      whileHover={{ scale: 1.01 }}
                                      whileTap={{ scale: 0.99 }}
                                      onClick={() => setSelectedSlot(slot)}
                                      className={`h-12 sm:h-14 rounded-full text-base font-medium border ${tactileClass} px-3 ${
                                        isSelected
                                          ? `${templateStyles.selected} ${templateStyles.accent}`
                                          : `${templateStyles.plain} ${templateStyles.heading} ${templateStyles.hoverBorder}`
                                      }`}
                                    >
                                      {formatTimeFromIso(slot.start) || to24HourTimeLabel(slot.time)}
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
                        <motion.h2 variants={stepItemReveal} className={`text-xl font-semibold tracking-tight ${templateStyles.heading} ${templateStyles.headingFx}`}>Tus datos</motion.h2>

                        {error === "slot_taken" ? (
                          <div className={`text-sm px-5 py-4 rounded-2xl border ${templateStyles.warningBox}`}>
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
                          <div className={`text-sm px-4 py-2.5 rounded-full border ${templateStyles.errorBox}`}>{error}</div>
                        ) : null}

                        {isAuthLoading ? (
                            <div className="space-y-2">
                              <div className={`h-14 rounded-2xl animate-pulse border ${templateStyles.skeleton}`} />
                              <div className={`h-11 rounded-full animate-pulse border ${templateStyles.skeleton}`} />
                            </div>
                        ) : isLoggedIn ? (
                          <>
                            <div className={`flex items-center gap-3 rounded-[20px] border px-4 py-3 ${templateStyles.successChip}`}>
                              <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center">
                                <UserRound className="w-4 h-4 text-emerald-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs uppercase tracking-wide text-emerald-600">Sesion activa</p>
                                <p className={`text-sm font-medium truncate ${templateStyles.heading}`}>{user?.name || user?.email || "Cliente"}</p>
                                {user?.email && <p className={`text-xs ${templateStyles.tiny} truncate`}>{user.email}</p>}
                              </div>
                            </div>

                            {requiresManualPhone && (
                              <div>
                                <label className={`block text-sm font-medium mb-1.5 ${templateStyles.label}`}>WhatsApp / Telefono</label>
                                <div className="relative">
                                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                  <input
                                    type="tel"
                                    inputMode="numeric"
                                    autoComplete="tel"
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                    className={templateStyles.input}
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
                              <div className={`h-px flex-1 ${templateStyles.divider}`} />
                              <span className="text-xs uppercase tracking-wide text-zinc-400">OR</span>
                              <div className={`h-px flex-1 ${templateStyles.divider}`} />
                            </div>

                            <div>
                              <label className={`block text-sm font-medium mb-1.5 ${templateStyles.label}`}>Nombre</label>
                              <div className="relative">
                                <UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                  value={customerName}
                                  onChange={(e) => setCustomerName(e.target.value)}
                                  className={templateStyles.input}
                                  placeholder="Tu nombre"
                                />
                              </div>
                            </div>

                            <div>
                              <label className={`block text-sm font-medium mb-1.5 ${templateStyles.label}`}>Email</label>
                              <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                  type="email"
                                  value={customerEmail}
                                  onChange={(e) => setCustomerEmail(e.target.value)}
                                  className={templateStyles.input}
                                  placeholder="tu@email.com"
                                />
                              </div>
                            </div>

                            <div>
                              <label className={`block text-sm font-medium mb-1.5 ${templateStyles.label}`}>WhatsApp / Telefono</label>
                              <div className="relative">
                                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                  type="tel"
                                  inputMode="numeric"
                                  autoComplete="tel"
                                  value={customerPhone}
                                  onChange={(e) => setCustomerPhone(e.target.value)}
                                  className={templateStyles.input}
                                  placeholder="11 1234-5678"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        {paymentPreferenceId && (
                          <div className={`relative overflow-hidden rounded-3xl border p-5 backdrop-blur-[24px] ${templateStyles.checkout}`}>
                            <div className={`pointer-events-none absolute -top-14 -right-12 h-36 w-36 rounded-full blur-2xl ${templateStyles.checkoutOrbA}`} />
                            <div className={`pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full blur-2xl ${templateStyles.checkoutOrbB}`} />

                            <div className="relative space-y-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className={`text-[11px] uppercase tracking-[0.2em] ${templateStyles.checkoutKicker}`}>Checkout seguro</p>
                                  <p className={`mt-1 text-sm font-semibold ${templateStyles.checkoutTitle}`}>{isDepositPayment ? "Sena lista para completar" : "Pago listo para completar"}</p>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${templateStyles.checkoutBadge}`}>
                                  Mercado Pago
                                </span>
                              </div>

                              {chargedAmount !== null && (
                                <div className={`rounded-2xl border px-4 py-3 backdrop-blur-sm ${templateStyles.plain}`}>
                                  <p className={`text-[11px] uppercase tracking-wide ${templateStyles.checkoutKicker}`}>{isDepositPayment ? "Sena online" : "Monto online"}</p>
                                  <p className={`mt-0.5 text-2xl font-semibold leading-none ${templateStyles.checkoutAmount}`}>
                                    ${chargedAmount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                </div>
                              )}

                              {shop.mpPublicKey ? (
                                <div className={`rounded-2xl overflow-hidden border ${templateStyles.checkoutWallet}`}>
                                  <Wallet initialization={{ preferenceId: paymentPreferenceId }} />
                                </div>
                              ) : (
                                <div className="rounded-2xl border border-amber-300/40 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
                                  Falta MP_PUBLIC_KEY en este local. Cargala en Mi Negocio para mostrar el checkout embebido.
                                </div>
                              )}

                              {paymentInitPoint && (
                                <a
                                  href={paymentInitPoint}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-semibold transition-all ${templateStyles.checkoutLink}`}
                                >
                                  Abrir checkout en otra pestana
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
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
                    className={`inline-flex items-center justify-center gap-1 px-4 py-2.5 rounded-full text-sm font-medium transition-colors w-full sm:w-auto ${templateStyles.back}`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Atrás
                  </button>
                )}
                <div className="flex-1" />
                {step < 3 && (
                  <button
                  onClick={() => {
                    if (!canGoNext) return;
                    setStep((s) => s + 1);
                  }}
                  disabled={!canGoNext}
                    className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all w-full sm:w-auto ${
                      canGoNext
                        ? templateStyles.next
                        : `${templateStyles.nextDisabled} cursor-not-allowed`
                    }`}
                  >
                    Continuar
                  </button>
                )}
              </div>

              {(shop.aboutTitle || shop.aboutText) && (
                <div className={`mt-5 rounded-2xl border p-4 ${templateStyles.plain}`}>
                  <p className={`text-sm font-semibold ${templateStyles.heading}`}>{shop.aboutTitle || "Sobre nosotros"}</p>
                  <p className={`mt-1 text-xs leading-relaxed ${templateStyles.tiny}`}>
                    {shop.aboutText || "Tu mensaje de marca aparece aca para reforzar la experiencia del local."}
                  </p>
                </div>
              )}
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
              <h2 className={`text-xl font-semibold mb-2 ${templateStyles.doneTitle}`}>Turno reservado</h2>
              <p className={`text-sm mb-6 ${templateStyles.doneText}`}>Ya quedo todo listo.</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                {googleCalendarUrl && (
                  <a
                    href={googleCalendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${templateStyles.calendar}`}
                  >
                    Agregar a Calendar
                  </a>
                )}
                <button
                  onClick={handleReset}
                  className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all border ${templateStyles.ghostBtn}`}
                >
                  Nueva reserva
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {!done && (
          <div className={`mt-4 flex flex-wrap items-center justify-center gap-4 text-xs ${templateStyles.meta}`}>
            {shop.address && (
              <a
                href={`https://www.google.com/maps/search/${encodeURIComponent(shop.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 transition-colors ${templateStyles.metaHover}`}
              >
                <MapPin className="w-3 h-3" /> {shop.address}
              </a>
            )}
            {shop.phone && (
              <a
                href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`}
                className={`flex items-center gap-1 transition-colors ${templateStyles.metaHover}`}
              >
                <Phone className="w-3 h-3" /> {shop.phone}
              </a>
            )}
            {shop.instagramUrl && (
              <a
                href={shop.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 transition-colors ${templateStyles.metaHover}`}
              >
                <ExternalLink className="w-3 h-3" /> Instagram
              </a>
            )}
          </div>
        )}
        </div>
      </div>

      {!done && step === 3 && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className={`mx-2 mb-2 rounded-2xl border px-4 py-3 ${templateStyles.footer}`}>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className={`text-xs sm:text-sm min-w-0 flex-1 ${templateStyles.footerText}`}>
                <p className="truncate"><span className={templateStyles.tiny}>{`${serviceWord}:`}</span> {summaryService}</p>
                <p className="truncate"><span className={templateStyles.tiny}>Fecha:</span> {summaryDate}</p>
                <p className="truncate"><span className={templateStyles.tiny}>Hora:</span> {summaryTime}</p>
                {chargedAmount !== null && (
                  <p className="truncate"><span className={templateStyles.tiny}>{isDepositPayment ? "Seña online:" : "Pago online:"}</span> ${chargedAmount.toFixed(2)}</p>
                )}
              </div>

              <button
                onClick={(e) => {
                  triggerHaptic(20, e.currentTarget);
                  handleConfirm();
                }}
                disabled={step !== 3 || submitting || creatingPreference || !canGoNext || !!paymentPreferenceId}
                className={`relative overflow-hidden inline-flex justify-center items-center gap-2 px-5 py-3 rounded-full text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto ${templateStyles.ctaMain} ${templateStyles.ctaDepth} ${tactileClass} active:scale-[0.97] transition-transform duration-150`}
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
