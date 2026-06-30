"use client";

import { useState, useTransition, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Store, CreditCard, MessageSquareText, Smartphone, Link2, MapPin, Phone, Clock, Share2, AlertTriangle, Trash2, Users, Scissors, ChevronRight, ChevronDown, Calendar, Plus, X } from "lucide-react";
import { TagChips, useTagInsert } from "@/components/ui/tag-chips";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { withDashboardBase } from "@/lib/dashboard/dashboard-base";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import SkinSelector from "@/components/dashboard/skin-selector";
import BookingThemeLivePreview from "@/components/dashboard/booking-theme-live-preview";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import BusinessStatsSection from "@/components/dashboard/business-stats-section";
import ExportDataCard from "@/components/dashboard/export-data-card";
import CreateShopModal from "@/components/dashboard/create-shop-modal";
import CloseShopModal from "@/components/dashboard/close-shop-modal";
import { bulkUpdateServiceCategories } from "@/lib/dashboard/service-actions";
import { createAdditionalShop } from "@/lib/dashboard/auth-actions";
import {
  fetchBusinessData,
  fetchBusinessHours,
  updateBusinessInfo,
  disconnectMercadoPagoOauthAction,
  updateBookingDepositPolicyAction,
  updateWhatsappTemplateAction,
  updateBusinessHours,
  fetchShopDateOverrides,
  upsertShopDateOverride,
  deleteShopDateOverride,
  type BusinessData,
  type BusinessHoursData,
  type DateOverride,
} from "@/lib/dashboard/business-actions";
import { updateVoucherWhatsappTemplate } from "@/lib/dashboard/voucher-actions";
import { DEFAULT_BIRTHDAY_WHATSAPP_TEMPLATE, DEFAULT_VOUCHER_WHATSAPP_TEMPLATE } from "@/lib/dashboard/voucher-constants";
import { deleteCurrentShop } from "@/lib/dashboard/shop-actions";
import {
  upsertBookingTheme,
  uploadBookingLogo,
  type BookingThemeData,
} from "@/lib/dashboard/booking-theme-actions";
import { DEFAULT_BOOKING_TEMPLATE, type BookingTemplateId } from "@/lib/booking/theme-presets";
import { useAuth } from "@/lib/auth-context";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";

type MessageType = { type: "success" | "error"; text: string } | null;
type InitialServiceItem = { id: string; name: string; category?: string | null; price: number; duration_minutes: number; pay_at_shop: boolean };

function getMpReturnScrollKey(shopSlug: string | null): string {
  return `klip-mp-return-scroll:${shopSlug || "default"}`;
}

