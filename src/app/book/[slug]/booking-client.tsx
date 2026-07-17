"use client";

import { useEffect, useMemo, useState, memo, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Landmark,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Sparkles,
  UserRound,
} from "lucide-react";
import { initMercadoPago } from "@mercadopago/sdk-react";
import { fetchPublicAvailableSlots, createPublicAppointment, createPublicComboAppointment, deletePublicAppointment } from "@/lib/dashboard/booking/public-booking-actions";
import { fetchShopDateOverrides } from "@/lib/dashboard/shop/business-actions";
import { createPendingBooking, deletePendingBooking } from "@/lib/dashboard/appointments/pending-booking-actions";
import GoogleSignInButton from "@/components/auth/google-sign-in-button";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { resolveTemplate } from "./booking-themes";
import { toArgentinaLocalIsoString } from "@/lib/argentina-time";
import { InstagramIcon, WhatsappIcon } from "./booking-icons";
import type { Industry } from "@/lib/industry/types";
import type { BookingTemplateId } from "@/lib/booking/theme-presets";

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import {
  type Service,
  type StaffMember,
  type Slot,
  type Combo,
  stepReveal,
  stepItemReveal,
  triggerHaptic,
  getMonthDays,
  MONTH_NAMES,
  DAY_NAMES,
  formatDate,
  formatDisplayDate,
  parseHHmmToMinutes,
  to24HourTimeLabel,
  formatTimeFromIso,
} from "./booking-utils";
import { getArgentinaDateString, getArgentinaMinutesSinceMidnight } from "@/lib/argentina-time";

interface BookingClientProps {
  shop: {
    id: string;
    name: string;
    description: string;
    address: string;
    city: string;
    phone: string;
    instagramUrl: string;
    slug: string;
    industry: Industry;
    mpPublicKey: string;
    payAtShop: boolean;
    bankTransferEnabled: boolean;
    bookingDepositEnabled: boolean;
    bookingDepositAmount: number;
    bankCvuCb: string;
    bankAlias: string;
    bankName: string;
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
  servicesError?: string | null;
  combos: Combo[];
  combosError?: string | null;
  staffMembers: StaffMember[];
  staffServicesMap: Record<string, string[]>;
}

function pushCard3D(e: React.PointerEvent<HTMLDivElement | HTMLButtonElement>) {
  const card = e.currentTarget;
  const rect = card.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
  const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  card.style.transform = `perspective(800px) rotateX(${-y * 14}deg) rotateY(${x * 14}deg) scale(0.97)`;
  card.style.transition = 'transform 0.08s cubic-bezier(0.16,1,0.3,1)';
}

function releaseCard3D(e: React.PointerEvent<HTMLDivElement | HTMLButtonElement>) {
  const card = e.currentTarget;
  card.style.transform = '';
  card.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1)';
}

const BookingClient = memo(function BookingClient({ shop, services, servicesError, combos, combosError, staffMembers, staffServicesMap }: BookingClientProps) {
  const { user, isLoading: isAuthLoading } = useAuth();

  const [step, setStep] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const isTrigger = !!(target as Element)?.closest('[data-info-trigger]');
      const isContent = !!(target as Element)?.closest('[data-info-content]');
      if (!isTrigger && !isContent) {
        setShowInfo(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    for (const s of staffMembers) {
      if (s.photo_url) {
        const img = new window.Image();
        img.src = s.photo_url;
      }
    }
  }, [staffMembers]);

  const categoryRef = useCallback((el: HTMLDivElement | null) => {
    categoryScrollRef.current = el;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedCombo, setSelectedCombo] = useState<Combo | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const fetchedDatesRef = useRef(new Set<string>());
  const pendingDateRef = useRef<string | null>(null);
  const [monthOverrides, setMonthOverrides] = useState<Record<string, { is_closed: boolean; start_time: string | null; end_time: string | null }>>({});

  const [atBottom, setAtBottom] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [nameError, setNameError] = useState("");

  const needsPayment = useMemo(() => {
    if (!shop.payAtShop) {
      if (selectedCombo) return selectedCombo.services.some((s) => !s.pay_at_shop);
      return !(selectedService?.pay_at_shop ?? false);
    }
    return false;
  }, [shop.payAtShop, selectedService?.pay_at_shop, selectedCombo]);

  const [submitting, setSubmitting] = useState(false);
  const [creatingPreference, setCreatingPreference] = useState(false);

  const scrollRAF = useRef(0);
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    cancelAnimationFrame(scrollRAF.current);
    scrollRAF.current = requestAnimationFrame(() => {
      const el = e.currentTarget;
      if (!el) return;
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= 1);
    });
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector('.delicate-scroll');
      if (el) setAtBottom(el.scrollHeight - el.clientHeight <= 1);
    });
    return () => cancelAnimationFrame(raf);
  }, [step, services, staffMembers]);
  const [paymentPreferenceId, setPaymentPreferenceId] = useState<string | null>(null);
  const [paymentInitPoint, setPaymentInitPoint] = useState<string | null>(null);
  const [chargedAmount, setChargedAmount] = useState<number | null>(null);
  const [isDepositPayment, setIsDepositPayment] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"mp" | "bank_transfer" | null>(null);
  const selectedPaymentMethodRef = useRef<"mp" | "bank_transfer" | null>(null);
  useEffect(() => { selectedPaymentMethodRef.current = selectedPaymentMethod; }, [selectedPaymentMethod]);
  const [bankTransferDetails, setBankTransferDetails] = useState<{ cvuCb: string; alias: string; bankName: string } | null>(null);
  const [bankTransferWhatsAppMessage, setBankTransferWhatsAppMessage] = useState<string | null>(null);

  const recaptchaLoadedRef = useRef(false);
  const pendingAppointmentIdsRef = useRef<string[]>([]);
  const slotsRef = useRef<HTMLDivElement>(null);
  const stepsScrollRef = useRef<HTMLDivElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [mpReady, setMpReady] = useState(false);



  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [ripplePositions, setRipplePositions] = useState<Record<string, { x: number; y: number; size: number }>>({});
  const industryConfig = INDUSTRY_CONFIG[shop.industry] || INDUSTRY_CONFIG.peluqueria;
  const serviceWord = industryConfig.labels.serviceSingular;
  const staffWord = industryConfig.labels.staffSingular;
  const serviceWordLower = serviceWord.toLowerCase();
  const staffWordLower = staffWord.toLowerCase();

  const stepTitles = useMemo(() => [
    `Elegí tu ${serviceWordLower}`,
    `Elegí tu ${staffWordLower}`,
    "Elegí fecha y horario",
    "Tus datos",
    "Pago",
  ], [serviceWordLower, staffWordLower]);

  const todayDate = useMemo(() => {
    const todayStr = getArgentinaDateString();
    return new Date(`${todayStr}T00:00:00-03:00`);
  }, []);

  const [viewYear, setViewYear] = useState(() => todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => todayDate.getMonth());

  const monthDays = useMemo(() => {
    const raw = getMonthDays(viewYear, viewMonth);
    return raw.map((d) => {
      if (!d) return null;
      const c = new Date(d);
      c.setHours(0, 0, 0, 0);
      return c.getTime() < todayDate.getTime() ? null : d;
    });
  }, [viewYear, viewMonth, todayDate]);

  const maxMonthIndex = (todayDate.getFullYear()) * 12 + todayDate.getMonth() + 2;
  const currentViewIndex = viewYear * 12 + viewMonth;
  const canNavNext = currentViewIndex < maxMonthIndex;
  const canNavPrev = currentViewIndex > todayDate.getFullYear() * 12 + todayDate.getMonth();

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
    if (combos.length > 0) merged.push("Combos");
    return ["Todos", ...merged];
  }, [services, shop.sectionOrder, combos]);

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

  const availableStaff = useMemo(() => {
    if (selectedCombo) {
      const comboServiceIds = selectedCombo.services.map((svc) => svc.id);
      return staffMembers.filter((s) => {
        const myIds = staffServicesMap[s.id];
        return myIds && comboServiceIds.every((cid) => myIds.includes(cid));
      });
    }
    if (selectedService) {
      return staffMembers.filter((s) => {
        const myIds = staffServicesMap[s.id];
        return myIds && myIds.includes(selectedService.id);
      });
    }
    return staffMembers;
  }, [staffMembers, staffServicesMap, selectedService, selectedCombo]);

  useEffect(() => {
    if (selectedStaff && !availableStaff.find((s) => s.id === selectedStaff.id)) {
      setSelectedStaff(null);
    }
  }, [availableStaff, selectedStaff]);

  const autoSkippedRef = useRef(false);
  useEffect(() => {
    if (autoSkippedRef.current) return;
    if (step === 0 && services.length <= 1 && combos.length === 0) {
      autoSkippedRef.current = true;
      if (services.length === 1) setSelectedService(services[0]);
      setStep(1);
    }
  }, [step, services, combos]);
  useEffect(() => {
    if (!autoSkippedRef.current || step !== 1) return;
    if (availableStaff.length <= 1) {
      if (availableStaff.length === 1) setSelectedStaff(availableStaff[0]);
      setStep(2);
    }
  }, [step, availableStaff]);

  useEffect(() => {
    const publicKey = shop.mpPublicKey || process.env.NEXT_PUBLIC_MP_PUBLIC_KEY || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (!publicKey) { setMpReady(false); return; }
    setMpReady(false);
    (async () => {
      try {
        await initMercadoPago(publicKey, { locale: "es-AR" });
        setMpReady(true);
      } catch {
        setMpReady(false);
      }
    })();
  }, [shop.mpPublicKey]);

  useEffect(() => {
    if (!selectedService && !selectedCombo) return;
    if (!selectedDate || fetchedDatesRef.current.has(formatDate(selectedDate))) return;

    setLoadingSlots(true);
    setSelectedSlot(null);
    const dateStr = formatDate(selectedDate);
    const slotDuration = selectedCombo
      ? (selectedCombo.duration_minutes ?? selectedCombo.total_duration)
      : (selectedService?.duration_minutes ?? 60);

    (async () => {
      try {
        const result = await fetchPublicAvailableSlots(shop.id, slotDuration, dateStr, selectedStaff?.id);
        if (pendingDateRef.current !== dateStr) return;
        if (!result.success) {
          setSlotsError(result.error);
          setAvailableSlots([]);
        } else {
          setSlotsError(null);
          setAvailableSlots(
            (result.data ?? []).map((slot) => ({
              ...slot,
              time: to24HourTimeLabel(slot.time),
            }))
          );
        }
      } catch (e) {
        if (pendingDateRef.current !== dateStr) return;
        console.error("[BookingClient] fetch slots error:", e);
        setSlotsError("Error al cargar horarios disponibles");
        setAvailableSlots([]);
      } finally {
        if (pendingDateRef.current === dateStr) {
          setLoadingSlots(false);
          fetchedDatesRef.current = new Set(fetchedDatesRef.current).add(dateStr);
        }
      }
    })();
  }, [selectedService, selectedCombo, selectedDate, selectedStaff, shop.id]);

  const prevLoadingSlots = useRef<boolean | null>(null);

  useEffect(() => {
    if (!selectedDate) return;
    if (prevLoadingSlots.current === true && !loadingSlots) {
      requestAnimationFrame(() => {
        if (stepsScrollRef.current && slotsRef.current) {
          const top = slotsRef.current.offsetTop;
          stepsScrollRef.current.scrollTo({ top, behavior: "smooth" });
        }
      });
    }
    prevLoadingSlots.current = loadingSlots;
  }, [loadingSlots, selectedDate]);

  useEffect(() => {
    pendingDateRef.current = null;
    fetchedDatesRef.current = new Set();
    setAvailableSlots([]);
    setSlotsError(null);
    setSelectedSlot(null);
    setSelectedDate(null);
  }, [selectedService, selectedCombo, selectedStaff]);

  useEffect(() => {
    const startDate = formatDate(new Date(viewYear, viewMonth, 1));
    const endDate = formatDate(new Date(viewYear, viewMonth + 1, 0));
    (async () => {
      const result = await fetchShopDateOverrides(shop.id, startDate, endDate);
      if (result.success && result.data) {
        const map: Record<string, { is_closed: boolean; start_time: string | null; end_time: string | null }> = {};
        for (const o of result.data) {
          if (o.staff_id === null) {
            map[o.date] = { is_closed: o.is_closed, start_time: o.start_time, end_time: o.end_time };
          }
        }
        setMonthOverrides(map);
      }
    })();
  }, [viewYear, viewMonth, shop.id]);

  const populatedFromSession = useRef(false);

  useEffect(() => {
    if (!isLoggedIn || !user || populatedFromSession.current) return;
    populatedFromSession.current = true;
    setCustomerEmail(user.email?.trim() || "");
    setCustomerPhone(user.phone?.trim() || "");
  }, [isLoggedIn, user]);

  useEffect(() => {
    const siteKey = RECAPTCHA_SITE_KEY;
    if (!siteKey || recaptchaLoadedRef.current) return;
    recaptchaLoadedRef.current = true;
    import("@/lib/recaptcha").then(({ loadRecaptchaScript }) => loadRecaptchaScript(siteKey));
  }, []);

  useEffect(() => {
    const timeouts = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const onScroll = (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      el.classList.add("scrolling");
      const existing = timeouts.get(el);
      if (existing) clearTimeout(existing);
      timeouts.set(el, setTimeout(() => el.classList.remove("scrolling"), 800));
    };
    function attach(el: HTMLElement) {
      if (el.classList.contains("delicate-scroll") && !el.dataset.delicateAttached) {
        el.addEventListener("scroll", onScroll, { passive: true });
        el.dataset.delicateAttached = "true";
      }
    }
    function detach(el: HTMLElement) {
      el.removeEventListener("scroll", onScroll);
      delete el.dataset.delicateAttached;
      const t = timeouts.get(el);
      if (t) { clearTimeout(t); timeouts.delete(el); }
    }
    document.querySelectorAll<HTMLElement>(".delicate-scroll").forEach((el) => attach(el));
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.classList?.contains("delicate-scroll")) attach(node);
            node.querySelectorAll<HTMLElement>(".delicate-scroll").forEach((el) => attach(el));
          }
        }
        for (const node of mutation.removedNodes) {
          if (node instanceof HTMLElement) {
            if (node.dataset?.delicateAttached) detach(node);
            node.querySelectorAll<HTMLElement>("[data-delicate-attached]").forEach((el) => detach(el));
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelectorAll<HTMLElement>("[data-delicate-attached]").forEach((el) => detach(el));
    };
  }, []);

  function getRippleRect(el: HTMLElement): { left: number; top: number; width: number; height: number } {
    const container = el.closest(".overflow-hidden") ?? el.parentElement;
    return container?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
  }

  const googleCalendarUrl = useMemo(() => {
    if (!selectedSlot || (!selectedService && !selectedCombo)) return null;
    const toGoogleDate = (iso: string) => {
      const local = toArgentinaLocalIsoString(iso);
      const yyyy = local.slice(0, 4);
      const mm = local.slice(5, 7);
      const dd = local.slice(8, 10);
      const hh = local.slice(11, 13);
      const min = local.slice(14, 16);
      const ss = "00";
      return `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
    };
    const name = selectedCombo?.name ?? selectedService?.name ?? "Turno";
    const title = `${shop.name} - ${name}`;
    const details = `Turno reservado en ${shop.name}`;
    const location = shop.address || "";
    const dates = `${toGoogleDate(selectedSlot.start)}/${toGoogleDate(selectedSlot.end)}`;
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}&dates=${encodeURIComponent(dates)}`;
  }, [selectedSlot, selectedService, selectedCombo, shop.name, shop.address]);

  const filteredSlots = useMemo(() => {
    if (!selectedDate) return availableSlots;
    const selectedDateStr = formatDate(selectedDate);
    const todayArStr = getArgentinaDateString();
    if (selectedDateStr !== todayArStr) return availableSlots;

    const minMinutes = getArgentinaMinutesSinceMidnight(new Date());
    return availableSlots.filter((slot) => {
      const slotMinutes = getArgentinaMinutesSinceMidnight(slot.start);
      if (Number.isNaN(slotMinutes)) return parseHHmmToMinutes(to24HourTimeLabel(slot.time)) >= minMinutes;
      return slotMinutes >= minMinutes;
    });
  }, [availableSlots, selectedDate]);

  const canGoNext = (() => {
    switch (step) {
      case 0:
        return selectedService !== null || selectedCombo !== null;
      case 1:
        return true;
      case 2:
        return selectedSlot !== null;
      case 3:
        if (isAuthLoading) return false;
        const nameHasTwoWords = customerName.trim().includes(" ");
        if (isLoggedIn) return nameHasTwoWords && (!requiresManualPhone || customerPhone.trim().length > 0);
        return nameHasTwoWords && customerEmail.trim().length > 0 && customerPhone.trim().length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  })();

  function validatePhone(phone: string): string {
    if (!phone.trim()) return "El teléfono es obligatorio";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) return "Ingresá un teléfono argentino válido, ej: 11 1234 5678";
    return "";
  }

  const handlePhoneChange = useCallback((value: string) => {
    setCustomerPhone(value);
    if (phoneError) setPhoneError("");
  }, [phoneError]);

  function validateName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "El nombre es obligatorio";
    if (!trimmed.includes(" ")) return "Ingresá nombre y apellido";
    return "";
  }

  const handleNameChange = useCallback((value: string) => {
    setCustomerName(value);
    if (nameError) setNameError("");
  }, [nameError]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setNameError("");
    setPhoneError("");
  }, []);

  async function handleConfirm() {
    try {
    if ((!selectedService && !selectedCombo) || !selectedSlot || !customerName || !customerPhone) return;
    if (!isLoggedIn && !customerEmail.trim()) return;

    const nameErr = validateName(customerName);
    if (nameErr) {
      setNameError(nameErr);
      return;
    }

    const phoneErr = validatePhone(customerPhone);
    if (phoneErr) {
      setPhoneError(phoneErr);
      return;
    }

    setSubmitting(true);
    setError(null);

    const [{ formatArgentinePhone }] = await Promise.all([
      import("@/lib/validation"),
    ]);
    const formattedPhone = formatArgentinePhone(customerPhone);

    if (!needsPayment && !selectedPaymentMethodRef.current) {
      if (selectedCombo) {
        const result = await createPublicComboAppointment({
          shopId: shop.id,
          comboId: selectedCombo.id,
          comboName: selectedCombo.name,
          comboPrice: selectedCombo.price,
          comboDurationMinutes: selectedCombo.duration_minutes,
          services: selectedCombo.services,
          staffId: selectedStaff?.id,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim() || undefined,
          customerPhone: formattedPhone,
          authenticatedUserId: user?.id,
          startTime: selectedSlot.start,
          status: "scheduled",
        });

        setSubmitting(false);

        if (!result.success) {
          setError(result.error || "No se pudo reservar el turno");
          return;
        }

        setDone(true);
        return;
      }

      if (!selectedService) return;

      const result = await createPublicAppointment({
        shopId: shop.id,
        serviceId: selectedService.id,
        staffId: selectedStaff?.id,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: formattedPhone,
        authenticatedUserId: user?.id,
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
        status: "scheduled",
      });

      setSubmitting(false);

      if (!result.success) {
        setError(result.error || "No se pudo reservar el turno");
        return;
      }

      setDone(true);
      return;
    }

    // Payment flow — for combos, create all appointments via createPublicComboAppointment first, then create preference
    if (selectedCombo) {
      setCreatingPreference(true);

      const { getRecaptchaToken } = await import("@/lib/recaptcha");
      const recaptchaToken = await getRecaptchaToken(RECAPTCHA_SITE_KEY);

      const comboResult = await createPublicComboAppointment({
        shopId: shop.id,
        comboId: selectedCombo.id,
        comboName: selectedCombo.name,
        comboPrice: selectedCombo.price,
        comboDurationMinutes: selectedCombo.duration_minutes,
        services: selectedCombo.services,
        staffId: selectedStaff?.id,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: formattedPhone,
        authenticatedUserId: user?.id,
        startTime: selectedSlot.start,
        status: "pending_payment",
        recaptchaToken: recaptchaToken || undefined,
      });

      if (!comboResult.success) {
        setSubmitting(false);
        setCreatingPreference(false);
        setError(comboResult.error || "No se pudo crear el turno");
        return;
      }
      if (!comboResult.data) {
        setSubmitting(false);
        setCreatingPreference(false);
        setError("No se pudo crear el turno");
        return;
      }

      // Create a payment preference with the total combo price and all appointment IDs
      const { createPaymentPreference } = await import("@/lib/dashboard/booking/public-booking-actions");
      const prefResult = await createPaymentPreference({
        appointmentId: comboResult.data.appointmentIds[0],
        shopId: shop.id,
        shopSlug: shop.slug,
        overridePrice: selectedCombo.price,
        comboAppointmentIds: comboResult.data.appointmentIds,
      });

      setSubmitting(false);
      setCreatingPreference(false);

      if (!prefResult.success) {
        setError(prefResult.error || "No se pudo iniciar el pago");
        return;
      }
      if (!prefResult.data) {
        setError("No se pudo iniciar el pago");
        return;
      }

      pendingAppointmentIdsRef.current = comboResult.data.appointmentIds;
      setPaymentPreferenceId(prefResult.data.preferenceId);
      setPaymentInitPoint(prefResult.data.initPoint);
      setChargedAmount(prefResult.data.chargedAmount ?? null);
      setIsDepositPayment(Boolean(prefResult.data.isDeposit));
      setStep(4);
      return;
    }

    if (!selectedService) return;

    setCreatingPreference(true);

    const { getRecaptchaToken } = await import("@/lib/recaptcha");
    const recaptchaToken = await getRecaptchaToken(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "");

    const bookingResult = await createPendingBooking({
      recaptchaToken: recaptchaToken || undefined,
      shopId: shop.id,
      shopSlug: shop.slug,
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      servicePrice: selectedService.price,
      staffId: selectedStaff?.id,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: formattedPhone,
      authenticatedUserId: user?.id,
      startTime: selectedSlot.start,
      endTime: selectedSlot.end,
      paymentMethod: selectedPaymentMethodRef.current || undefined,
    });

    setSubmitting(false);
    setCreatingPreference(false);

    if (!bookingResult.success || !bookingResult.data) {
      setError(bookingResult.success ? "No se pudo iniciar el pago" : bookingResult.error || "No se pudo iniciar el pago");
      return;
    }

    // Bank transfer: show bank details
    if (bookingResult.data.paymentMethod === "bank_transfer") {
      pendingAppointmentIdsRef.current = [bookingResult.data.bookingId];
      setChargedAmount(bookingResult.data.chargedAmount ?? null);
      setIsDepositPayment(Boolean(bookingResult.data.isDeposit));
      setBankTransferDetails(bookingResult.data.bankDetails || null);
      setBankTransferWhatsAppMessage(bookingResult.data.whatsappMessage || null);
      setSelectedPaymentMethod("bank_transfer");
      setStep(4);
      return;
    }

    // MP: show checkout
    const safePreferenceId = String(bookingResult.data.preferenceId || "").trim();
    if (!safePreferenceId) {
      await deletePendingBooking(bookingResult.data.bookingId, shop.id);
      setError("No se pudo iniciar el checkout");
      return;
    }

    pendingAppointmentIdsRef.current = [bookingResult.data.bookingId];
    setPaymentPreferenceId(safePreferenceId);
    setPaymentInitPoint(bookingResult.data.initPoint);
    setChargedAmount(bookingResult.data.chargedAmount ?? null);
    setIsDepositPayment(Boolean(bookingResult.data.isDeposit));
    setSelectedPaymentMethod("mp");
    setStep(4);
  } catch (e) {
    setSubmitting(false);
    setCreatingPreference(false);
    setError(e instanceof Error ? e.message : "Error inesperado al procesar el turno");
  }
  }

  const handleReset = useCallback(() => {
    autoSkippedRef.current = false;
    setStep(0);
    setSelectedService(null);
    setSelectedCombo(null);
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
    setSelectedPaymentMethod(null);
    setBankTransferDetails(null);
    setBankTransferWhatsAppMessage(null);
    setDone(false);
    setError(null);
    pendingDateRef.current = null;
    fetchedDatesRef.current = new Set();
  }, []);

  const summaryService = selectedCombo?.name || selectedService?.name || "Sin servicio";
  const summaryDate = selectedDate ? formatDisplayDate(selectedDate).replace(/^\w/, (c) => c.toUpperCase()) : "Sin fecha";
  const summaryTime = selectedSlot ? formatTimeFromIso(selectedSlot.start) || to24HourTimeLabel(selectedSlot.time) : "Sin hora";

  const servicePrice = selectedCombo?.price ?? selectedService?.price ?? 0;
  const depositEnabled = shop.bookingDepositEnabled !== false;
  const configuredDeposit = shop.bookingDepositAmount;
  const previewIsDeposit = depositEnabled;
  const previewChargeAmount = depositEnabled
    ? Math.max(1, Math.min(servicePrice, configuredDeposit > 0 ? configuredDeposit : servicePrice))
    : servicePrice;
  const effectiveIsDeposit = isDepositPayment || previewIsDeposit;
  const effectiveChargedAmount = chargedAmount ?? previewChargeAmount;

  const templateStyles = resolveTemplate(shop.templateId);

  function extractHex(className: string): string {
    const m = className.match(/\[(#[\da-fA-F]+)\]/);
    return m?.[1] ?? "#0071E3";
  }

  function lighten(hex: string, amount: number): string {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, (n >> 16) + amount);
    const g = Math.min(255, ((n >> 8) & 0xff) + amount);
    const b = Math.min(255, (n & 0xff) + amount);
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, "0")}`;
  }

  const rippleConfig = useMemo(() => {
    const accent = extractHex(templateStyles.accent);
    return {
      bg: accent,
      text: templateStyles.isDark ? "#000000" : "#ffffff",
    };
  }, [templateStyles.accent, templateStyles.isDark]);

  const rippleWaves = useMemo(() => {
    const accent = extractHex(templateStyles.accent);
    return [lighten(accent, 80), accent];
  }, [templateStyles.accent]);

  const tactileClass = "transition-transform duration-150 hover:scale-[1.01] active:scale-[0.98]";

  const btnEffects = templateStyles.isDark
    ? {
        shimmerGradient: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.12) 25%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.12) 75%, transparent 100%)",
        innerGlow: "from-black/[0.08]",
        pulseRing: ["0 0 0 0 rgba(0,0,0,0.2)", "0 0 0 8px rgba(0,0,0,0)", "0 0 0 0 rgba(0,0,0,0.2)"],
        orbClass: "bg-black/10",
        nextRing: ["inset 0 0 0 0 rgba(0,0,0,0)", "inset 0 0 0 3px rgba(0,0,0,0.12)", "inset 0 0 0 0 rgba(0,0,0,0)"],
      }
    : {
        shimmerGradient: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 25%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.25) 75%, transparent 100%)",
        innerGlow: "from-white/[0.15]",
        pulseRing: ["0 0 0 0 rgba(255,255,255,0.3)", "0 0 0 8px rgba(255,255,255,0)", "0 0 0 0 rgba(255,255,255,0.3)"],
        orbClass: "bg-white/15",
        nextRing: ["inset 0 0 0 0 rgba(255,255,255,0)", "inset 0 0 0 3px rgba(255,255,255,0.2)", "inset 0 0 0 0 rgba(255,255,255,0)"],
      };

  return (
    <>
    <div
      className={`relative z-0 h-dvh w-full overflow-hidden font-sans ${templateStyles.page}`}
    >
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
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[2] opacity-15"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.10), transparent 52%), radial-gradient(circle at 28% 68%, rgba(255,255,255,0.08), transparent 48%)",
        }}
      />
      <div className="relative z-10 flex h-full items-start justify-center p-3 sm:p-6 lg:p-8">
        <div className="w-full max-w-md md:max-w-xl">
        <motion.div
          className={`rounded-[32px] p-4 sm:p-6 lg:p-8 h-[min(860px,calc(100dvh-2rem))] sm:h-[min(900px,calc(100dvh-3rem))] flex flex-col ${templateStyles.shell}`}
          style={(step === 3 || step === 4) && !done ? { height: 'auto' } as React.CSSProperties : undefined}>
          {!done ? (
            <>
              <div className="pb-0 sm:pb-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div
                    data-info-trigger
                    className="h-14 w-14 sm:h-16 sm:w-16 flex items-center justify-center shrink-0 overflow-hidden rounded-2xl cursor-pointer"
                    onClick={() => setShowInfo(v => !v)}
                  >
                    {shop.logoUrl ? (
                      <Image
                        src={shop.logoUrl}
                        alt={`Logo ${shop.name}`}
                        width={120}
                        height={120}
                        sizes="64px"
                        priority
                        className="h-full w-full object-cover rounded-2xl"
                      />
                    ) : (
                      <span className={`text-sm font-semibold tracking-tight ${templateStyles.accent}`}>K</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      data-info-trigger
                      className="truncate cursor-pointer"
                      onClick={() => setShowInfo(v => !v)}
                    >
                      <div
                        className={`text-[1.4rem] sm:text-[1.85rem] md:text-[2.25rem] font-black leading-[1.1] tracking-[-0.035em] truncate ${templateStyles.headingFx} bg-gradient-to-r ${templateStyles.titleGradient} bg-clip-text text-transparent`}
                      >
                        {shop.heroTitle || shop.name}
                      </div>
                    </div>
                    <motion.p
                      className={`text-xs sm:text-sm uppercase tracking-[0.18em] bg-gradient-to-r ${templateStyles.subtitleGradient} bg-[length:200%_100%] bg-clip-text text-transparent`}
                      style={{ willChange: "background-position" }}
                      animate={{ backgroundPositionX: ["0%", "100%", "0%"] }}
                      transition={{ duration: 10.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      {shop.heroSubtitle || "Reserva online"}
                    </motion.p>
                  </div>
                </div>
                <div className="relative flex items-center justify-center pt-3 pb-1">
                  <div className={`absolute inset-x-4 h-[2px] rounded-full ${templateStyles.progressTrack}`} />
                  <motion.div
                    className={`absolute h-[2px] rounded-full origin-center ${templateStyles.progressFill}`}
                    animate={{
                      width: step === 0 ? "20%" : step === 1 ? "40%" : step === 2 ? "60%" : step === 3 ? "80%" : "100%",
                      opacity: step >= 3 ? 1 : 0.8,
                    }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    style={
                      step >= 3
                        ? { boxShadow: "0 0 18px 2px rgba(168,85,247,0.5), 0 0 40px 6px rgba(168,85,247,0.2)" }
                        : {}
                    }
                  >
                    <motion.div
                      className="pointer-events-none absolute inset-0 rounded-full"
                      style={{
                        backgroundImage: step >= 3
                          ? "linear-gradient(100deg, transparent 0%, #f472b6 18%, #fbbf24 36%, #34d399 54%, #60a5fa 72%, transparent 90%)"
                          : "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)",
                        backgroundSize: step >= 3 ? "120px 100%" : "54px 100%",
                        backgroundRepeat: "no-repeat",
                        filter: step >= 3 ? "drop-shadow(0 0 10px rgba(244,114,182,0.6)) drop-shadow(0 0 20px rgba(96,165,250,0.3))" : "drop-shadow(0 0 6px rgba(255,255,255,0.5))",
                        willChange: "background-position",
                      }}
                      animate={{ backgroundPositionX: ["-50px", "calc(100% + 50px)"] }}
                      transition={{ duration: step >= 3 ? 0.6 : 1.15, repeat: Infinity, ease: "linear" }}
                    />
                  </motion.div>
                  <span
                    className={`relative z-10 px-3 py-1 text-[11px] font-semibold whitespace-nowrap rounded-full leading-tight ${templateStyles.checkout}`}
                  >
                    {step >= 0 && step <= 4 ? stepTitles[step] : ""}
                  </span>
                </div>
              </div>

              <div className="pt-0 sm:pt-1 min-h-0 flex-1 relative">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={step}
                    ref={stepsScrollRef}
                    variants={stepReveal}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="h-full flex flex-col"
                    style={{ position: "relative" }}
                  >
                    {step === 0 && (
                      <div className="flex flex-col h-full min-h-0">
                        <div className="flex flex-col min-h-0 max-h-full w-full">
                        <div className="shrink-0">
                          <motion.div
                            variants={stepItemReveal}
                            ref={categoryRef}
                            className="-mx-1 overflow-x-auto pb-1 delicate-scroll"
                          >
                            <div className="flex items-center gap-2 px-1">
                              {categories.map((category) => {
                                const active = selectedCategory === category;
                                const isAll = category === "Todos";
                                const isCombos = category === "Combos";
                                return (
                                  <button
                                    type="button"
                                    key={category}
                                    onClick={(e) => {
                                      triggerHaptic(10, e.currentTarget);
                                      setSelectedCategory(category);
                                    }}
                                    className={`relative min-h-10 rounded-full px-3 text-xs sm:text-sm whitespace-nowrap text-center ${
                                      isAll
                                        ? (active ? "font-semibold" : templateStyles.sectionTagAll)
                                        : (active ? "font-semibold" : templateStyles.sectionTag)
                                    } ${templateStyles.sectionFocus} active:scale-[0.97] transition-transform duration-150 ${isCombos && !active ? templateStyles.heading : ""}`}
                                  >
                                    {active && (
                                      <motion.div
                                        layoutId="category-indicator"
                                        className={`absolute inset-0 rounded-full ${templateStyles.sectionTagActive}`}
                                        transition={{ type: "spring", stiffness: 350, damping: 14, mass: 0.7 }}
                                      />
                                    )}
                                    <span className="relative z-10">
                                      {isCombos ? (
                                        <span className={`bg-gradient-to-r ${templateStyles.titleGradient} bg-clip-text text-transparent bg-[length:200%_100%] font-bold ${templateStyles.headingFx}`}>
                                          {category}
                                        </span>
                                      ) : (
                                        category
                                      )}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        </div>
                        <div className="flex-1 overflow-y-auto overflow-x-hidden delicate-scroll px-1 pt-2 pb-3 [scroll-snap-type:y_proximity]" onScroll={handleScroll}>
                          <motion.div variants={stepItemReveal} className="space-y-3">
                          {servicesError && (
                            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
                              <span className="font-semibold">Error al cargar servicios:</span> {servicesError}
                            </div>
                          )}
                          {combosError && (
                            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
                              <span className="font-semibold">Error al cargar combos:</span> {combosError}
                            </div>
                          )}
                          {selectedCategory === "Combos" ? (
                            combos.map((combo) => {
                              const isSelected = selectedCombo?.id === combo.id;
                              const totalOriginal = combo.services.reduce((s, svc) => s + svc.price, 0);
                              const savings = totalOriginal > combo.price ? totalOriginal - combo.price : 0;
                              const savingsPct = totalOriginal > 0 ? Math.round((savings / totalOriginal) * 100) : 0;
                              return (
                                <motion.div
                                  key={combo.id}
                                  role="option"
                                  aria-selected={isSelected}
                                  onPointerDown={pushCard3D}
                                  onPointerUp={releaseCard3D}
                                  onPointerLeave={releaseCard3D}
                                  className={`w-full rounded-3xl border-2 transition-[transform,box-shadow] duration-200 ${templateStyles.cardDepth} ${isSelected ? `${templateStyles.selected} border-transparent` : `${templateStyles.plain} ${templateStyles.plate} ${templateStyles.hoverBorder}`}`}
                                  style={{ scrollSnapAlign: "start" }}
                                >
                                  <div className="overflow-hidden rounded-3xl relative">
                                    {isSelected && (
                                      ripplePositions[combo.id] ? (
                                      rippleWaves.map((color, i) => (
                                      <motion.span
                                        key={`r-${combo.id}-w${i}`}
                                        initial={{ width: 0, height: 0, left: ripplePositions[combo.id].x, top: ripplePositions[combo.id].y, opacity: 1 }}
                                        animate={{ width: ripplePositions[combo.id].size, height: ripplePositions[combo.id].size, left: ripplePositions[combo.id].x - ripplePositions[combo.id].size / 2, top: ripplePositions[combo.id].y - ripplePositions[combo.id].size / 2, opacity: i < rippleWaves.length - 1 ? 0 : 1 }}
                                        transition={{ duration: 1.5, ease: [0.25, 1, 0.08, 1], delay: i * 0.08, opacity: { duration: 0.5, delay: i * 0.08 + 0.25, ease: "easeInOut" } }}
                                        className="absolute rounded-full pointer-events-none z-0"
                                        style={{ background: color, willChange: "transform" }}
                                      />
                                      ))
                                      ) : (
                                      <span key={`s-${combo.id}`} className="absolute inset-0 pointer-events-none z-0" style={{ background: rippleWaves[rippleWaves.length - 1], willChange: "transform" }} />
                                      )
                                    )}
                                    {isSelected && (
                                      <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: [0, 0.25, 0] }}
                                        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 1.6 }}
                                        className="absolute inset-0 rounded-3xl pointer-events-none z-[2]"
                                        style={{ boxShadow: `inset 0 0 10px 1px ${rippleConfig.text}20, 0 0 10px 1px ${rippleConfig.text}12` } as React.CSSProperties}
                                      />
                                    )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      triggerHaptic(15, e.currentTarget);
                                      const rect = getRippleRect(e.currentTarget);
                                      const size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2.5);
                                       setRipplePositions(prev => ({ ...prev, [combo.id]: { x: e.clientX - rect.left, y: e.clientY - rect.top, size } }));
                                      setSelectedCombo(combo);
                                      setSelectedService(null);
                                    }}
                                    draggable={false}
                                    className={`w-full px-6 py-5 text-left relative z-10 outline-none focus:outline-none focus-visible:outline-none ${tactileClass}`}
                                    style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="min-w-0 flex-1">
                                        <p className={`text-xl font-medium break-words whitespace-normal text-left ${templateStyles.heading}`} style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>{combo.name}</p>
                                        {combo.description && (
                                          <p className={`mt-1 text-xs leading-relaxed ${templateStyles.tiny}`} style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>{combo.description}</p>
                                        )}
                                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                          {combo.services.map((svc) => (
                                            <span
                                              key={svc.id}
                                              className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight ${templateStyles.pricePill}`}
                                              style={isSelected ? { color: rippleConfig.text, borderColor: rippleConfig.text } as React.CSSProperties : undefined}
                                            >
                                              {svc.name}
                                            </span>
                                          ))}
                                        </div>
                                        <p className={`mt-2 text-sm ${templateStyles.tiny}`} style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>
                                          {combo.duration_minutes ?? combo.total_duration} min
                                          {combo.duration_minutes && combo.duration_minutes !== combo.total_duration && (
                                            <span className="ml-1 opacity-60">({combo.total_duration} min reales)</span>
                                          )}
                                        </p>
                                      </div>
                                      <div className="shrink-0 text-right">
                                        {savingsPct > 0 && (
                                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold mb-2 ${templateStyles.successChip}`}
                                            style={isSelected ? { color: rippleConfig.text, borderColor: rippleConfig.text } as React.CSSProperties : undefined}
                                          >
                                            -{savingsPct}%
                                          </span>
                                        )}
                                        <p className={`${templateStyles.priceText} ${templateStyles.priceFx} tabular-nums`} style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>
                                          <span className="mr-1 align-top text-[0.72em] font-semibold opacity-85">$</span>
                                          <span className="tracking-[-0.045em]">{combo.price.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                        </p>
                                        {savings > 0 && (
                                          <p className={`text-[11px] line-through opacity-50 mt-0.5 ${templateStyles.tiny}`} style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>
                                            ${totalOriginal.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                  </div>
                                </motion.div>
                              );
                            })
                          ) : (
                            filteredServices.map((svc) => {
                              const isSelected = selectedService?.id === svc.id;
                              return (
                                <motion.div
                                  key={svc.id}
                                  role="option"
                                  aria-selected={isSelected}
                                  onPointerDown={pushCard3D}
                                  onPointerUp={releaseCard3D}
                                  onPointerLeave={releaseCard3D}
                                  className={`w-full rounded-3xl border-2 transition-[transform,box-shadow] duration-200 ${templateStyles.cardDepth} ${isSelected ? `${templateStyles.selected} border-transparent` : `${templateStyles.plain} ${templateStyles.plate} ${templateStyles.hoverBorder}`}`}
                                  style={{ scrollSnapAlign: "start" }}
                                >
                                  <div className="overflow-hidden rounded-3xl relative">
                                    {isSelected && (
                                      ripplePositions[svc.id] ? (
                                      rippleWaves.map((color, i) => (
                                      <motion.span
                                        key={`r-${svc.id}-w${i}`}
                                        initial={{ width: 0, height: 0, left: ripplePositions[svc.id].x, top: ripplePositions[svc.id].y, opacity: 1 }}
                                        animate={{ width: ripplePositions[svc.id].size, height: ripplePositions[svc.id].size, left: ripplePositions[svc.id].x - ripplePositions[svc.id].size / 2, top: ripplePositions[svc.id].y - ripplePositions[svc.id].size / 2, opacity: i < rippleWaves.length - 1 ? 0 : 1 }}
                                        transition={{ duration: 1.5, ease: [0.25, 1, 0.08, 1], delay: i * 0.08, opacity: { duration: 0.5, delay: i * 0.08 + 0.25, ease: "easeInOut" } }}
                                        className="absolute rounded-full pointer-events-none z-0"
                                        style={{ background: color, willChange: "transform" }}
                                      />
                                      ))
                                      ) : (
                                      <span key={`s-${svc.id}`} className="absolute inset-0 pointer-events-none z-0" style={{ background: rippleWaves[rippleWaves.length - 1], willChange: "transform" }} />
                                      )
                                    )}
                                    {isSelected && (
                                      <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: [0, 0.25, 0] }}
                                        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 1.6 }}
                                        className="absolute inset-0 rounded-3xl pointer-events-none z-[2]"
                                        style={{ boxShadow: `inset 0 0 10px 1px ${rippleConfig.text}20, 0 0 10px 1px ${rippleConfig.text}12` } as React.CSSProperties}
                                      />
                                    )}
                                  <button
                                    type="button"
                                  onClick={(e) => {
                                    triggerHaptic(15, e.currentTarget);
                                    const rect = getRippleRect(e.currentTarget);
                                    const size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2.5);
                                     setRipplePositions(prev => ({ ...prev, [svc.id]: { x: e.clientX - rect.left, y: e.clientY - rect.top, size } }));
                                    setSelectedService(svc);
                                    setSelectedCombo(null);
                                  }}
                                  draggable={false}
                                  className={`w-full px-5 py-4 text-left relative z-10 outline-none focus:outline-none focus-visible:outline-none ${tactileClass}`}
                                  style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                        <p className={`text-lg font-medium break-words whitespace-normal text-left ${templateStyles.heading}`} style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>{svc.name}</p>
                                        {svc.description && (
                                        <p className={`mt-0.5 text-xs leading-relaxed overflow-hidden ${templateStyles.tiny}`} style={{
                                          maxHeight: isSelected ? "300px" : "2.5em",
                                          transition: "max-height 0.5s cubic-bezier(0.16,1,0.3,1)",
                                          willChange: "max-height",
                                          ...(isSelected ? { color: rippleConfig.text } as React.CSSProperties : {}),
                                        } as React.CSSProperties}>{svc.description}</p>
                                        )}
                                      <p className={`mt-0.5 text-sm ${templateStyles.tiny}`} style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>{svc.duration_minutes} min</p>
                                    </div>
                                    <p className={`shrink-0 ${templateStyles.priceText} ${templateStyles.priceFx} tabular-nums`} style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>
                                      <span className="mr-1.5 align-top text-[0.72em] font-semibold opacity-85">$</span>
                                      <span className="tracking-[-0.045em]">{svc.price.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                    </p>
                                  </div>
                                 </button>
                                  </div>
                                </motion.div>
                            );
                          }))}
                        </motion.div>
                        </div>
                        </div>
                      </div>
                    )}

                    {step === 1 && (
                      <div className="flex flex-col h-full min-h-0">
                        <div className="flex flex-col min-h-0 max-h-full w-full">
                        <div className="flex-1 overflow-y-auto overflow-x-hidden delicate-scroll px-1 pt-2 pb-3 [scroll-snap-type:y_proximity]" onScroll={handleScroll}>
                           <div className="space-y-3">
                           <motion.div
                             onPointerDown={pushCard3D}
                             onPointerUp={releaseCard3D}
                             onPointerLeave={releaseCard3D}
                             className={`w-full rounded-[14px] border-2 transition-[transform,box-shadow] duration-200 ${templateStyles.cardDepth} ${!selectedStaff ? `${templateStyles.selected} border-transparent` : `${templateStyles.plain} ${templateStyles.hoverBorder}`}`}
                          >
                          <div className="overflow-hidden rounded-[14px] relative">
                            {!selectedStaff && (
                              ripplePositions["no-preference"] ? (
                              rippleWaves.map((color, i) => (
                              <motion.span
                                key={`r-np-w${i}`}
                                initial={{ width: 0, height: 0, left: ripplePositions["no-preference"].x, top: ripplePositions["no-preference"].y, opacity: 1 }}
                                animate={{ width: ripplePositions["no-preference"].size, height: ripplePositions["no-preference"].size, left: ripplePositions["no-preference"].x - ripplePositions["no-preference"].size / 2, top: ripplePositions["no-preference"].y - ripplePositions["no-preference"].size / 2, opacity: i < rippleWaves.length - 1 ? 0 : 1 }}
                                transition={{ duration: 1.5, ease: [0.25, 1, 0.08, 1], delay: i * 0.08, opacity: { duration: 0.5, delay: i * 0.08 + 0.25, ease: "easeInOut" } }}
                                className="absolute rounded-full pointer-events-none z-0"
                                style={{ background: color, willChange: "transform" }}
                              />
                              ))
                              ) : (
                              <span key="s-np" className="absolute inset-0 pointer-events-none z-0" style={{ background: rippleWaves[rippleWaves.length - 1], willChange: "transform" }} />
                              )
                            )}
                            {!selectedStaff && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0, 0.25, 0] }}
                                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 1.6 }}
                                className="absolute inset-0 rounded-[14px] pointer-events-none z-[2]"
                                style={{ boxShadow: `inset 0 0 10px 1px ${rippleConfig.text}20, 0 0 10px 1px ${rippleConfig.text}12` } as React.CSSProperties}
                              />
                            )}
                          <button
                            onClick={(e) => {
                              triggerHaptic(15, e.currentTarget);
                              const rect = getRippleRect(e.currentTarget);
                              const size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2.5);
                               setRipplePositions(prev => ({ ...prev, "no-preference": { x: e.clientX - rect.left, y: e.clientY - rect.top, size } }));
                              setSelectedStaff(null);
                            }}
draggable={false}
                             className={`w-full px-6 py-6 text-center relative z-10 outline-none focus:outline-none focus-visible:outline-none ${tactileClass}`}
                          >
                          <div className="flex flex-col items-center">
                            <p className={`text-lg sm:text-xl font-semibold tracking-tight ${templateStyles.heading}`} style={!selectedStaff ? { color: rippleConfig.text } as React.CSSProperties : undefined}>Sin preferencia</p>
                            <p className={`text-[11px] uppercase tracking-[0.16em] mt-1 ${templateStyles.tiny}`} style={!selectedStaff ? { color: rippleConfig.text } as React.CSSProperties : undefined}>{`Cualquier ${staffWordLower} disponible`}</p>
                          </div>
                        </button>
                        </div>
                        </motion.div>
                        {availableStaff.map((s) => {
                          const isSelected = selectedStaff?.id === s.id;
                          const initials = s.name.charAt(0).toUpperCase();
                          return (
                            <motion.div
                              key={s.id}
                              onPointerDown={pushCard3D}
                              onPointerUp={releaseCard3D}
                              onPointerLeave={releaseCard3D}
                              className={`rounded-[14px] border-2 transition-[transform,box-shadow] duration-200 ${templateStyles.cardDepth} ${isSelected ? `${templateStyles.selected} border-transparent` : `${templateStyles.plain} ${templateStyles.hoverBorder}`}`}
                            >
                            <div className="overflow-hidden rounded-[14px] relative">
                              {isSelected && (
                                ripplePositions[s.id] ? (
                                rippleWaves.map((color, i) => (
                                <motion.span
                                  key={`r-${s.id}-w${i}`}
                                  initial={{ width: 0, height: 0, left: ripplePositions[s.id].x, top: ripplePositions[s.id].y, opacity: 1 }}
                                  animate={{ width: ripplePositions[s.id].size, height: ripplePositions[s.id].size, left: ripplePositions[s.id].x - ripplePositions[s.id].size / 2, top: ripplePositions[s.id].y - ripplePositions[s.id].size / 2, opacity: i < rippleWaves.length - 1 ? 0 : 1 }}
                                  transition={{ duration: 1.5, ease: [0.25, 1, 0.08, 1], delay: i * 0.08, opacity: { duration: 0.5, delay: i * 0.08 + 0.25, ease: "easeInOut" } }}
                                  className="absolute rounded-full pointer-events-none z-0"
                                  style={{ background: color, willChange: "transform" }}
                                />
                                ))
                                ) : (
                                <span key={`s-${s.id}`} className="absolute inset-0 pointer-events-none z-0" style={{ background: rippleWaves[rippleWaves.length - 1], willChange: "transform" }} />
                                )
                              )}
                              {isSelected && (
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: [0, 0.25, 0] }}
                                  transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 1.6 }}
                                  className="absolute inset-0 rounded-[14px] pointer-events-none z-[2]"
                                  style={{ boxShadow: `inset 0 0 10px 1px ${rippleConfig.text}20, 0 0 10px 1px ${rippleConfig.text}12` } as React.CSSProperties}
                                />
                              )}
                            <button
                              onClick={(e) => {
                                triggerHaptic(15, e.currentTarget);
                                const rect = getRippleRect(e.currentTarget);
                                const size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2.5);
                                setRipplePositions(prev => ({ ...prev, [s.id]: { x: e.clientX - rect.left, y: e.clientY - rect.top, size } }));
                                setSelectedStaff(s);
                              }}
                              draggable={false}
                              className={`w-full px-5 py-6 text-left relative z-10 outline-none focus:outline-none focus-visible:outline-none ${tactileClass}`}
                              style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}
                            >
                              <div className="flex flex-col items-center text-center gap-3">
                                <div className={`w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/30 shadow-xl flex items-center justify-center shrink-0 ${templateStyles.plate}`}>
                                  {s.photo_url ? (
                                    <img src={s.photo_url} alt="" fetchPriority="high" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className={`text-2xl font-bold ${templateStyles.accent}`}>{initials}</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-lg font-semibold tracking-tight ${templateStyles.heading}`} style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>{s.name}</p>
                                  {s.description && (
                                    <p className={`text-xs leading-snug mt-1 line-clamp-2 ${templateStyles.tiny}`} style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>{s.description}</p>
                                  )}
                                  {(s.instagram || s.whatsapp) && (
                                    <div className="flex items-center justify-center gap-3 mt-2">
                                      {s.instagram && (
                                        <span className="text-xs flex items-center gap-1" style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>
                                          <InstagramIcon />
                                          {s.instagram.startsWith("@") ? s.instagram : `@${s.instagram}`}
                                        </span>
                                      )}
                                      {s.whatsapp && (
                                        <span className="text-xs flex items-center gap-1" style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>
                                          <WhatsappIcon />
                                          {s.whatsapp}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                            </div>
                            </motion.div>
                          );
                        })}
                          </div>
                        </div>
                        </div>
                      </div>
                    )}

                    {step === 2 && (
                      <div className="flex flex-col h-full min-h-0">
                        <div className="flex flex-col min-h-0 max-h-full w-full">
                        <div className="shrink-0">
                        <motion.div variants={stepItemReveal} className="flex items-center justify-between">
                           <button
                             type="button"
                             onClick={() => { triggerHaptic(8); pendingDateRef.current = null; setViewMonth((m) => m === 0 ? 11 : m - 1); setViewYear((y) => viewMonth === 0 ? y - 1 : y); setSelectedDate(null); setSelectedSlot(null); fetchedDatesRef.current = new Set(); }}
                             disabled={!canNavPrev}
                             className={`flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-full transition-all duration-200 ${
                               canNavPrev ? `${templateStyles.heading} ${templateStyles.hoverBorder} cursor-pointer` : "opacity-30 cursor-not-allowed"
                             }`}
                           >
                             <ChevronLeft className="w-4 h-4" />
                             <span className="hidden sm:inline">{MONTH_NAMES[viewMonth === 0 ? 11 : viewMonth - 1]}</span>
                           </button>
                           <span className={`text-base font-semibold tracking-tight ${templateStyles.heading}`}>
                             {MONTH_NAMES[viewMonth]} {viewYear}
                           </span>
                           <button
                             type="button"
                             onClick={() => { triggerHaptic(8); pendingDateRef.current = null; setViewMonth((m) => m === 11 ? 0 : m + 1); setViewYear((y) => viewMonth === 11 ? y + 1 : y); setSelectedDate(null); setSelectedSlot(null); fetchedDatesRef.current = new Set(); }}
                             disabled={!canNavNext}
                             className={`flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-full transition-all duration-200 ${
                               canNavNext ? `${templateStyles.heading} ${templateStyles.hoverBorder} cursor-pointer` : "opacity-30 cursor-not-allowed"
                             }`}
                           >
                             <span className="hidden sm:inline">{MONTH_NAMES[viewMonth === 11 ? 0 : viewMonth + 1]}</span>
                             <ChevronRight className="w-4 h-4" />
                           </button>
                        </motion.div>
                        </div>
                        <div className="overflow-y-auto delicate-scroll pb-4 flex-1 min-h-0" onScroll={handleScroll}>
                        <div ref={slotsRef} className="space-y-6">

                        <AnimatePresence mode="wait">
                        <motion.div
                          key={`cal-${viewYear}-${viewMonth}`}
                          variants={stepItemReveal}
                          initial="initial"
                          animate="animate"
                          exit={{ opacity: 0, transition: { duration: 0.12 } }}
                          className="grid grid-cols-7 gap-1"
                        >
                          {DAY_NAMES.map((name) => (
                            <div key={name} className={`text-center text-[10px] uppercase tracking-wider font-semibold pb-3 mb-1 ${templateStyles.tiny}`}>
                              {name}
                            </div>
                          ))}
                          {monthDays.map((d, idx) => {
                            if (!d) return <div key={`empty-${idx}`} />;
                            const dateStr = formatDate(d);
                            const isSelected = selectedDate && formatDate(selectedDate) === dateStr;
                            const isToday = formatDate(d) === formatDate(todayDate);
                            const override = monthOverrides[dateStr];
                            const isClosed = override?.is_closed === true;
                            return (
                              <button
                                key={dateStr}
                                type="button"
                                disabled={isClosed}
                                onClick={isClosed ? undefined : (e) => {
                                  triggerHaptic(10);
                                  pendingDateRef.current = dateStr;
                                  setSelectedDate(d);
                                  setSelectedSlot(null);
                                  fetchedDatesRef.current = new Set();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2);
                                  setRipplePositions(prev => ({ ...prev, [`date-${dateStr}`]: { x: e.clientX - rect.left, y: e.clientY - rect.top, size } }));
                                }}
                                className={`relative flex flex-col items-center justify-center py-3 min-h-[48px] transition-all duration-200 overflow-hidden ${templateStyles.hoverBorder} ${isSelected ? templateStyles.selected : ''} ${isClosed ? 'opacity-40 cursor-not-allowed' : ''}`}
                              >
                                {isSelected && !isClosed && (
                                  ripplePositions[`date-${dateStr}`] ? (
                                  rippleWaves.map((color, i) => (
                                  <motion.span
                                    key={`rd-${dateStr}-w${i}`}
                                    initial={{ width: 0, height: 0, left: ripplePositions[`date-${dateStr}`].x, top: ripplePositions[`date-${dateStr}`].y, opacity: 1 }}
                                    animate={{ width: ripplePositions[`date-${dateStr}`].size, height: ripplePositions[`date-${dateStr}`].size, left: ripplePositions[`date-${dateStr}`].x - ripplePositions[`date-${dateStr}`].size / 2, top: ripplePositions[`date-${dateStr}`].y - ripplePositions[`date-${dateStr}`].size / 2, opacity: i < rippleWaves.length - 1 ? 0 : 1 }}
                                    transition={{ duration: 1.5, ease: [0.25, 1, 0.08, 1], delay: i * 0.08, opacity: { duration: 0.5, delay: i * 0.08 + 0.25, ease: "easeInOut" } }}
                                    className="absolute rounded-full pointer-events-none z-0"
                                    style={{ background: color, willChange: "transform" }}
                                  />
                                  ))
                                  ) : (
                                  <span key={`sd-${dateStr}`} className="absolute inset-0 pointer-events-none z-0" style={{ background: rippleWaves[rippleWaves.length - 1], willChange: "transform" }} />
                                  )
                                )}
                              <span className={`relative text-xs font-semibold ${isSelected ? templateStyles.accent : templateStyles.heading}`} style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>{d.getDate()}</span>
                                {isToday && !isSelected && !isClosed && (
                                  <span className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${templateStyles.accent} opacity-60`} />
                                )}
                                {isClosed && (
                                  <span className={`text-[9px] leading-tight font-medium ${templateStyles.tiny}`}>Cerrado</span>
                                )}
                                {override?.start_time && !isClosed && (
                                  <span className={`text-[8px] leading-tight ${templateStyles.tiny}`}>H. reducido</span>
                                )}
                                {isSelected && !isClosed && (
                                  <motion.span
                                    layoutId="day-selector"
                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                                    style={{ background: rippleConfig.bg }}
                                    transition={{ type: "spring", stiffness: 600, damping: 30 }}
                                  />
                                )}
                              </button>
                            );
                          })}
                        </motion.div>
                        </AnimatePresence>

                        {loadingSlots ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                            {[...Array(8)].map((_, i) => (
                              <div key={i} className={`h-10 rounded-full animate-pulse border ${templateStyles.skeleton}`} />
                            ))}
                          </div>
                        ) : (
                          <AnimatePresence mode="wait" aria-live="polite" aria-atomic="true">
                            {filteredSlots.length > 0 ? (
                              <motion.div
                                key="slots-grid"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="grid grid-cols-4 gap-2"
                              >
                                {filteredSlots.map((slot) => {
                                  const isSelected = selectedSlot?.start === slot.start;
                                  return (
                                    <motion.button
                                      key={slot.start}
                                      onClick={(e) => {
                                        triggerHaptic(10, e.currentTarget);
                                        setSelectedSlot(slot);
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2);
                                        setRipplePositions(prev => ({ ...prev, [`slot-${slot.start}`]: { x: e.clientX - rect.left, y: e.clientY - rect.top, size } }));
                                      }}
                                      draggable={false}
                                      className={`relative overflow-hidden h-9 text-sm font-medium transition-all duration-200 border-b-2 px-1 ${
                                        isSelected
                                          ? `${templateStyles.selected} border-transparent`
                                          : `border-transparent ${templateStyles.heading} ${templateStyles.hoverBorder}`
                                      }`}
                                    >
                                      {isSelected && (
                                        ripplePositions[`slot-${slot.start}`] ? (
                                        rippleWaves.map((color, i) => (
                                        <motion.span
                                          key={`rs-${slot.start}-w${i}`}
                                          initial={{ width: 0, height: 0, left: ripplePositions[`slot-${slot.start}`].x, top: ripplePositions[`slot-${slot.start}`].y, opacity: 1 }}
                                          animate={{ width: ripplePositions[`slot-${slot.start}`].size, height: ripplePositions[`slot-${slot.start}`].size, left: ripplePositions[`slot-${slot.start}`].x - ripplePositions[`slot-${slot.start}`].size / 2, top: ripplePositions[`slot-${slot.start}`].y - ripplePositions[`slot-${slot.start}`].size / 2, opacity: i < rippleWaves.length - 1 ? 0 : 1 }}
                                          transition={{ duration: 1.5, ease: [0.25, 1, 0.08, 1], delay: i * 0.08, opacity: { duration: 0.5, delay: i * 0.08 + 0.25, ease: "easeInOut" } }}
                                          className="absolute rounded-full pointer-events-none z-0"
                                          style={{ background: color, willChange: "transform" }}
                                        />
                                        ))
                                        ) : (
                                        <span key={`ss-${slot.start}`} className="absolute inset-0 pointer-events-none z-0" style={{ background: rippleWaves[rippleWaves.length - 1], willChange: "transform" }} />
                                        )
                                      )}
                                      <span className="relative z-10" style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>
                                        {formatTimeFromIso(slot.start) || to24HourTimeLabel(slot.time)}
                                      </span>
                                    </motion.button>
                                  );
                                })}
                              </motion.div>
                            ) : slotsError ? (
                              <motion.p
                                key="slots-error"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className={`text-sm text-center py-4 ${templateStyles.tiny}`}
                              >
                                {slotsError}
                              </motion.p>
                            ) : (
                              <motion.p
                                key="slots-empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className={`text-sm text-center py-4 ${templateStyles.tiny}`}
                              >
                                {selectedDate
                                  ? "No hay horarios disponibles para este día"
                                  : "Seleccioná una fecha para ver horarios"}
                              </motion.p>
                            )}
                          </AnimatePresence>
                        )}
                        </div>
                        </div>
                        </div>
                        </div>
                    )}

                    {step === 3 && (
                      <div className="flex flex-col h-full min-h-0">
                      <div className="flex-1 overflow-y-auto delicate-scroll pb-4">
                      <div className="space-y-4">

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
                              onClick={() => { setStep(2); setError(null); setSelectedSlot(null); }}
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
                              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${templateStyles.plate}`}>
                                <UserRound className={`w-4 h-4 ${templateStyles.accent}`} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={`text-xs uppercase tracking-wide ${templateStyles.accent}`}>Sesion activa</p>
                                <p className={`text-sm font-medium truncate ${templateStyles.heading}`}>{user?.name || user?.email || "Cliente"}</p>
                                {user?.email && <p className={`text-xs ${templateStyles.tiny} truncate`}>{user.email}</p>}
                              </div>
                              <button
                                onClick={handleLogout}
                                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors cursor-pointer select-none ${templateStyles.back}`}
                                title="Cerrar sesión"
                              >
                                <LogOut className="w-4 h-4" />
                                <span className="text-xs font-medium hidden sm:inline">Salir</span>
                              </button>
                            </div>

                            <div>
                              <label htmlFor="customer-name-auth" className={`block text-sm font-medium mb-1.5 ${templateStyles.label}`}>Nombre</label>
                              <motion.div whileTap={{ scale: 0.99 }} className="relative">
                                <UserRound className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${templateStyles.tiny}`} />
                                <input
                                  id="customer-name-auth"
                                  autoComplete="off"
                                  value={customerName}
                                  onChange={(e) => handleNameChange(e.target.value)}
                                  onBlur={() => setNameError(validateName(customerName))}
                                  className={`${templateStyles.input} ${nameError ? "ring-2 ring-red-500" : ""}`}
                                  placeholder="Nombre y apellido"
                                  autoFocus
                                />
                                {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
                              </motion.div>
                            </div>

                            {requiresManualPhone && (
                              <div>
                                 <label htmlFor="customer-phone-auth" className={`block text-sm font-medium mb-1.5 ${templateStyles.label}`}>WhatsApp / Telefono</label>
                                <motion.div whileTap={{ scale: 0.99 }} className="relative">
                                  <Phone className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${templateStyles.tiny}`} />
                                  <input
                                    id="customer-phone-auth"
                                    type="tel"
                                    inputMode="numeric"
                                    autoComplete="tel"
                                    value={customerPhone}
                                    onChange={(e) => handlePhoneChange(e.target.value)}
                                    onBlur={() => setPhoneError(validatePhone(customerPhone))}
                                    className={`${templateStyles.input} ${phoneError ? "ring-2 ring-red-500" : ""}`}
                                    placeholder="11 1234-5678"
                                  />
                                  {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
                                </motion.div>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <GoogleSignInButton shopSlug={shop.slug} />

                            <div className="flex items-center gap-3">
                              <div className={`h-px flex-1 ${templateStyles.divider}`} />
                              <span className={`text-xs uppercase tracking-wide ${templateStyles.tiny}`}>O</span>
                              <div className={`h-px flex-1 ${templateStyles.divider}`} />
                            </div>

                            <div>
                              <label htmlFor="customer-name" className={`block text-sm font-medium mb-1.5 ${templateStyles.label}`}>Nombre</label>
                              <motion.div whileTap={{ scale: 0.99 }} className="relative">
                                <UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                                <input
                                  id="customer-name"
                                  autoComplete="off"
                                  value={customerName}
                                  onChange={(e) => handleNameChange(e.target.value)}
                                  onBlur={() => setNameError(validateName(customerName))}
                                  className={`${templateStyles.input} ${nameError ? "ring-2 ring-red-500" : ""}`}
                                  placeholder="Nombre y apellido"
                                  autoFocus
                                />
                                {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
                              </motion.div>
                            </div>

                            <div>
                              <label htmlFor="customer-email" className={`block text-sm font-medium mb-1.5 ${templateStyles.label}`}>Email</label>
                              <motion.div whileTap={{ scale: 0.99 }} className="relative">
                                <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${templateStyles.tiny}`} />
                                <input
                                  id="customer-email"
                                  type="email"
                                  value={customerEmail}
                                  onChange={(e) => setCustomerEmail(e.target.value)}
                                  className={templateStyles.input}
                                  placeholder="tu@email.com"
                                />
                              </motion.div>
                            </div>

                            <div>
                              <label htmlFor="customer-phone" className={`block text-sm font-medium mb-1.5 ${templateStyles.label}`}>WhatsApp / Telefono</label>
                              <motion.div whileTap={{ scale: 0.99 }} className="relative">
                                <Phone className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${templateStyles.tiny}`} />
                                <input
                                  id="customer-phone"
                                  type="tel"
                                  inputMode="numeric"
                                  autoComplete="tel"
                                  value={customerPhone}
                                  onChange={(e) => handlePhoneChange(e.target.value)}
                                  onBlur={() => setPhoneError(validatePhone(customerPhone))}
                                  className={`${templateStyles.input} ${phoneError ? "ring-2 ring-red-500" : ""}`}
                                  placeholder="11 1234-5678"
                                />
                                {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
                              </motion.div>
                            </div>
                          </>
                        )}

                      </div>
                      </div>
                      </div>
                    )}

                    {step === 4 && (
                      <div className="flex flex-col h-full min-h-0">
                        <div className="flex-1 overflow-y-auto delicate-scroll pb-4">
                          <div className="space-y-4">

                            {/* Back - animated like steps 1-3 */}
                            <motion.button
                              initial={{ opacity: 0, x: -70, scale: 0.5 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              transition={{ type: "spring", stiffness: 550, damping: 20, mass: 0.7 }}
                              onClick={() => {
                                const ids = pendingAppointmentIdsRef.current;
                                if (ids.length > 0) {
                                  if (selectedCombo) {
                                    Promise.allSettled(ids.map((id) => deletePublicAppointment({ appointmentId: id, shopId: shop.id }).catch(() => {})));
                                  } else {
                                    Promise.allSettled(ids.map((id) => deletePendingBooking(id, shop.id).catch(() => {})));
                                  }
                                }
                                pendingAppointmentIdsRef.current = [];
                                setPaymentPreferenceId(null);
                                setPaymentInitPoint(null);
                                setChargedAmount(null);
                                setBankTransferDetails(null);
                                setBankTransferWhatsAppMessage(null);
                                setSelectedPaymentMethod(null);
                                setError(null);
                                setStep(3);
                              }}
                              whileHover={{ scale: 1.07, x: -3 }}
                              whileTap={{ scale: 0.88 }}
                              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors relative overflow-hidden ${templateStyles.back}`}
                            >
                              <motion.span
                                className="absolute inset-0 rounded-full pointer-events-none"
                                initial={{ opacity: 0.8, scale: 0.6 }}
                                animate={{ opacity: 0, scale: 2.2 }}
                                transition={{ duration: 0.7, delay: 0.04, ease: "easeOut" }}
                                style={{ background: "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)" }}
                              />
                              <motion.span
                                className="absolute inset-0 rounded-full pointer-events-none opacity-30"
                                animate={{
                                  background: [
                                    "radial-gradient(circle at 30% 50%, rgba(255,255,255,0.15), transparent 70%)",
                                    "radial-gradient(circle at 70% 50%, rgba(255,255,255,0.15), transparent 70%)",
                                    "radial-gradient(circle at 30% 50%, rgba(255,255,255,0.15), transparent 70%)",
                                  ],
                                }}
                                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                              />
                              <motion.span
                                className="relative z-10"
                                initial={{ rotate: 180, opacity: 0, scale: 0.3 }}
                                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                                transition={{ type: "spring", stiffness: 500, damping: 14, delay: 0.08 }}
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </motion.span>
                              <motion.span
                                className="relative z-10 overflow-hidden"
                                initial={{ opacity: 0, x: -18, filter: "blur(8px)" }}
                                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                                transition={{ duration: 0.35, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
                              >
                                Atrás
                              </motion.span>
                            </motion.button>

                            {/* Errores */}
                            {(error || nameError || phoneError) && (
                              <div className={`text-sm px-4 py-2.5 rounded-xl border ${templateStyles.errorBox}`}>
                                {error || nameError || phoneError}
                              </div>
                            )}

                            {/* Resumen detallado del pago */}
                            <div className={`rounded-2xl border px-4 py-4 space-y-3 ${templateStyles.checkout} border-white/20 dark:border-white/10`}>
                              <p className={`text-[11px] uppercase tracking-[0.12em] font-semibold ${templateStyles.checkoutKicker}`}>Resumen del turno</p>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`text-xs ${templateStyles.checkoutKicker}`}>Servicio</span>
                                  <span className={`text-sm font-semibold truncate ${templateStyles.checkoutTitle}`}>{summaryService}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`text-xs ${templateStyles.checkoutKicker}`}>Fecha</span>
                                  <span className={`text-sm font-semibold ${templateStyles.checkoutTitle}`}>{summaryDate}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`text-xs ${templateStyles.checkoutKicker}`}>Hora</span>
                                  <span className={`text-sm font-semibold ${templateStyles.checkoutTitle}`}>{summaryTime}</span>
                                </div>
                                {selectedStaff && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className={`text-xs ${templateStyles.checkoutKicker}`}>Profesional</span>
                                    <span className={`text-sm font-semibold ${templateStyles.checkoutTitle}`}>{selectedStaff.name}</span>
                                  </div>
                                )}
                              </div>
                              <div className={`border-t pt-2.5 flex items-center justify-between gap-2 ${templateStyles.checkoutKicker.replace(/text-\S+/, 'border-current')}`}>
                                {effectiveIsDeposit && effectiveChargedAmount < servicePrice ? (
                                  <>
                                    <span className={`text-xs font-semibold ${templateStyles.checkoutKicker}`}>Seña</span>
                                    <span className={`text-lg font-bold tabular-nums ${templateStyles.checkoutAmount}`}>
                                      <span className="mr-1 align-top text-[0.65em] font-semibold opacity-85">$</span>
                                      {effectiveChargedAmount.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      <span className={`text-xs font-normal ml-1.5 opacity-60 ${templateStyles.checkoutKicker}`}>
                                        / ${servicePrice.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      </span>
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className={`text-xs font-semibold ${templateStyles.checkoutKicker}`}>Total</span>
                                    <span className={`text-lg font-bold tabular-nums ${templateStyles.checkoutAmount}`}>
                                      <span className="mr-1 align-top text-[0.65em] font-semibold opacity-85">$</span>
                                      {servicePrice.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Tarjetas de pago */}
                            <p className={`text-base font-semibold ${templateStyles.heading}`}>¿Cómo preferís pagar?</p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-hidden">
                              {/* MP */}
                              <motion.button
                                type="button"
                                onClick={async (e) => {
                                  triggerHaptic(20, e.currentTarget);
                                  if (selectedPaymentMethod === "mp") return;
                                  if (selectedPaymentMethod === "bank_transfer" && pendingAppointmentIdsRef.current.length > 0) {
                                    const ids = pendingAppointmentIdsRef.current;
                                    if (selectedCombo) {
                                      await Promise.allSettled(ids.map((id) => deletePublicAppointment({ appointmentId: id, shopId: shop.id }).catch(() => {})));
                                    } else {
                                      await Promise.allSettled(ids.map((id) => deletePendingBooking(id, shop.id).catch(() => {})));
                                    }
                                    pendingAppointmentIdsRef.current = [];
                                    setBankTransferDetails(null);
                                    setBankTransferWhatsAppMessage(null);
                                    setPaymentPreferenceId(null);
                                    setPaymentInitPoint(null);
                                    setChargedAmount(null);
                                  }
                                  setSelectedPaymentMethod("mp");
                                  setError(null);
                                  if (!paymentPreferenceId && !submitting && !creatingPreference) {
                                    setTimeout(() => handleConfirm(), 50);
                                  }
                                }}
                                whileTap={{ scale: 0.97 }}
                                className={`relative overflow-hidden rounded-2xl p-4 text-left border-2 transition-all duration-200 ${
                                  selectedPaymentMethod === "mp"
                                    ? "border-[#009EE3] shadow-lg shadow-[#009EE3]/15"
                                    : `border-white/20 dark:border-white/10 hover:border-[#009EE3]/40`
                                } ${templateStyles.checkout}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200 ${selectedPaymentMethod === "mp" ? "bg-[#009EE3] shadow-lg shadow-[#009EE3]/25" : "bg-[#009EE3]/15"}`}>
                                    <CreditCard className={`w-5 h-5 ${selectedPaymentMethod === "mp" ? "text-white" : "text-[#009EE3]"}`} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className={`text-sm font-bold ${templateStyles.checkoutTitle}`}>Mercado Pago</p>
                                    <p className={`text-[11px] ${templateStyles.checkoutKicker}`}>Tarjeta, débito o cuenta MP</p>
                                  </div>
                                  {selectedPaymentMethod === "mp" && (
                                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="ml-auto shrink-0">
                                      <Check className="w-5 h-5 text-[#009EE3]" />
                                    </motion.div>
                                  )}
                                </div>
                              </motion.button>

                              {/* Transferencia */}
                              <motion.button
                                type="button"
                                onClick={async (e) => {
                                  triggerHaptic(20, e.currentTarget);
                                  if (selectedPaymentMethod === "bank_transfer") return;
                                  if (selectedPaymentMethod === "mp" && pendingAppointmentIdsRef.current.length > 0) {
                                    const ids = pendingAppointmentIdsRef.current;
                                    if (selectedCombo) {
                                      await Promise.allSettled(ids.map((id) => deletePublicAppointment({ appointmentId: id, shopId: shop.id }).catch(() => {})));
                                    } else {
                                      await Promise.allSettled(ids.map((id) => deletePendingBooking(id, shop.id).catch(() => {})));
                                    }
                                    pendingAppointmentIdsRef.current = [];
                                    setPaymentPreferenceId(null);
                                    setPaymentInitPoint(null);
                                    setChargedAmount(null);
                                  }
                                  setSelectedPaymentMethod("bank_transfer");
                                  setError(null);
                                  if (!bankTransferDetails && !submitting && !creatingPreference) {
                                    setTimeout(() => handleConfirm(), 50);
                                  }
                                }}
                                whileTap={{ scale: 0.97 }}
                                className={`relative overflow-hidden rounded-2xl p-4 text-left border-2 transition-all duration-200 ${
                                  selectedPaymentMethod === "bank_transfer"
                                    ? "border-emerald-500 shadow-lg shadow-emerald-500/15"
                                    : `border-white/20 dark:border-white/10 hover:border-emerald-500/40`
                                } ${templateStyles.checkout}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200 ${selectedPaymentMethod === "bank_transfer" ? "bg-emerald-500 shadow-lg shadow-emerald-500/25" : "bg-emerald-500/15"}`}>
                                    <Landmark className={`w-5 h-5 ${selectedPaymentMethod === "bank_transfer" ? "text-white" : "text-emerald-500"}`} />
                                  </div>
                                  <div className="min-w-0">
                                    <p className={`text-sm font-bold ${templateStyles.checkoutTitle}`}>Transferencia</p>
                                    <p className={`text-[11px] ${templateStyles.checkoutKicker}`}>CVU, CBU o alias bancario</p>
                                  </div>
                                  {selectedPaymentMethod === "bank_transfer" && (
                                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="ml-auto shrink-0">
                                      <Check className="w-5 h-5 text-emerald-500" />
                                    </motion.div>
                                  )}
                                </div>
                              </motion.button>
                            </div>

                            {/* Contenido expandido */}
                            <AnimatePresence mode="wait">
                              {selectedPaymentMethod === "mp" && (
                                <motion.div
                                  key="mp-content"
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                  className="overflow-hidden"
                                >
                                  {(submitting || creatingPreference) ? (
                                    <div className={`rounded-2xl border px-5 py-6 text-center ${templateStyles.checkout} border-white/20 dark:border-white/10`}>
                                      <Loader2 className={`w-6 h-6 animate-spin mx-auto ${templateStyles.accent}`} />
                                      <p className={`text-xs mt-2 ${templateStyles.tiny}`}>Preparando pago...</p>
                                    </div>
                                  ) : shop.mpPublicKey && paymentInitPoint ? (
                                    <motion.a
                                      href={paymentInitPoint}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      className={`relative overflow-hidden flex items-center justify-center gap-2 w-full rounded-2xl px-4 py-4 text-sm font-bold ${templateStyles.checkoutLink}`}
                                    >
                                      <motion.span
                                        className="absolute inset-0 rounded-2xl pointer-events-none block"
                                        animate={{ boxShadow: ["0 0 0 0 rgba(255,255,255,0.3)", "0 0 0 10px rgba(255,255,255,0)", "0 0 0 0 rgba(255,255,255,0.3)"] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                      />
                                      <span className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
                                      <span className="relative z-10 flex items-center justify-center gap-2">
                                        Ir a pagar con Mercado Pago
                                        <ExternalLink className="w-4 h-4" />
                                      </span>
                                    </motion.a>
                                  ) : (
                                    <div className={`rounded-2xl border px-4 py-4 text-center ${templateStyles.checkout} border-white/20 dark:border-white/10`}>
                                      <Loader2 className={`w-4 h-4 animate-spin mx-auto ${templateStyles.accent}`} />
                                      <p className={`text-xs mt-1 ${templateStyles.tiny}`}>Preparando...</p>
                                    </div>
                                  )}
                                </motion.div>
                              )}

                              {selectedPaymentMethod === "bank_transfer" && (
                                <motion.div
                                  key="transfer-content"
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                  className="overflow-hidden"
                                >
                                  {(submitting || creatingPreference) ? (
                                    <div className={`rounded-2xl border px-5 py-6 text-center ${templateStyles.checkout} border-white/20 dark:border-white/10`}>
                                      <Loader2 className={`w-6 h-6 animate-spin mx-auto ${templateStyles.accent}`} />
                                      <p className={`text-xs mt-2 ${templateStyles.tiny}`}>Reservando turno...</p>
                                    </div>
                                  ) : (
                                    <div className={`rounded-2xl border px-4 py-4 space-y-3 ${templateStyles.checkout} border-white/20 dark:border-white/10`}>
                                      <p className={`text-xs leading-relaxed ${templateStyles.checkoutKicker}`}>
                                        Tenés que transferir <span className={`font-bold ${templateStyles.checkoutTitle}`}>${effectiveChargedAmount.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span> al siguiente titular:
                                      </p>
                                      <div className={`rounded-xl px-3 py-2.5 border ${templateStyles.checkoutWallet}`}>
                                        <div className="flex items-baseline gap-2">
                                          <span className={`text-[10px] shrink-0 ${templateStyles.checkoutKicker}`}>Nombre:</span>
                                          <span className={`text-sm font-bold truncate ${templateStyles.checkoutTitle}`}>{bankTransferDetails?.alias || shop.bankAlias || "—"}</span>
                                        </div>
                                        {(bankTransferDetails?.cvuCb || shop.bankCvuCb) && (
                                          <div className="flex items-baseline gap-2 mt-1.5">
                                            <span className={`text-[10px] shrink-0 ${templateStyles.checkoutKicker}`}>Alias/CBU:</span>
                                            <span className={`text-sm font-bold truncate ${templateStyles.checkoutTitle}`}>{bankTransferDetails?.cvuCb || shop.bankCvuCb}</span>
                                          </div>
                                        )}
                                        {(bankTransferDetails?.bankName || shop.bankName) && (
                                          <div className="flex items-baseline gap-2 mt-1.5">
                                            <span className={`text-[10px] shrink-0 ${templateStyles.checkoutKicker}`}>Banco:</span>
                                            <span className={`text-sm font-bold truncate ${templateStyles.checkoutTitle}`}>{bankTransferDetails?.bankName || shop.bankName}</span>
                                          </div>
                                        )}
                                      </div>

                                      {bankTransferWhatsAppMessage ? (
                                        <motion.a
                                          href={`https://wa.me/?text=${encodeURIComponent(bankTransferWhatsAppMessage)}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          whileHover={{ scale: 1.02 }}
                                          whileTap={{ scale: 0.98 }}
                                          className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-bold bg-[#25D366] text-white shadow-lg shadow-[#25D366]/25"
                                        >
                                          <WhatsappIcon className="w-4 h-4" />
                                          Avisar por WhatsApp
                                        </motion.a>
                                      ) : (
                                        <div className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-bold bg-[#25D366]/60 text-white/70">
                                          <WhatsappIcon className="w-4 h-4" />
                                          Avisar por WhatsApp
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
                
              </div>

              <motion.div
                className="pt-4 flex items-center gap-3"
                layout
                transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.8 }}
              >
                <AnimatePresence mode="popLayout">
                  {step > 0 && step !== 4 && (
                    <motion.button
                      key="back"
                      initial={{ opacity: 0, x: -70, scale: 0.5 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -70, scale: 0.5 }}
                      transition={{ type: "spring", stiffness: 550, damping: 20, mass: 0.7 }}
                      onClick={(e) => { triggerHaptic(10, e.currentTarget); setStep((s) => s - 1); }}
                      whileHover={{ scale: 1.07, x: -3 }}
                      whileTap={{ scale: 0.88 }}
                      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors relative overflow-hidden ${templateStyles.back}`}
                    >
                      <motion.span
                        className="absolute inset-0 rounded-full pointer-events-none"
                        initial={{ opacity: 0.8, scale: 0.6 }}
                        animate={{ opacity: 0, scale: 2.2 }}
                        transition={{ duration: 0.7, delay: 0.04, ease: "easeOut" }}
                        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)" }}
                      />
                      <motion.span
                        className="absolute inset-0 rounded-full pointer-events-none opacity-30"
                        animate={{
                          background: [
                            "radial-gradient(circle at 30% 50%, rgba(255,255,255,0.15), transparent 70%)",
                            "radial-gradient(circle at 70% 50%, rgba(255,255,255,0.15), transparent 70%)",
                            "radial-gradient(circle at 30% 50%, rgba(255,255,255,0.15), transparent 70%)",
                          ],
                        }}
                        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                      />
                      <motion.span
                        className="relative z-10"
                        initial={{ rotate: 180, opacity: 0, scale: 0.3 }}
                        animate={{ rotate: 0, opacity: 1, scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 14, delay: 0.08 }}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </motion.span>
                      <motion.span
                        className="relative z-10 overflow-hidden"
                        initial={{ opacity: 0, x: -18, filter: "blur(8px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        transition={{ duration: 0.35, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
                      >
                        Atrás
                      </motion.span>
                    </motion.button>
                  )}
                </AnimatePresence>

                <motion.div layout className="flex-1" transition={{ type: "spring", stiffness: 400, damping: 28 }} />

                {step < 3 && (
                  <motion.button
                    key="continue"
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 26, mass: 0.9 }}
                    onClick={(e) => {
                      if (!canGoNext) return;
                      triggerHaptic(12, e.currentTarget);
                      setStep((s) => s + 1);
                    }}
                    disabled={!canGoNext}
                    whileHover={canGoNext ? { scale: 1.06 } : {}}
                    whileTap={canGoNext ? { scale: 0.9 } : {}}
                    className={`relative overflow-hidden px-6 py-2.5 rounded-full text-sm font-medium ${
                      canGoNext
                        ? templateStyles.next
                        : `${templateStyles.nextDisabled} cursor-not-allowed`
                    } ${step === 0 ? 'flex-1 sm:flex-none' : ''}`}
                  >
                    {/* Ambient background shimmer */}
                    <motion.span
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(255,255,255,0.08) 100%)" }}
                      animate={{ opacity: canGoNext ? [0.3, 0.8, 0.3] : 0.08 }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                    />
                    {/* Sweeping shimmer line */}
                    <motion.span
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{
                        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)",
                        width: "60%",
                      }}
                      animate={{ x: ["-150%", "250%"] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.6 }}
                    />
                    {/* Pulsing outer ring */}
                    {canGoNext && (
                      <motion.span
                        className="absolute -inset-0.5 rounded-full pointer-events-none"
                        animate={{ boxShadow: btnEffects.nextRing }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                    {/* Content */}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <motion.span
                        animate={canGoNext ? { scale: [1, 1.04, 1] } : {}}
                        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        Continuar
                      </motion.span>
                      {canGoNext && (
                        <motion.span
                          animate={{ x: [0, 5, 0] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.3 }}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </motion.span>
                      )}
                    </span>
                  </motion.button>
                )}
              </motion.div>

              {step !== 4 && (shop.aboutTitle || shop.aboutText) && (
                <AnimatePresence>
                  {showInfo && (
                    <motion.div
                      data-info-content
                      initial={{ opacity: 0, y: -8, scaleY: 0.95 }}
                      animate={{ opacity: 1, y: 0, scaleY: 1 }}
                      exit={{ opacity: 0, y: -6, scaleY: 0.95 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="mt-5 origin-top"
                    >
                      <p className={`text-sm font-semibold ${templateStyles.heading}`}>{shop.aboutTitle || "Sobre nosotros"}</p>
                      <p className={`mt-1 text-xs leading-relaxed ${templateStyles.tiny}`}>
                        {shop.aboutText || "Tu mensaje de marca aparece aca para reforzar la experiencia del local."}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
                            <div className={`mt-5 ${step === 4 ? "hidden" : ""} flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs`}>
                {shop.address && (
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(shop.city ? `${shop.address}, ${shop.city}` : shop.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 transition-colors ${templateStyles.meta} ${templateStyles.metaHover}`}
                  >
                    <MapPin className="w-3 h-3" /> <span className="truncate max-w-[180px] sm:max-w-none">{shop.address}</span>
                  </a>
                )}
                {shop.phone && (
                  <a
                    href={`https://wa.me/${shop.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 transition-colors ${templateStyles.meta} ${templateStyles.metaHover}`}
                  >
                    <WhatsappIcon className="w-3 h-3" /> {shop.phone}
                  </a>
                )}
                {shop.instagramUrl && (
                  <a
                    href={shop.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 transition-colors ${templateStyles.meta} ${templateStyles.metaHover}`}
                  >
                    <ExternalLink className="w-3 h-3" /> Instagram
                  </a>
                )}
                <a
                  href="https://klip.com.ar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 transition-colors ${templateStyles.meta} ${templateStyles.metaHover}`}
                >
                  <span className="opacity-50 hidden sm:inline">—</span>
                  <span>powered by</span>
                  <span className="font-bold tracking-wide ml-0.5">KLIP</span>
                </a>
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex flex-col h-full py-6 text-center"
            >
              <div className="flex-1 flex flex-col items-center justify-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
                  className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg mb-6"
                  style={{ background: extractHex(templateStyles.accent) }}
                >
                  <Check className="w-10 h-10 text-white" />
                </motion.div>
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className={`text-xl font-semibold mb-1 ${templateStyles.doneTitle}`}
                >Turno reservado</motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className={`text-sm mb-8 ${templateStyles.doneText}`}
                >Ya quedo todo listo.</motion.p>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="flex flex-col sm:flex-row items-center justify-center gap-3"
                >
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
                </motion.div>
              </div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-auto pt-6"
              >
                <a
                  href="https://klip.com.ar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 text-xs transition-colors ${templateStyles.meta} ${templateStyles.metaHover}`}
                >
                  <span className="opacity-50">—</span>
                  <span>powered by</span>
                  <span className="font-bold tracking-wide">KLIP</span>
                  <span className="opacity-50">—</span>
                </a>
              </motion.div>
            </motion.div>
          )}
        </motion.div>

      </div>
      </div>
      </div>

      <AnimatePresence>
        {!done && step === 3 && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
          className="fixed bottom-0 left-0 right-0 z-40"
        >
          <div className={`mx-2 mb-2 rounded-2xl border px-4 py-3 ${templateStyles.footer}`}>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className={`text-xs sm:text-sm min-w-0 flex-1 ${templateStyles.footerText}`}>
                  <p className="truncate"><span className={templateStyles.tiny}>{`${serviceWord}:`}</span> {summaryService}</p>
                  <p className="truncate"><span className={templateStyles.tiny}>Fecha:</span> {summaryDate}</p>
                  <p className="truncate"><span className={templateStyles.tiny}>Hora:</span> {summaryTime}</p>
                  {effectiveIsDeposit ? (
                    <p className="truncate"><span className={templateStyles.tiny}>Seña online:</span> ${effectiveChargedAmount.toFixed(2)}</p>
                  ) : (
                    <p className="truncate"><span className={templateStyles.tiny}>Pago online:</span> ${servicePrice.toFixed(2)}</p>
                  )}
                </div>

                <div className="relative w-full sm:w-auto flex-shrink-0">
                  {!submitting && !creatingPreference && (
                    <>
                      <motion.span
                        className="absolute -inset-0.5 rounded-full pointer-events-none z-0 block"
                        animate={{ boxShadow: btnEffects.pulseRing }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                      />
                      <motion.span
                        className={`absolute -top-2 -right-1.5 w-3 h-3 rounded-full pointer-events-none z-0 ${btnEffects.orbClass} blur-[2px]`}
                        animate={{ scale: [0.8, 1.6, 0.8], opacity: [0.3, 0.8, 0.3] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                      />
                      <motion.span
                        className={`absolute -bottom-1.5 -left-1.5 w-2.5 h-2.5 rounded-full pointer-events-none z-0 ${btnEffects.orbClass} blur-[2px]`}
                        animate={{ scale: [1, 1.8, 1], opacity: [0.2, 0.6, 0.2] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      />
                    </>
                  )}
                  <motion.button
                    onClick={(e) => {
                      triggerHaptic(20, e.currentTarget);
                      if (shop.bankTransferEnabled) {
                        setStep(4);
                        return;
                      }
                      handleConfirm();
                    }}
                    disabled={submitting || creatingPreference || !canGoNext || !!paymentPreferenceId}
                    draggable={false}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.25, mass: 0.8 }}
                    className={`relative overflow-hidden inline-flex justify-center items-center gap-2 px-5 py-3 rounded-full text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto ${templateStyles.ctaMain} ${templateStyles.ctaDepth} ${tactileClass}`}
                  >
                    <span className="absolute inset-0 -translate-x-full animate-[confirmShimmer_1.5s_infinite] pointer-events-none" style={{ background: btnEffects.shimmerGradient }} />
                    <span className={`absolute inset-0 rounded-full bg-gradient-to-b ${btnEffects.innerGlow} to-transparent pointer-events-none`} />
                    {submitting || creatingPreference ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin relative z-10" />
                        <span className="relative z-10">Procesando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 relative z-10" />
                        <span className="relative z-10">Confirmar turno</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
          </div>
        </motion.div>
        )}
      </AnimatePresence>



      <style jsx global>{`
        @keyframes shimmer {
          100% { transform: translateX(220%); }
        }
        @keyframes confirmShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </>
  );
});

export default BookingClient;