function getTourSteps(staffPlural: string, servicePlural: string) {
  return [
    { id: "setup-public-info", title: "1. Informacion publica", text: "Completa nombre, descripcion, direccion y telefono de tu local." },
    { id: "setup-hours", title: "2. Horarios de atencion", text: "Defini los dias y horarios para que las reservas muestren disponibilidad real." },
    { id: "setup-payments", title: "3. Formas de cobro", text: "Configura Mercado Pago y la politica de seña para cobrar sin friccion." },
    { id: "setup-staff", title: `4. ${staffPlural}`, text: `Agrega y administra tus ${staffPlural.toLowerCase()} para asignar turnos correctamente.` },
    { id: "setup-services", title: `5. ${servicePlural}`, text: `Carga tu catalogo de ${servicePlural.toLowerCase()} con precio y duracion.` },
  ] as const;
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="group relative inline-flex items-center">
      <span
        className="w-4 h-4 rounded-full bg-zinc-300 dark:bg-zinc-600 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold inline-flex items-center justify-center cursor-help flex-shrink-0"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </span>
      <span className={`absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[calc(100vw-2rem)] sm:max-w-xs p-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs leading-relaxed shadow-lg z-[9999] pointer-events-none transition-opacity text-left whitespace-normal ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        {text}
      </span>
    </span>
  );
}

function TaggedTextarea({
  innerRef,
  value,
  onChange,
  onFocus,
  placeholder,
  disabled,
}: {
  innerRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const renderContent = () => {
    if (!value) {
      return placeholder ? (
        <span className="text-zinc-400 dark:text-zinc-500">{placeholder}</span>
      ) : null;
    }
    return value.split(/(@\w+)/g).map((part, i) => {
      if (part.startsWith("@") && part.length > 1) {
        return (
          <span key={i} className="text-violet-600 dark:text-violet-400">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="relative w-full rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus-within:ring-2 focus-within:ring-violet-500/50 transition-all">
      <div className="px-5 py-[10px] text-sm leading-5 font-sans tracking-normal whitespace-pre-wrap break-words invisible min-h-[5rem]" aria-hidden>
        {value || placeholder || " "}
      </div>
      <div className="absolute inset-0 px-5 py-[10px] text-sm leading-5 font-sans tracking-normal whitespace-pre-wrap break-words pointer-events-none overflow-hidden rounded-2xl" aria-hidden>
        {renderContent()}
      </div>
      <textarea
        ref={innerRef}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        disabled={disabled}
        className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-gray-900 dark:caret-white resize-none overflow-hidden outline-none px-5 py-[10px] text-sm leading-5 font-sans tracking-normal rounded-2xl"
      />
    </div>
  );
}

export default function BusinessClient({
  initialData,
  initialError,
  summaryStats,
  metricStats,
  canManageBilling,
  role = "owner",
  shopSlug,
  shopId,
  initialServices,
  initialBusinessHours,
  initialBookingTheme,
  initialVoucherWhatsappTemplate,
  initialStaff,
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
    growth: number | null;
    topServicesCount: number;
    income: number;
    expenses: number;
  } | null;
  canManageBilling: boolean;
  role?: string;
  shopSlug: string | null;
  shopId: string;
  initialServices: InitialServiceItem[];
  initialBusinessHours: BusinessHoursData | null;
  initialBookingTheme: BookingThemeData | null;
  initialVoucherWhatsappTemplate?: string | null;
  initialStaff: { id: string; name: string }[];
}) {
  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const industryLabels = INDUSTRY_CONFIG[industry].labels;
  const staffWord = industryLabels.staffSingular;
  const staffPlural = industryLabels.staffPlural;
  const serviceWord = industryLabels.serviceSingular;
  const servicePlural = industryLabels.servicePlural;
  const customerWord = industryLabels.customerSingular;
  const customerPlural = industryLabels.customerPlural;
  const isOwnerOrAdmin = role !== "staff";
  const tourSteps = useMemo(() => getTourSteps(staffPlural, servicePlural), [staffPlural, servicePlural]);
  const { playSuccess, playError, playClick } = useKlipSounds();
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [error] = useState(initialError);
  const [isSaving, setIsSaving] = useState(false);
  const [creatingShop, startCreateShopTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);

  const [name, setName] = useState(data?.nombre || "");
  const [address, setAddress] = useState(data?.address || "");
  const [localidad, setLocalidad] = useState(data?.localidad || "");
  const [phone, setPhone] = useState(data?.phone || "");
  const [instagramUrl, setInstagramUrl] = useState(data?.instagram_url || "");
  const [facebookUrl, setFacebookUrl] = useState(data?.facebook_url || "");
  const [tiktokUrl, setTiktokUrl] = useState(data?.tiktok_url || "");
  const initialPublicInfo = useMemo(() => ({
    name: data?.nombre || "",
    address: data?.address || "",
    localidad: data?.localidad || "",
    phone: data?.phone || "",
    instagramUrl: data?.instagram_url || "",
    facebookUrl: data?.facebook_url || "",
    tiktokUrl: data?.tiktok_url || "",
  }), [data?.nombre, data?.address, data?.localidad, data?.phone, data?.instagram_url, data?.facebook_url, data?.tiktok_url]);
  const isPublicInfoDirty = useMemo(() =>
    name !== initialPublicInfo.name ||
    address !== initialPublicInfo.address ||
    localidad !== initialPublicInfo.localidad ||
    phone !== initialPublicInfo.phone ||
    instagramUrl !== initialPublicInfo.instagramUrl ||
    facebookUrl !== initialPublicInfo.facebookUrl ||
    tiktokUrl !== initialPublicInfo.tiktokUrl,
  [name, address, localidad, phone, instagramUrl, facebookUrl, tiktokUrl, initialPublicInfo]);
  const [whatsappTemplate, setWhatsappTemplate] = useState(data?.whatsapp_template || "");
  const whatsappRef = useRef<HTMLTextAreaElement>(null);
  const insertWhatsappTag = useTagInsert(whatsappRef, whatsappTemplate, setWhatsappTemplate);
  const [voucherWhatsappTemplate, setVoucherWhatsappTemplate] = useState(initialVoucherWhatsappTemplate ?? DEFAULT_VOUCHER_WHATSAPP_TEMPLATE);
  const voucherRef = useRef<HTMLTextAreaElement>(null);
  const insertVoucherTag = useTagInsert(voucherRef, voucherWhatsappTemplate, setVoucherWhatsappTemplate);
  const [birthdayWhatsappTemplate, setBirthdayWhatsappTemplate] = useState(DEFAULT_BIRTHDAY_WHATSAPP_TEMPLATE);
  const birthdayRef = useRef<HTMLTextAreaElement>(null);
  const insertBirthdayTag = useTagInsert(birthdayRef, birthdayWhatsappTemplate, setBirthdayWhatsappTemplate);
  const [showStats, setShowStats] = useState(false);
  const [showThemeCard, setShowThemeCard] = useState(false);
  const [bookingDepositEnabled, setBookingDepositEnabled] = useState(data?.booking_deposit_enabled ?? true);
  const [bookingDepositAmount, setBookingDepositAmount] = useState(String(data?.booking_deposit_amount ?? 3000));
  const [payAtShop, setPayAtShop] = useState(data?.pay_at_shop ?? false);
  const [message, setMessage] = useState<MessageType>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHoursData | null>(initialBusinessHours);
  const [tourAdvancing, setTourAdvancing] = useState(false);

  const [overrides, setOverrides] = useState<DateOverride[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [editOverride, setEditOverride] = useState<DateOverride | null>(null);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideStaffId, setOverrideStaffId] = useState<string | null>(null);
  const [overrideIsClosed, setOverrideIsClosed] = useState(true);
  const [overrideStartTime, setOverrideStartTime] = useState("09:00");
  const [overrideEndTime, setOverrideEndTime] = useState("18:00");
  const [overrideReason, setOverrideReason] = useState("");

  const staffList = initialStaff;

  const loadOverrides = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 3);
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    setOverridesLoading(true);
    const res = await fetchShopDateOverrides(shopId, fmt(start), fmt(end));
    if (res.success) setOverrides(res.data ?? []);
    setOverridesLoading(false);
  }, [shopId]);

  useEffect(() => { loadOverrides(); }, [loadOverrides]);

  function openNewOverride() {
    setEditOverride(null);
    setOverrideDate(new Date().toISOString().split("T")[0]);
    setOverrideStaffId(null);
    setOverrideIsClosed(true);
    setOverrideStartTime("09:00");
    setOverrideEndTime("18:00");
    setOverrideReason("");
    setShowOverrideModal(true);
  }

  function openEditOverride(o: DateOverride) {
    setEditOverride(o);
    setOverrideDate(o.date);
    setOverrideStaffId(o.staff_id);
    setOverrideIsClosed(o.is_closed);
    setOverrideStartTime(o.start_time ?? "09:00");
    setOverrideEndTime(o.end_time ?? "18:00");
    setOverrideReason(o.reason ?? "");
    setShowOverrideModal(true);
  }

  async function handleSaveOverride() {
    if (!overrideDate) return;
    const res = await upsertShopDateOverride(
      shopId, overrideDate, overrideStaffId, overrideIsClosed,
      overrideIsClosed ? null : overrideStartTime,
      overrideIsClosed ? null : overrideEndTime,
      overrideReason || null
    );
    if (!res.success) { alert(res.error); return; }
    setShowOverrideModal(false);
    await loadOverrides();
  }

  async function handleDeleteOverride(o: DateOverride) {
    if (!confirm(`¿Eliminar excepción del ${o.date}?`)) return;
    const res = await deleteShopDateOverride(o.id, shopId);
    if (!res.success) { alert(res.error); return; }
    await loadOverrides();
  }
  const [hoursLoading, setHoursLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [closeConfirm, setCloseConfirm] = useState("");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [newShopName, setNewShopName] = useState("");
  const [showCreateShopModal, setShowCreateShopModal] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourRect, setTourRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [mpConnectUnlockAt, setMpConnectUnlockAt] = useState(0);
  const [isConnectingMp, setIsConnectingMp] = useState(false);
  const [isDisconnectingMp, setIsDisconnectingMp] = useState(false);
  const [bookingTheme, setBookingTheme] = useState<BookingThemeData | null>(initialBookingTheme);
  const [selectedTemplateId, setSelectedTemplateId] = useState<BookingTemplateId>(
    initialBookingTheme?.template_id || DEFAULT_BOOKING_TEMPLATE
  );
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>(initialBookingTheme?.logo_url || "");
  const [heroTitle, setHeroTitle] = useState(initialBookingTheme?.hero_title || "");
  const [heroSubtitle, setHeroSubtitle] = useState(initialBookingTheme?.hero_subtitle || "");
  const [aboutTitle, setAboutTitle] = useState(initialBookingTheme?.about_title || "");
  const [aboutText, setAboutText] = useState(initialBookingTheme?.about_text || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [serviceCategoryDraft, setServiceCategoryDraft] = useState<Record<string, string>>(() => {
    if (initialBookingTheme?.section_service_order?.length) {
      const ranked = new Map(initialBookingTheme.section_service_order.map((id, index) => [id, index]));
      const orderedFromTheme = [...initialServices].sort((a, b) => {
        const ai = ranked.get(a.id);
        const bi = ranked.get(b.id);
        if (ai === undefined && bi === undefined) return 0;
        if (ai === undefined) return 1;
        if (bi === undefined) return -1;
        return ai - bi;
      });
      const draft: Record<string, string> = {};
      for (const service of orderedFromTheme) {
        draft[service.id] = (service.category || "General").trim() || "General";
      }
      return draft;
    }
    return Object.fromEntries(initialServices.map((service) => [service.id, (service.category || "General").trim() || "General"]));
  });
  const [sectionCatalog, setSectionCatalog] = useState<string[]>(() => {
    if (initialBookingTheme?.section_order?.length) {
      const fromServices = Array.from(new Set(initialServices.map((service) => (service.category || "General").trim() || "General")));
      const merged = [...initialBookingTheme.section_order, ...fromServices].filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index);
      if (!merged.includes("General")) merged.unshift("General");
      return ["General", ...merged.filter((item) => item !== "General")];
    }
    const unique = Array.from(new Set(initialServices.map((service) => (service.category || "General").trim() || "General")));
    if (!unique.includes("General")) unique.unshift("General");
    return unique;
  });
  const initialSectionCatalogRef = useRef(sectionCatalog);
  const initialCategoryDraftRef = useRef(serviceCategoryDraft);

  const [serviceOrderIds, setServiceOrderIds] = useState<string[]>(() => {
    if (initialBookingTheme?.section_service_order?.length) {
      const ranked = new Map(initialBookingTheme.section_service_order.map((id, index) => [id, index]));
      const orderedFromTheme = [...initialServices].sort((a, b) => {
        const ai = ranked.get(a.id);
        const bi = ranked.get(b.id);
        if (ai === undefined && bi === undefined) return 0;
        if (ai === undefined) return 1;
        if (bi === undefined) return -1;
        return ai - bi;
      });
      return orderedFromTheme.map((service) => service.id);
    }
    return initialServices.map((service) => service.id);
  });

  useEffect(() => {
    setServiceCategoryDraft((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const service of initialServices) {
        if (!(service.id in prev)) {
          next[service.id] = (service.category || "General").trim() || "General";
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setServiceOrderIds((prev) => {
      const existing = new Set(prev);
      const newIds = initialServices.map((s) => s.id).filter((id) => !existing.has(id));
      return newIds.length > 0 ? [...prev, ...newIds] : prev;
    });

    setSectionCatalog((prev) => {
      const fromServices = Array.from(new Set(initialServices.map((s) => (s.category || "General").trim() || "General")));
      const merged = [...prev, ...fromServices].filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index);
      if (!merged.includes("General")) merged.unshift("General");
      return merged;
    });
  }, [initialServices]);

  const isThemeDirty = useMemo(() =>
    heroTitle !== (initialBookingTheme?.hero_title ?? "") ||
    heroSubtitle !== (initialBookingTheme?.hero_subtitle ?? "") ||
    aboutTitle !== (initialBookingTheme?.about_title ?? "") ||
    aboutText !== (initialBookingTheme?.about_text ?? "") ||
    selectedTemplateId !== (initialBookingTheme?.template_id ?? DEFAULT_BOOKING_TEMPLATE) ||
    JSON.stringify(sectionCatalog) !== JSON.stringify(initialSectionCatalogRef.current) ||
    JSON.stringify(serviceCategoryDraft) !== JSON.stringify(initialCategoryDraftRef.current),
  [heroTitle, heroSubtitle, aboutTitle, aboutText, selectedTemplateId, initialBookingTheme, sectionCatalog, serviceCategoryDraft]);
  const isGlobalDirty = isPublicInfoDirty || isThemeDirty;

  const orderedServices = useMemo(() => {
    const rank = new Map(serviceOrderIds.map((id, index) => [id, index]));
    return [...initialServices].sort((a, b) => {
      const ai = rank.get(a.id);
      const bi = rank.get(b.id);
      if (ai === undefined && bi === undefined) return 0;
      if (ai === undefined) return 1;
      if (bi === undefined) return -1;
      return ai - bi;
    });
  }, [initialServices, serviceOrderIds]);
  const previewServices = useMemo(
    () =>
      orderedServices.map((service) => ({
        id: service.id,
        name: service.name,
        price: Number(service.price || 0),
        duration_minutes: Number(service.duration_minutes || 30),
        category: (serviceCategoryDraft[service.id] || "General").trim() || "General",
      })),
    [orderedServices, serviceCategoryDraft],
  );
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
  const mpDraftKey = `klip-business-draft-v1:${shopSlug || "default"}`;
  const mpReturnScrollKey = getMpReturnScrollKey(shopSlug);

  const maskValue = (value: string) => (showStats ? value : "••••");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(mpDraftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        name?: string;
        address?: string;
        localidad?: string;
        phone?: string;
        instagramUrl?: string;
        facebookUrl?: string;
        tiktokUrl?: string;
        whatsappTemplate?: string;
        bookingDepositEnabled?: boolean;
        bookingDepositAmount?: string;
        businessHours?: BusinessHoursData | null;
      };
      if (typeof draft.name === "string") setName(draft.name);
      if (typeof draft.address === "string") setAddress(draft.address);
      if (typeof draft.localidad === "string") setLocalidad(draft.localidad);
      if (typeof draft.phone === "string") setPhone(draft.phone);
      if (typeof draft.instagramUrl === "string") setInstagramUrl(draft.instagramUrl);
      if (typeof draft.facebookUrl === "string") setFacebookUrl(draft.facebookUrl);
      if (typeof draft.tiktokUrl === "string") setTiktokUrl(draft.tiktokUrl);
      if (typeof draft.whatsappTemplate === "string") setWhatsappTemplate(draft.whatsappTemplate);
      if (typeof draft.bookingDepositEnabled === "boolean") setBookingDepositEnabled(draft.bookingDepositEnabled);
      if (typeof draft.bookingDepositAmount === "string") setBookingDepositAmount(draft.bookingDepositAmount);
      if (draft.businessHours && typeof draft.businessHours === "object") setBusinessHours(draft.businessHours);
    } catch {}
  }, [mpDraftKey]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mpStatus = params.get("mp");
    if (!mpStatus) return;

    const mpErrorMap: Record<string, string> = {
      error_oauth: "Mercado Pago rechazo la autorizacion. Volve a intentar y acepta los permisos.",
      error_state: "La sesion de conexion expiro o es invalida. Reintenta conectar Mercado Pago.",
      error_env: "Falta configuracion de OAuth en el servidor (client id/secret/state).",
      error_auth: "Tu sesion expiro durante la conexion. Inicia sesion y reintenta.",
      error_access: "No tenes permisos para conectar Mercado Pago en este local.",
      error_token: "Mercado Pago no devolvio token valido. Revisa Redirect URI y credenciales OAuth.",
      error_save: "No se pudo guardar la conexion de Mercado Pago en el local.",
    };

    if (mpStatus === "connected") {
      window.localStorage.removeItem(mpDraftKey);
      setMessage({ type: "success", text: "Mercado Pago conectado correctamente" });
      clearTimeout(messageTimerRef.current ?? undefined);
      messageTimerRef.current = setTimeout(() => { messageTimerRef.current = null; setMessage(null); }, 3000);
    } else {
      setMessage({
        type: "error",
        text: mpErrorMap[mpStatus] || `No se pudo conectar Mercado Pago (${mpStatus}). Intenta de nuevo.`,
      });
    }

    params.delete("mp");
    const next = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);

    const savedY = Number(window.sessionStorage.getItem(mpReturnScrollKey) || "NaN");
    const scrollTimers: ReturnType<typeof setTimeout>[] = [];
    if (Number.isFinite(savedY) && savedY >= 0) {
      const restore = () => window.scrollTo({ top: savedY, left: 0, behavior: "auto" });
      restore();
      requestAnimationFrame(() => {
        restore();
        const t = setTimeout(restore, 60);
        scrollTimers.push(t);
      });
      window.sessionStorage.removeItem(mpReturnScrollKey);
    }

    return () => {
      scrollTimers.forEach(clearTimeout);
    };
  }, [mpDraftKey, mpReturnScrollKey]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const key = `klip-business-onboarding-v1:${shopSlug || "default"}`;

    const hasData = Boolean(
      initialData?.nombre?.trim() &&
      initialData?.address?.trim() &&
      initialData?.phone?.trim() &&
      initialServices.length > 0
    );

    if (hasData) {
      window.localStorage.setItem(key, JSON.stringify({ active: false, step: 5, doneAt: Date.now() }));
      return;
    }

    let done = false;
    let startStep = 0;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        if (raw === "1") done = true;
        else {
          const parsed = JSON.parse(raw) as { active?: boolean; step?: number; doneAt?: number };
          if (parsed?.doneAt || parsed?.active === false) done = true;
          if (parsed?.active && typeof parsed.step === "number") {
            startStep = Math.max(0, Math.min(parsed.step, tourSteps.length - 1));
            setTourStep(startStep);
          }
        }
      }
    } catch {}
    if (!done) {
      if (shopSlug) {
        setTourOpen(true);
      }
    }
  }, [shopSlug, tourSteps, initialData, initialServices]);

  useEffect(() => {
    if (!tourOpen) return;
    const target = tourSteps[tourStep];
    if (!target) return;
    document.getElementById(target.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [tourOpen, tourStep, tourSteps]);

  useEffect(() => {
    if (!tourOpen) return;
    const target = tourSteps[tourStep];
    if (!target) return;
    let isAutoScrolling = false;
    const onScroll = () => {
      if (isAutoScrolling) return;
      const el = document.getElementById(target.id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const inView = r.top < window.innerHeight && r.bottom > 0;
      if (!inView) {
        isAutoScrolling = true;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => { isAutoScrolling = false; }, 600);
      }
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [tourOpen, tourStep, tourSteps]);

  useEffect(() => {
    if (!tourOpen) return;
    const id = window.setTimeout(() => {
      window.localStorage.setItem(
        mpDraftKey,
        JSON.stringify({
          name,
          address,
          localidad,
          phone,
          instagramUrl,
          facebookUrl,
          tiktokUrl,
          whatsappTemplate,
          bookingDepositEnabled,
          bookingDepositAmount,
          businessHours,
        }),
      );
    }, 180);

    return () => window.clearTimeout(id);
  }, [
    tourOpen,
    mpDraftKey,
    name,
    address,
    localidad,
    phone,
    instagramUrl,
    facebookUrl,
    tiktokUrl,
    whatsappTemplate,
    bookingDepositEnabled,
    bookingDepositAmount,
    businessHours,
  ]);

  useEffect(() => {
    if (!tourOpen) {
      setTourRect(null);
      return;
    }

    let rafId = 0;

    const updateRect = () => {
      const target = tourSteps[tourStep];
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
  }, [tourOpen, tourStep, tourSteps]);

  function completeTour() {
    window.localStorage.setItem(`klip-business-onboarding-v1:${shopSlug || "default"}`, JSON.stringify({ active: false, step: 5, doneAt: Date.now() }));
    setTourOpen(false);
  }

  async function saveAllSections(): Promise<boolean> {
    const formData = new FormData();
    formData.set("nombre", name);
    formData.set("address", address);
    formData.set("localidad", localidad);
    formData.set("phone", phone);
    formData.set("instagram_url", instagramUrl);
    formData.set("facebook_url", facebookUrl);
    formData.set("tiktok_url", tiktokUrl);

    const info = await updateBusinessInfo(formData);
    if (!info.success) return showError(info.error), false;

    if (businessHours) {
      const hours = await updateBusinessHours(businessHours);
      if (!hours.success) return showError(hours.error), false;
    }

    const freshHours = await fetchBusinessHours();
    if (freshHours.success) {
      setBusinessHours(freshHours.data ?? null);
    }

    const amount = Math.max(0, Number(bookingDepositAmount) || 0);
    const policy = await updateBookingDepositPolicyAction(bookingDepositEnabled, amount, payAtShop);
    if (!policy.success) return showError(policy.error), false;

    const wa = await updateWhatsappTemplateAction(whatsappTemplate);
    if (!wa.success) return showError(wa.error), false;

    if (shop?.id) {
      const vwa = await updateVoucherWhatsappTemplate(shop.id, voucherWhatsappTemplate);
      if (!vwa.success) return showError(vwa.error), false;
    }

    if (initialServices.length > 0) {
      const categoryUpdates = initialServices.map((service) => ({
        id: service.id,
        category: (serviceCategoryDraft[service.id] || "General").trim() || "General",
      }));
      const categoryResult = await bulkUpdateServiceCategories(categoryUpdates);
      if (!categoryResult.success) return showError(categoryResult.error), false;
    }

    const theme = await upsertBookingTheme({
      templateId: selectedTemplateId,
      shopSlug: shopSlug ?? undefined,
      sectionOrder: sectionCatalog,
      sectionServiceOrder: buildSectionServiceOrder(),
      heroTitle,
      heroSubtitle,
      aboutTitle,
      aboutText,
    });
    if (!theme.success) return showError(theme.error), false;

    setBookingTheme(prev => prev ? {
      ...prev,
      template_id: selectedTemplateId,
      hero_title: heroTitle,
      hero_subtitle: heroSubtitle,
      about_title: aboutTitle,
      about_text: aboutText,
    } : prev);

    const fresh = await fetchBusinessData();
    if (fresh.success && fresh.data) {
      setData(fresh.data);
      setBookingDepositEnabled(fresh.data.booking_deposit_enabled);
      setBookingDepositAmount(String(fresh.data.booking_deposit_amount ?? 3000));
      setPayAtShop(fresh.data.pay_at_shop);
      setWhatsappTemplate(fresh.data.whatsapp_template);
    }

    try { window.localStorage.removeItem(mpDraftKey); } catch {}
    playSuccess();
    showSuccess("Todo guardado correctamente");
    return true;
  }

  function showSuccess(text: string) {
    setMessage({ type: "success", text });
    clearTimeout(messageTimerRef.current ?? undefined);
    messageTimerRef.current = setTimeout(() => { messageTimerRef.current = null; setMessage(null); }, 3000);
  }

  function showError(text: string) {
    setMessage({ type: "error", text });
  }

  async function handleSavePublicInfo(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("nombre", name);
      formData.set("address", address);
      formData.set("localidad", localidad);
      formData.set("phone", phone);
      formData.set("instagram_url", instagramUrl);
      formData.set("facebook_url", facebookUrl);
      formData.set("tiktok_url", tiktokUrl);

      const result = await updateBusinessInfo(formData);
      if (!result.success) {
        playError();
        showError(result.error);
      } else {
        playSuccess();
        showSuccess("Información pública guardada");
        setData(prev => prev ? {
          ...prev,
          name,
          address,
          localidad,
          phone,
          instagram_url: instagramUrl,
          facebook_url: facebookUrl,
          tiktok_url: tiktokUrl,
        } : prev);
      }
    } catch (e) {
      playError();
      showError(e instanceof Error ? e.message : "Error al guardar información pública");
    } finally {
      setIsSaving(false);
    }
  }

  function handleConnectMercadoPago() {
    if (Date.now() < mpConnectUnlockAt) return;
    setIsConnectingMp(true);
    window.localStorage.setItem(
      mpDraftKey,
      JSON.stringify({
        name,
        address,
        localidad,
        phone,
        instagramUrl,
        facebookUrl,
        tiktokUrl,
        whatsappTemplate,
        bookingDepositEnabled,
        bookingDepositAmount,
        businessHours,
      }),
    );
    window.sessionStorage.setItem(mpReturnScrollKey, String(window.scrollY || 0));
    window.location.href = "/api/payments/mercadopago-oauth/start";
  }



  function handleRemoveSection(sectionToRemove: string) {
    if (sectionToRemove === "General") return;
    setSectionCatalog((prev) => prev.filter((section) => section !== sectionToRemove));
    setServiceCategoryDraft((prev) => {
      const next = { ...prev };
      for (const serviceId of Object.keys(next)) {
        if (next[serviceId] === sectionToRemove) next[serviceId] = "General";
      }
      return next;
    });
  }

  function handleRenameSection(oldName: string, newName: string) {
    if (oldName === "General" || oldName === "Todos") return;
    if (newName === oldName) return;
    setSectionCatalog((prev) => prev.includes(newName) ? prev : prev.map((s) => (s === oldName ? newName : s)));
    setServiceCategoryDraft((prev) => {
      const next = { ...prev };
      for (const serviceId of Object.keys(next)) {
        if (next[serviceId] === oldName) next[serviceId] = newName;
      }
      return next;
    });
  }

  function handleSectionReorder(reordered: string[]) {
    setSectionCatalog(reordered);
  }

  function buildSectionServiceOrder(): string[] {
    const known = new Set(initialServices.map((service) => service.id));
    const ordered = serviceOrderIds.filter((id) => known.has(id));
    const missing = initialServices.map((service) => service.id).filter((id) => !ordered.includes(id));
    return [...ordered, ...missing];
  }

  function moveServiceToSection(serviceId: string, section: string, beforeServiceId?: string) {
    setServiceCategoryDraft((prev) => ({ ...prev, [serviceId]: section }));
    setServiceOrderIds((prevOrder) => {
      const without = prevOrder.filter((id) => id !== serviceId);
      if (beforeServiceId && without.includes(beforeServiceId)) {
        const idx = without.indexOf(beforeServiceId);
        const next = [...without];
        next.splice(idx, 0, serviceId);
        return next;
      }

      const tempCategories = { ...serviceCategoryDraft, [serviceId]: section };
      let lastInSectionIndex = -1;
      for (let i = 0; i < without.length; i++) {
        const currentId = without[i];
        if ((tempCategories[currentId] || "General") === section) lastInSectionIndex = i;
      }
      const next = [...without];
      if (lastInSectionIndex === -1) next.push(serviceId);
      else next.splice(lastInSectionIndex + 1, 0, serviceId);
      return next;
    });
    showSuccess(`Servicio movido a ${section}.`);
  }

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.set("logo", file);
      if (shopSlug) formData.set("shopSlug", shopSlug);

      const result = await uploadBookingLogo(formData);
      if (!result.success || !result.data) {
        playError();
        showError(result.success ? "No se pudo subir el logo" : result.error);
        return;
      }

      setLogoUrl(result.data.logoUrl);
      playSuccess();
      showSuccess("Logo actualizado");
    } catch (error) {
      playError();
      showError(error instanceof Error ? error.message : "No se pudo subir el logo");
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  }

  async function handleDisconnectMercadoPago() {
    setIsDisconnectingMp(true);
    try {
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
    } catch (e) {
      playError();
      showError(e instanceof Error ? e.message : "Error al desconectar Mercado Pago");
    } finally {
      setIsDisconnectingMp(false);
    }
  }


  async function handleCloseShop() {
    if (!canManageBilling || isDeleting) return;
    if (closeConfirm.trim().toUpperCase() !== "CONFIRMAR") {
      showError("Escribí CONFIRMAR para confirmar el cierre del local.");
      playError();
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteCurrentShop(shopSlug ?? undefined);
      if (!result.success) {
        playError();
        showError(result.error);
        setIsDeleting(false);
        return;
      }
      playSuccess();
      window.location.href = "/";
    } catch (e) {
      playError();
      showError(e instanceof Error ? e.message : "Error inesperado");
      setIsDeleting(false);
    }
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
      window.location.assign(`/dashboard/${result.data.slug}/business`);
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-6 pb-20"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Mi Negocio</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Información pública y configuración técnica de tu local</p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            id="setup-staff"
            href={withDashboardBase("/dashboard/staff", dashboardBasePath)}
            className="group relative flex items-center gap-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900 px-5 py-5 shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/80 to-transparent dark:from-emerald-950/30 to-transparent pointer-events-none" />
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-700" />
            <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600 text-white shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/50 shrink-0">
              <Users className="w-7 h-7" />
            </div>
            <div className="relative flex flex-col flex-1 min-w-0">
              <span className="text-base font-semibold text-gray-900 dark:text-white">Gestionar {staffPlural.toLowerCase()}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Agregar, horarios y perfiles</span>
            </div>
            <ChevronRight className="relative w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0" />
          </Link>
          <Link
            id="setup-services"
            href={withDashboardBase("/dashboard/services", dashboardBasePath)}
            className="group relative flex items-center gap-4 rounded-2xl border border-sky-200 dark:border-sky-800 bg-white dark:bg-zinc-900 px-5 py-5 shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-sky-50/80 to-transparent dark:from-sky-950/30 to-transparent pointer-events-none" />
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-sky-400 to-sky-300 dark:from-sky-500 dark:to-sky-700" />
            <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-500 dark:from-sky-500 dark:to-sky-600 text-white shadow-lg shadow-sky-200/50 dark:shadow-sky-900/50 shrink-0">
              <Scissors className="w-7 h-7" />
            </div>
            <div className="relative flex flex-col flex-1 min-w-0">
              <span className="text-base font-semibold text-gray-900 dark:text-white">Gestionar {servicePlural.toLowerCase()}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Precios, duración y personal</span>
            </div>
            <ChevronRight className="relative w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-sky-500 dark:group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all shrink-0" />
          </Link>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowCreateShopModal(true)}
            disabled={!isOwnerOrAdmin || creatingShop}
            className="inline-flex items-center rounded-full border border-violet-300/60 dark:border-violet-500/30 bg-violet-100/80 dark:bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-800 dark:text-violet-200 hover:bg-violet-100 dark:hover:bg-violet-500/25 shadow-sm transition-all disabled:opacity-60"
          >
            {creatingShop ? "Creando..." : "+ Crear nuevo local"}
          </button>
        </div>
      </div>

      <BusinessStatsSection
        showStats={showStats}
        setShowStats={setShowStats}
        maskValue={maskValue}
        incomeValue={incomeValue}
        expenseValue={expenseValue}
        incomePct={incomePct}
        expensePct={expensePct}
        netValue={netValue}
        metricStats={metricStats}
        summaryStats={summaryStats}
        customerPlural={customerPlural}
        servicePlural={servicePlural}
      />

      {error && (
        <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm px-5 py-3 rounded-full border border-red-200/30 dark:border-red-500/20">
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
                ? "bg-green-50 dark:bg-green-950 text-green-700 border-green-200/30"
                : "bg-red-50 dark:bg-red-950 text-red-700 border-red-200/30"
            }`}
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-6">
      {/* Card: Información Pública */}
      <form id="setup-public-info" onSubmit={handleSavePublicInfo} className="order-1">
        <div className="rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors bg-white dark:bg-zinc-900">
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
                disabled={!isOwnerOrAdmin}
                className="w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                placeholder="Ej: Klip Barbería"
                required
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
                  disabled={!isOwnerOrAdmin}
                  className={`w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all ${locationError ? "border-red-400 focus:ring-red-400/50" : "border-red-400/0 dark:border-red-400/0 focus:ring-violet-500/50"}`}
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
                  disabled={!isOwnerOrAdmin}
                  className="w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
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
                  disabled={!isOwnerOrAdmin}
                  className="w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                  placeholder="11 1234-5678"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/20 dark:border-white/10 bg-white dark:bg-zinc-900 p-4">
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
                    disabled={!isOwnerOrAdmin}
                    className="w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
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
                    disabled={!isOwnerOrAdmin}
                    className="w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
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
                    disabled={!isOwnerOrAdmin}
                    className="w-full rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-sm text-gray-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    placeholder="https://tiktok.com/@tu-local"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      <section className="order-4 max-sm:rounded-none max-sm:border-x-0 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors bg-white dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setShowThemeCard((v) => !v)}
          className="w-full px-6 py-5 border-b border-white/10 flex items-center gap-3 text-left"
        >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Personalizar mi tienda</h2>
                <InfoTooltip text="Elegí un diseño visual y personalizá los textos que se muestran en tu tienda online. Hacé clic sobre cualquier texto para editarlo directamente. Los cambios se guardan automáticamente." />
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Selecciona template y textos principales</p>
            </div>
            <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-300 ${showThemeCard ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence initial={false}>
          {showThemeCard && (
            <motion.div
              key="theme-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="max-sm:overflow-visible overflow-hidden"
            >
              <div className="p-6 max-sm:px-0">
                <ErrorBoundary>
                <BookingThemeLivePreview
                  toolbar={
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <SkinSelector
                          selectedTemplateId={selectedTemplateId}
                          onSelect={(templateId) => {
                            setSelectedTemplateId(templateId);
                          }}
                        />
                      </div>
                      {shopSlug ? (
                        <a
                          href={`/book/${shopSlug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-300 transition-colors"
                          title="Ver tienda"
                        >
                          <Store className="h-5 w-5" />
                        </a>
                      ) : null}
                    </div>
                  }
                  templateId={selectedTemplateId}
                  logoUrl={logoUrl}
                  shopName={name || data?.nombre || "Tu negocio"}
                  heroTitle={heroTitle}
                  onHeroTitleChange={setHeroTitle}
                  heroSubtitle={heroSubtitle}
                  onHeroSubtitleChange={setHeroSubtitle}
                  aboutTitle={aboutTitle}
                  onAboutTitleChange={setAboutTitle}
                  aboutText={aboutText}
                  onAboutTextChange={setAboutText}
                  services={previewServices}
                  sectionCatalog={sectionCatalog}
                  onServiceMove={moveServiceToSection}
                  onSectionAdd={(name) => {
                    setSectionCatalog((prev) => prev.includes(name) ? prev : [...prev, name]);
                  }}
                  onSectionRemove={handleRemoveSection}
                  onSectionRename={handleRenameSection}
                  onSectionReorder={handleSectionReorder}
                  onLogoUpload={handleLogoUpload}
                  industry={industry}
                  disabled={!isOwnerOrAdmin}
                />
                </ErrorBoundary>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Card: Configuración Técnica */}
      <div id="setup-payments" className="order-3 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors bg-white dark:bg-zinc-900">
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
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
              <div className="rounded-2xl border border-white/20 dark:border-white/10 bg-white dark:bg-zinc-900 px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {data?.mp_oauth_connected ? "Cuenta conectada" : "Cuenta no conectada"}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {data?.mp_oauth_connected
                      ? "Ya podes cobrar señas online con tu cuenta de Mercado Pago."
                      : "Conecta tu cuenta para activar cobros online sin cargar tokens manualmente."}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!data?.mp_oauth_connected ? (
                    <button
                      type="button"
                      onMouseDown={playClick}
                      onClick={handleConnectMercadoPago}
                      disabled={!isOwnerOrAdmin || isConnectingMp || isDisconnectingMp}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      <Link2 className="w-4 h-4" />
                      {isConnectingMp ? "Conectando..." : "Conectar Mercado Pago"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onMouseDown={playClick}
                      onClick={handleDisconnectMercadoPago}
                      disabled={!isOwnerOrAdmin || isDisconnectingMp || isConnectingMp}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-300 bg-white px-5 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700/50 dark:bg-black/30 dark:text-rose-200"
                    >
                      <Trash2 className="w-4 h-4" />
                      {isDisconnectingMp ? "Desconectando..." : "Desconectar"}
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-rose-200/70 dark:border-rose-700/40 bg-rose-50/80 dark:bg-rose-900/20 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">Recomendacion fuerte de cobro</p>
                  <p className="text-xs text-rose-700/90 dark:text-rose-200/90 mt-0.5">MP descuenta ~7%. Mejor cobra solo una seña online.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setPayAtShop(false); setBookingDepositEnabled(true); }}
                    disabled={!isOwnerOrAdmin}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      !payAtShop && bookingDepositEnabled
                        ? "ui-btn-primary"
                        : "ui-btn-ghost"
                    }`}
                  >
                    Cobrar seña online
                  </button>
                  {!payAtShop && bookingDepositEnabled && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs text-rose-600 dark:text-rose-300">$</span>
                      <input
                        type="number"
                        min={0}
                        value={bookingDepositAmount}
                        onChange={(e) => setBookingDepositAmount(e.target.value)}
                        disabled={!isOwnerOrAdmin}
                        className="w-20 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 px-2 py-1.5 text-sm text-center text-gray-900 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="3000"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setPayAtShop(false); setBookingDepositEnabled(false); }}
                    disabled={!isOwnerOrAdmin}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      !payAtShop && !bookingDepositEnabled
                        ? "ui-btn-primary"
                        : "ui-btn-ghost"
                    }`}
                  >
                    Cobrar total online
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPayAtShop(true); setBookingDepositEnabled(false); }}
                    disabled={!isOwnerOrAdmin}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      payAtShop
                        ? "ui-btn-primary"
                        : "ui-btn-ghost"
                    }`}
                  >
                    Cobrar en local
                  </button>
                </div>
                <div />
              </div>
            </div>
          </div>
          ) : (
            <div className="rounded-2xl border border-amber-200/60 bg-amber-50/70 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
              Solo el owner del local puede conectar Mercado Pago y gestionar facturacion.
            </div>
          )}

        </div>
      </div>

      <div className="order-2 lg:grid lg:grid-cols-2 gap-6">
        {/* Card: Horarios de Atención */}
        <div id="setup-hours" className="rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors bg-white dark:bg-zinc-900">
          <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-500/15">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Horarios de Atención</h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Días y horarios de apertura del local</p>
            </div>
            <div />
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
                    <div key={day.key} className="flex flex-wrap items-center gap-3 py-3 px-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                      <p className={`text-sm font-medium min-w-[64px] ${h.open ? "text-gray-900 dark:text-white" : "text-zinc-400 dark:text-zinc-500"}`}>
                        {day.label}
                      </p>
                      <button
                        type="button"
                        onClick={() => setBusinessHours({ ...businessHours, [day.key]: { ...h, open: !h.open } })}
                        disabled={!isOwnerOrAdmin}
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
                          disabled={!isOwnerOrAdmin || !h.open}
                          onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, start: e.target.value } })}
                          className="rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
                        />
                        <span className="hidden sm:inline text-xs text-zinc-400">→</span>
                        <input
                          type="time"
                          value={h.end}
                          disabled={!isOwnerOrAdmin || !h.open}
                          onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, end: e.target.value } })}
                          className="rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
                        />

                        <button
                          type="button"
                          disabled={!isOwnerOrAdmin || !h.open}
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
                              disabled={!isOwnerOrAdmin || !h.open}
                              onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, break_start: e.target.value } })}
                              className="rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
                            />
                            <span className="hidden sm:inline text-xs text-zinc-400">→</span>
                            <input
                              type="time"
                              value={h.break_end}
                              disabled={!isOwnerOrAdmin || !h.open}
                              onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, break_end: e.target.value } })}
                              className="rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
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

        {/* Card: Feriados y Excepciones */}
        <div className="rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors bg-white dark:bg-zinc-900">
          <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-500/15">
              <Calendar className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Feriados y Excepciones</h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Cierres totales o horarios reducidos para dias puntuales</p>
            </div>
            {isOwnerOrAdmin && (
              <button
                type="button"
                onClick={openNewOverride}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-sm font-medium px-4 py-2 transition-colors"
              >
                <Plus className="w-4 h-4" /> Agregar
              </button>
            )}
          </div>
          <div className="p-4">
            {overridesLoading ? (
              <div className="py-8 text-center text-sm text-zinc-400">Cargando excepciones...</div>
            ) : overrides.length === 0 ? (
              <div className="py-8 text-center text-sm text-zinc-400">No hay excepciones cargadas</div>
            ) : (
              <div className="space-y-2">
                {overrides.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 py-2.5 px-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <div className={`p-1.5 rounded-full shrink-0 ${o.is_closed ? "bg-red-100 dark:bg-red-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
                      <Calendar className={`w-4 h-4 ${o.is_closed ? "text-red-600" : "text-amber-600"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {new Date(o.date + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {o.staff_id ? `${o.staff_name} — ` : ""}
                        {o.is_closed ? "Cerrado todo el día" : `${o.start_time} a ${o.end_time}`}
                        {o.reason ? ` (${o.reason})` : ""}
                      </p>
                    </div>
                    {isOwnerOrAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditOverride(o)}
                          className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteOverride(o)}
                          className="p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-zinc-500 hover:text-red-600 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {portalReady && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showOverrideModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center z-[60] bg-black/50 backdrop-blur-sm"
              onClick={() => setShowOverrideModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white dark:bg-zinc-900 rounded-[2rem] shadow-xl w-full max-w-md mx-4 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {editOverride ? "Editar excepción" : "Nueva excepción"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowOverrideModal(false)}
                    className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={overrideDate}
                      onChange={(e) => setOverrideDate(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Afecta a</label>
                    <select
                      value={overrideStaffId ?? ""}
                      onChange={(e) => setOverrideStaffId(e.target.value || null)}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    >
                      <option value="">Todo el local</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOverrideIsClosed(true)}
                      className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${overrideIsClosed ? "bg-red-500 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"}`}
                    >
                      Cerrado
                    </button>
                    <button
                      type="button"
                      onClick={() => setOverrideIsClosed(false)}
                      className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${!overrideIsClosed ? "bg-amber-500 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"}`}
                    >
                      Horario reducido
                    </button>
                  </div>
                  {!overrideIsClosed && (
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Desde</label>
                        <input
                          type="time"
                          value={overrideStartTime}
                          onChange={(e) => setOverrideStartTime(e.target.value)}
                          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Hasta</label>
                        <input
                          type="time"
                          value={overrideEndTime}
                          onChange={(e) => setOverrideEndTime(e.target.value)}
                          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Motivo (opcional)</label>
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Ej: Feriado nacional, Vacaciones..."
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setShowOverrideModal(false)}
                    className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveOverride}
                    className="rounded-full px-4 py-2 text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                  >
                    Guardar
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {portalReady && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {tourOpen && (
            <>
              {tourRect && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none fixed z-[81] rounded-[2rem] border-2 border-violet-400/85 shadow-[0_0_0_9999px_rgba(10,12,18,0.42),0_0_0_6px_rgba(167,139,250,0.22)]"
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
                className="fixed bottom-4 left-1/2 z-[90] w-[min(94vw,620px)] -translate-x-1/2 rounded-3xl border border-white/25 dark:border-white/10 bg-white dark:bg-zinc-900 p-4 shadow-2xl"
              >
                <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Recorrido guiado</p>
                <h3 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{tourSteps[tourStep].title}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{tourSteps[tourStep].text}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={completeTour}
                    className="ui-btn-ghost rounded-full px-3 py-1.5 text-xs font-semibold"
                  >
                    Omitir
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{tourStep + 1}/{tourSteps.length}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (tourStep >= tourSteps.length - 1) {
                          completeTour();
                          return;
                        }
                        if (tourStep === 2) {
                          setTourAdvancing(true);
                          setMpConnectUnlockAt(Date.now() + 1400);
                          (async () => {
                            try {
                              const ok = await saveAllSections();
                              if (!ok) {
                                setTourAdvancing(false);
                                return;
                              }
                              const key = `klip-business-onboarding-v1:${shopSlug || "default"}`;
                              window.localStorage.setItem(key, JSON.stringify({ active: true, step: 3 }));
                              router.push(shopSlug ? `/dashboard/${shopSlug}/staff` : "/dashboard/staff");
                            } catch (e) {
                              setTourAdvancing(false);
                            }
                          })();
                          return;
                        }
                        const nextStep = Math.min(tourStep + 1, tourSteps.length - 1);
                        setTourStep(nextStep);
                        window.localStorage.setItem(`klip-business-onboarding-v1:${shopSlug || "default"}`, JSON.stringify({ active: true, step: nextStep }));
                      }}
                      disabled={tourAdvancing}
                      className="ui-btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-60"
                    >
                      {tourAdvancing ? "Guardando y continuando..." : tourStep >= tourSteps.length - 1 ? "Finalizar" : "Siguiente"}
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

      {/* Comunicaciones con los clientes */}
      <div className="rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors bg-white dark:bg-zinc-900">
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="p-2 rounded-full bg-violet-500/15">
            <MessageSquareText className="w-5 h-5 text-violet-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Comunicaciones con los clientes</h2>
              <InfoTooltip text="Al editar las plantillas, los nuevos mensajes de WhatsApp que se envíen automáticamente usarán el texto personalizado. Las etiquetas (@Nombre, @Servicio, etc.) se reemplazarán con los datos reales de cada turno o voucher." />
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Personalizá los mensajes que reciben tus clientes</p>
          </div>
        </div>
        <div className="p-6 space-y-6">

          {/* Mensaje de confirmación de turno */}
          <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-blue-500/10">
                <MessageSquareText className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Confirmación de turno</h3>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Se envía al agendar o confirmar un turno</p>
              </div>
            </div>
            <TagChips tags={["Nombre", "Servicio", "Fecha", "Hora", "Lugar", "Negocio"]} onInsert={insertWhatsappTag} />
            <TaggedTextarea
              innerRef={whatsappRef}
              value={whatsappTemplate}
              onChange={(e) => setWhatsappTemplate(e.target.value)}
              placeholder="Escribí el mensaje de confirmación..."
              disabled={!isOwnerOrAdmin}
            />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span className={whatsappTemplate.match(/\@Hora/) ? "text-green-600 dark:text-green-400" : "text-rose-600 dark:text-rose-400"}>
                {whatsappTemplate.match(/\@Hora/) ? "✓" : "✕"} <span className="text-violet-600 dark:text-violet-400 font-medium">@Hora</span> requerido
              </span>
              <span className={whatsappTemplate.match(/\@Lugar/) ? "text-green-600 dark:text-green-400" : "text-rose-600 dark:text-rose-400"}>
                {whatsappTemplate.match(/\@Lugar/) ? "✓" : "✕"} <span className="text-violet-600 dark:text-violet-400 font-medium">@Lugar</span> requerido
              </span>
            </div>
          </div>

          {/* Mensaje de voucher */}
          <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-amber-500/10">
                <MessageSquareText className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Voucher de regalo</h3>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Se envía al regalar un voucher a un cliente</p>
              </div>
            </div>
            <TagChips tags={["Nombre", "Servicio", "Regala"]} onInsert={insertVoucherTag} />
            <TaggedTextarea
              innerRef={voucherRef}
              value={voucherWhatsappTemplate}
              onChange={(e) => setVoucherWhatsappTemplate(e.target.value)}
              placeholder="Escribí el mensaje de voucher..."
              disabled={!isOwnerOrAdmin}
            />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span className={voucherWhatsappTemplate.match(/\@Servicio/) ? "text-green-600 dark:text-green-400" : "text-rose-600 dark:text-rose-400"}>
                {voucherWhatsappTemplate.match(/\@Servicio/) ? "✓" : "✕"} <span className="text-violet-600 dark:text-violet-400 font-medium">@Servicio</span> requerido
              </span>
              <span className={voucherWhatsappTemplate.match(/\@Regala/) ? "text-green-600 dark:text-green-400" : "text-rose-600 dark:text-rose-400"}>
                {voucherWhatsappTemplate.match(/\@Regala/) ? "✓" : "✕"} <span className="text-violet-600 dark:text-violet-400 font-medium">@Regala</span> requerido
              </span>
            </div>
          </div>

          {/* Mensaje de cumpleaños */}
          <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-pink-500/10">
                <MessageSquareText className="w-4 h-4 text-pink-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Mensaje de cumpleaños</h3>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Se envía automáticamente en el cumpleaños del cliente</p>
              </div>
            </div>
            <TagChips tags={["Nombre"]} onInsert={insertBirthdayTag} />
            <TaggedTextarea
              innerRef={birthdayRef}
              value={birthdayWhatsappTemplate}
              onChange={(e) => setBirthdayWhatsappTemplate(e.target.value)}
              placeholder="Escribí el mensaje de cumpleaños..."
              disabled={!isOwnerOrAdmin}
            />
          </div>

        </div>
      </div>

      {/* Exportar datos */}
      {shop?.id && (
        <ExportDataCard shopId={shop.id} />
      )}

      {/* Guardar todo flotante */}
      {portalReady && typeof document !== "undefined" && createPortal(
        isGlobalDirty ? (
          <button
            type="button"
            onClick={async () => {
              if (isSaving) return;
              setIsSaving(true);
              try {
                await saveAllSections();
              } catch (e) {
                showError(e instanceof Error ? e.message : "Error al guardar todo");
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
            className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white cursor-pointer select-none animate-pulse-glow transition-all duration-300"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Guardando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Guardar todo
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="fixed bottom-4 right-4 z-50 inline-flex items-center justify-center w-9 h-9 rounded-full bg-zinc-300 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed shadow-sm transition-all duration-300"
            title="No hay cambios pendientes"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        ),
        document.body
      )}

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
              disabled={!isOwnerOrAdmin}
              placeholder='Escribí "CONFIRMAR"'
              className="w-full sm:max-w-xs rounded-full border border-red-200 dark:border-red-700 bg-white dark:bg-zinc-900 px-4 py-2 text-sm text-red-800 dark:text-red-200 outline-none"
            />
            <button
              type="button"
              onMouseDown={playClick}
              onClick={() => setShowCloseModal(true)}
              disabled={isDeleting}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? "Cerrando local..." : "Continuar cierre"}
            </button>
          </div>
        </div>
      )}

      <CreateShopModal
        isOpen={showCreateShopModal}
        onClose={() => setShowCreateShopModal(false)}
        shopName={newShopName}
        onShopNameChange={setNewShopName}
        onCreate={handleCreateNewShop}
        creating={creatingShop}
        portalReady={portalReady}
      />

      <CloseShopModal
        isOpen={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        confirmText={closeConfirm}
        onConfirmTextChange={setCloseConfirm}
        onConfirm={handleCloseShop}
        pending={isDeleting}
        portalReady={portalReady}
      />

      <p className="text-xs text-center text-zinc-400 dark:text-zinc-600 pt-2">
        Los tokens de Mercado Pago se almacenan de forma segura en la base de datos.
      </p>
    </motion.div>
  );
}
