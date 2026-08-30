"use client";

import { useState, useTransition, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Store, CreditCard, MessageSquareText, Link2, MapPin, Phone, Share2, AlertTriangle, Trash2, Users, Scissors, Calendar, Plus, CheckCircle2, XCircle, Landmark, Settings2, ArrowRight } from "lucide-react";
import { TagChips, useTagInsert } from "@/components/ui/tag-chips";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { withDashboardBase } from "@/lib/dashboard/shared/dashboard-base";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import SkinSelector from "@/components/dashboard/skin-selector";
import BookingThemeLivePreview from "@/components/dashboard/booking-theme-live-preview";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import CreateShopModal from "@/components/dashboard/create-shop-modal";
import CloseShopModal from "@/components/dashboard/close-shop-modal";
import BaseModal from "@/components/ui/modal";
import { bulkUpdateServiceCategories } from "@/lib/dashboard/services/service-actions";
import { createAdditionalShop } from "@/lib/dashboard/auth/actions";
import {
  fetchBusinessData,
  fetchBusinessHours,
  updateBusinessInfo,
  disconnectMercadoPagoOauthAction,
  updateBookingDepositPolicyAction,
  updateAssignStaffLater,
  updateWhatsappTemplateAction,
  updateBusinessHours,
  updateBankTransferSettings,
  updateMercadoPagoPaymentConfigAction,
  fetchShopDateOverrides,
  upsertShopDateOverride,
  deleteShopDateOverride,
  type BusinessData,
  type BusinessHoursData,
  type DateOverride,
} from "@/lib/dashboard/shop/business-actions";
import { updateVoucherWhatsappTemplate } from "@/lib/dashboard/vouchers/voucher-actions";
import { DEFAULT_BIRTHDAY_WHATSAPP_TEMPLATE, DEFAULT_VOUCHER_WHATSAPP_TEMPLATE } from "@/lib/dashboard/vouchers/voucher-constants";
import { deleteCurrentShop } from "@/lib/dashboard/shop/shop-actions";
import { setShopStoreEnabled } from "@/lib/dashboard/inventory/inventory-actions";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import {
  upsertBookingTheme,
  uploadBookingLogo,
  type BookingThemeData,
} from "@/lib/dashboard/shop/booking-theme-actions";
import { DEFAULT_BOOKING_TEMPLATE, type BookingTemplateId } from "@/lib/booking/theme-presets";
import { useAuth } from "@/lib/auth-context";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";
import { MP_EXCLUDABLE_PAYMENT_TYPES } from "@/lib/payments/mp-payment-config";

type MessageType = { type: "success" | "error"; text: string } | null;
type InitialServiceItem = { id: string; name: string; category?: string | null; price: number; duration_minutes: number | null; pay_at_shop: boolean };

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

function buildFlowSteps(
  servicesCount: number,
  staffCount: number,
  assignStaffLater: boolean,
  storeEnabled: boolean,
  hasStoreProducts: boolean,
  payAtShop: boolean,
): { number: string; label: string; on: boolean; reason?: string; hint: string }[] {
  const storeOn = storeEnabled && hasStoreProducts;
  const paymentOn = payAtShop === false;
  return [
    { number: "1", label: "Servicios", on: servicesCount > 0, reason: servicesCount === 0 ? "Sin servicios cargados" : undefined, hint: "Se skipea automáticamente si tenés solo 1 servicio" },
    {
      number: "2",
      label: "Profesional",
      on: !assignStaffLater && staffCount > 1,
      reason: assignStaffLater ? "Activaste elegir profesional después" : staffCount <= 1 ? "Solo hay un profesional" : undefined,
      hint: "Se skipea si hay solo 1 profesional o si está desactivada la selección de profesional",
    },
    { number: "3", label: "Fecha y hora", on: true, hint: "No se puede desactivar" },
    { number: "4", label: "Tus datos", on: true, hint: "No se puede desactivar" },
    { number: "5", label: "Tienda", on: storeOn, reason: !storeEnabled ? "Tienda apagada" : !hasStoreProducts ? "Sin productos para la venta" : undefined, hint: "Se desactiva apagando la tienda de productos online" },
    { number: "6", label: "Pago", on: paymentOn, reason: paymentOn ? undefined : "Pago en el local activado", hint: "Se desactiva eligiendo pago en el local" },
    { number: "7", label: "Listo", on: true, hint: "No se puede desactivar" },
  ];
}

function FlowStepChip({ step }: { step: { number: string; label: string; on: boolean; hint: string } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; bottom: number; left: number; below: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const reposition = () => {
      if (ref.current) {
        const r = ref.current.getBoundingClientRect();
        setPos({ top: r.top, bottom: r.bottom, left: r.left + r.width / 2, below: false });
      }
    };
    reposition();
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close, { passive: true });
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !pos || !bubbleRef.current) return;
    const bw = bubbleRef.current.offsetWidth;
    const bh = bubbleRef.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let left = pos.left;
    if (left - bw / 2 < margin) left = bw / 2 + margin;
    if (left + bw / 2 > vw - margin) left = vw - margin - bw / 2;

    const spaceAbove = pos.top - margin;
    const spaceBelow = vh - pos.bottom - margin;
    const below = !pos.below && spaceAbove < bh + margin && spaceBelow >= bh + margin ? true : pos.below;

    let top = below ? pos.bottom + margin : pos.top - margin - bh;
    top = Math.max(margin, Math.min(vh - bh - margin, top));

    if (Math.abs(left - pos.left) > 0.5 || below !== pos.below || Math.abs(top - pos.top) > 0.5) {
      setPos({ top, bottom: pos.bottom, left, below });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex group" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`${step.label}: ${step.hint}`}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
          step.on
            ? "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800"
            : "bg-zinc-100 dark:bg-zinc-800/60 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700/60"
        }`}
      >
        <span
          className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${
            step.on
              ? "bg-violet-600 text-white"
              : "bg-zinc-300 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {step.number}
        </span>
        {step.label}
      </button>
      {open && pos && createPortal(
        <span
          ref={bubbleRef}
          role="tooltip"
          className="fixed z-[9999] w-56 rounded-xl px-3 py-2 text-xs leading-snug shadow-lg border bg-zinc-900 text-zinc-100 border-zinc-700 dark:bg-white dark:text-zinc-800 dark:border-zinc-200"
          style={{
            top: pos.top,
            left: pos.left,
            transform: pos.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
            maxWidth: "calc(100vw - 1rem)",
          }}
        >
          {step.hint}
          <span
            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-zinc-900 border-zinc-700 dark:bg-white dark:border-zinc-200 ${
              pos.below ? "-top-1 border-l border-b" : "-bottom-1 border-b border-r"
            }`}
          />
        </span>,
        document.body
      )}
    </span>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; bottom: number; left: number; below: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const reposition = () => {
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.top, bottom: r.bottom, left: r.left + r.width / 2, below: true });
    };
    reposition();
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !pos || !bubbleRef.current) return;
    const bw = bubbleRef.current.offsetWidth;
    const bh = bubbleRef.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let left = pos.left;
    if (left - bw / 2 < margin) left = bw / 2 + margin;
    if (left + bw / 2 > vw - margin) left = vw - margin - bw / 2;

    const spaceBelow = vh - pos.bottom - margin;
    const spaceAbove = pos.top - margin;
    const below = !pos.below && spaceBelow < bh + margin && spaceAbove >= bh + margin ? false : pos.below;

    let top = below ? pos.bottom + margin : pos.top - margin - bh;
    top = Math.max(margin, Math.min(vh - bh - margin, top));

    if (
      Math.abs(left - pos.left) > 0.5 ||
      below !== pos.below ||
      Math.abs(top - (below ? pos.bottom : pos.top)) > 0.5
    ) {
      setPos({ top, bottom: pos.bottom, left, below });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <span
        role="button"
        tabIndex={0}
        className="w-4 h-4 rounded-full bg-zinc-300 dark:bg-zinc-600 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold inline-flex items-center justify-center cursor-help flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        ?
      </span>
      {open && pos && createPortal(
        <span
          ref={bubbleRef}
          className="fixed z-[9999] p-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs leading-relaxed shadow-lg text-left whitespace-normal"
          style={{
            top: pos.top,
            left: pos.left,
            transform: "translate(-50%, 0)",
            maxWidth: "calc(100vw - 1rem)",
            width: "max-content",
          }}
        >
          {text}
        </span>,
        document.body
      )}
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
  canManageBilling,
  role = "owner",
  shopSlug,
  shopId,
  initialServices,
  initialBusinessHours,
  initialBookingTheme,
  initialVoucherWhatsappTemplate,
  initialStaff,
  userEmail,
  storeEnabled,
  storeProductCount,
}: {
  initialData: BusinessData | null;
  initialError: string | null;
  canManageBilling: boolean;
  role?: string;
  shopSlug: string | null;
  shopId: string;
  initialServices: InitialServiceItem[];
  initialBusinessHours: BusinessHoursData | null;
  initialBookingTheme: BookingThemeData | null;
  initialVoucherWhatsappTemplate?: string | null;
  initialStaff: { id: string; name: string }[];
  userEmail?: string;
  storeEnabled?: boolean;
  storeProductCount?: number;
}) {
  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const industryLabels = INDUSTRY_CONFIG[industry].labels;
  const staffWord = industryLabels.staffSingular;
  const staffPlural = industryLabels.staffPlural;
  const serviceWord = industryLabels.serviceSingular;
  const servicePlural = industryLabels.servicePlural;
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
  const [showThemeCard, setShowThemeCard] = useState(false);
  const [showPublicInfo, setShowPublicInfo] = useState(false);
  const [showPaymentsCard, setShowPaymentsCard] = useState(false);
  const [showHoursCard, setShowHoursCard] = useState(false);
  const [showHolidaysCard, setShowHolidaysCard] = useState(false);
  const [showCommsCard, setShowCommsCard] = useState(false);
  const [bookingDepositEnabled, setBookingDepositEnabled] = useState(data?.booking_deposit_enabled ?? true);
  const [assignStaffLater, setAssignStaffLater] = useState(data?.assign_staff_later ?? false);
  const [assignStaffLaterSaving, setAssignStaffLaterSaving] = useState(false);
  const [storeEnabledState, setStoreEnabledState] = useState(storeEnabled ?? false);
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeConfirmOpen, setStoreConfirmOpen] = useState(false);
  const [bookingDepositAmount, setBookingDepositAmount] = useState(String(data?.booking_deposit_amount ?? 3000));
  const [payAtShop, setPayAtShop] = useState(data?.pay_at_shop ?? false);
  const [bankTransferEnabled, setBankTransferEnabled] = useState(data?.bank_transfer_enabled ?? false);
  const [bankCvuCb, setBankCvuCb] = useState(data?.bank_cvu_cbu ?? "");
  const [bankAlias, setBankAlias] = useState(data?.bank_alias ?? "");
  const [bankName, setBankName] = useState(data?.bank_name ?? "");
  const [highlightTiming, setHighlightTiming] = useState(false);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToTimingSelector = () => {
    document.getElementById("payment-timing")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightTiming(true);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightTiming(false), 2200);
  };
  const [mpMaxInstallments, setMpMaxInstallments] = useState<number | null>(data?.mp_max_installments ?? null);
  const [mpExcludedPaymentTypes, setMpExcludedPaymentTypes] = useState<string[]>(data?.mp_excluded_payment_types ?? []);
  const [isSavingMpConfig, setIsSavingMpConfig] = useState(false);
  const [showMpConfigModal, setShowMpConfigModal] = useState(false);
  const [draftMaxInstallments, setDraftMaxInstallments] = useState<number | null>(null);
  const [draftAcceptedTypes, setDraftAcceptedTypes] = useState<string[]>([]);
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
  const [overrideBreakStart, setOverrideBreakStart] = useState("");
  const [overrideBreakEnd, setOverrideBreakEnd] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const staffList = initialStaff;
  const staffCount = initialStaff.length;
  const hasStoreProducts = (storeProductCount ?? 0) > 0;

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
    setOverrideBreakStart("");
    setOverrideBreakEnd("");
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
    setOverrideBreakStart(o.break_start ?? "");
    setOverrideBreakEnd(o.break_end ?? "");
    setOverrideReason(o.reason ?? "");
    setShowOverrideModal(true);
  }

  async function handleSaveOverride() {
    if (!overrideDate) return;
    const hasBreak = !overrideIsClosed && Boolean(overrideBreakStart) && Boolean(overrideBreakEnd);
    const res = await upsertShopDateOverride(
      overrideDate, overrideStaffId, overrideIsClosed,
      overrideIsClosed ? null : overrideStartTime,
      overrideIsClosed ? null : overrideEndTime,
      overrideReason || null,
      hasBreak ? overrideBreakStart : null,
      hasBreak ? overrideBreakEnd : null
    );
    if (!res.success) { alert(res.error); return; }
    setShowOverrideModal(false);
    await loadOverrides();
  }

  async function handleDeleteOverride(o: DateOverride) {
    if (!confirm(`¿Eliminar excepción del ${o.date}?`)) return;
    const res = await deleteShopDateOverride(o.id);
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
  const [, setIsConnectingMp] = useState(false);
  const [isDisconnectingMp, setIsDisconnectingMp] = useState(false);
  const [bookingTheme, setBookingTheme] = useState<BookingThemeData | null>(initialBookingTheme);
  const [selectedTemplateId, setSelectedTemplateId] = useState<BookingTemplateId>(
    initialBookingTheme?.template_id || DEFAULT_BOOKING_TEMPLATE
  );
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>(initialBookingTheme?.logo_url || "");
  const [heroTitle, setHeroTitle] = useState(initialBookingTheme?.hero_title || "");
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
  const initialServiceOrderRef = useRef(serviceOrderIds);

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
    selectedTemplateId !== (initialBookingTheme?.template_id ?? DEFAULT_BOOKING_TEMPLATE) ||
    JSON.stringify(sectionCatalog) !== JSON.stringify(initialSectionCatalogRef.current) ||
    JSON.stringify(serviceCategoryDraft) !== JSON.stringify(initialCategoryDraftRef.current) ||
    JSON.stringify(serviceOrderIds) !== JSON.stringify(initialServiceOrderRef.current),
  [heroTitle, selectedTemplateId, initialBookingTheme, sectionCatalog, serviceCategoryDraft, serviceOrderIds]);
  const cleanSnapshotRef = useRef({
    whatsapp: data?.whatsapp_template ?? "",
    depositEnabled: data?.booking_deposit_enabled ?? true,
    depositAmount: String(data?.booking_deposit_amount ?? 3000),
    payAtShop: data?.pay_at_shop ?? false,
    voucher: initialVoucherWhatsappTemplate ?? DEFAULT_VOUCHER_WHATSAPP_TEMPLATE,
    businessHours: initialBusinessHours,
    bankTransferEnabled: data?.bank_transfer_enabled ?? false,
    bankCvuCb: data?.bank_cvu_cbu ?? "",
    bankAlias: data?.bank_alias ?? "",
    bankName: data?.bank_name ?? "",
  });
  const isGeneralDirty = useMemo(() =>
    whatsappTemplate !== cleanSnapshotRef.current.whatsapp ||
    bookingDepositEnabled !== cleanSnapshotRef.current.depositEnabled ||
    bookingDepositAmount !== cleanSnapshotRef.current.depositAmount ||
    payAtShop !== cleanSnapshotRef.current.payAtShop ||
    voucherWhatsappTemplate !== cleanSnapshotRef.current.voucher ||
    JSON.stringify(businessHours) !== JSON.stringify(cleanSnapshotRef.current.businessHours) ||
    bankTransferEnabled !== cleanSnapshotRef.current.bankTransferEnabled ||
    bankCvuCb !== cleanSnapshotRef.current.bankCvuCb ||
    bankAlias !== cleanSnapshotRef.current.bankAlias ||
    bankName !== cleanSnapshotRef.current.bankName,
  [whatsappTemplate, bookingDepositEnabled, bookingDepositAmount, payAtShop, voucherWhatsappTemplate, businessHours, bankTransferEnabled, bankCvuCb, bankAlias, bankName]);
  const isGlobalDirty = isPublicInfoDirty || isThemeDirty || isGeneralDirty;

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

  const dashboardBasePath = shopSlug ? `/dashboard/${shopSlug}` : "/dashboard";
  const mpDraftKey = `klip-business-draft-v1:${shopSlug || "default"}`;
  const mpReturnScrollKey = getMpReturnScrollKey(shopSlug);


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
    const isTestUser = userEmail === "tutorial@gmail.com";

    if (!isTestUser) {
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
    if (!done || isTestUser) {
      if (isTestUser) {
        window.localStorage.removeItem(key);
        setTourStep(0);
      }
      if (shopSlug) {
        setTourOpen(true);
      }
    }
  }, [shopSlug, tourSteps, initialData, initialServices, userEmail]);

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

    const bankResult = await updateBankTransferSettings(bankTransferEnabled, bankCvuCb, bankAlias, bankName);
    if (!bankResult.success) return showError(bankResult.error), false;

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
    });
    if (!theme.success) return showError(theme.error), false;

    setBookingTheme(prev => prev ? {
      ...prev,
      template_id: selectedTemplateId,
      hero_title: heroTitle,
    } : prev);

    const fresh = await fetchBusinessData();
    if (fresh.success && fresh.data) {
      setData(fresh.data);
      setBookingDepositEnabled(fresh.data.booking_deposit_enabled);
      setBookingDepositAmount(String(fresh.data.booking_deposit_amount ?? 3000));
      setPayAtShop(fresh.data.pay_at_shop);
      setWhatsappTemplate(fresh.data.whatsapp_template);
      setBankTransferEnabled(fresh.data.bank_transfer_enabled);
      setBankCvuCb(fresh.data.bank_cvu_cbu ?? "");
      setBankAlias(fresh.data.bank_alias ?? "");
      setBankName(fresh.data.bank_name ?? "");
    }

    initialSectionCatalogRef.current = sectionCatalog;
    initialCategoryDraftRef.current = serviceCategoryDraft;
    initialServiceOrderRef.current = serviceOrderIds;
    cleanSnapshotRef.current = {
      whatsapp: whatsappTemplate,
      depositEnabled: bookingDepositEnabled,
      depositAmount: bookingDepositAmount,
      payAtShop: payAtShop,
      voucher: voucherWhatsappTemplate,
      businessHours: businessHours ?? null,
      bankTransferEnabled,
      bankCvuCb,
      bankAlias,
      bankName,
    };

    try { window.localStorage.removeItem(mpDraftKey); } catch {}
    playSuccess();
    showSuccess("Todo guardado correctamente");
    return true;
  }

  async function handleAssignStaffLaterChange(enabled: boolean) {
    if (!isOwnerOrAdmin || assignStaffLaterSaving) return;
    const prev = assignStaffLater;
    setAssignStaffLater(enabled);
    setAssignStaffLaterSaving(true);
    const result = await updateAssignStaffLater(enabled);
    setAssignStaffLaterSaving(false);
    if (!result.success) {
      setAssignStaffLater(prev);
      showError(result.error);
      return;
    }
    showSuccess(enabled ? "Asignación de profesional activada" : "Asignación de profesional desactivada");
  }

  async function handleStoreToggle(enabled: boolean) {
    if (!isOwnerOrAdmin || storeSaving) return;
    if (!enabled) {
      setStoreConfirmOpen(true);
      return;
    }
    const prev = storeEnabledState;
    setStoreEnabledState(true);
    setStoreSaving(true);
    const result = await setShopStoreEnabled(true, shopId);
    setStoreSaving(false);
    if (!result.success) {
      setStoreEnabledState(prev);
      showError(result.error);
      return;
    }
    showSuccess("Tienda online activada");
    router.refresh();
  }

  async function handleStoreTurnOffConfirmed() {
    if (storeSaving) return;
    const prev = storeEnabledState;
    setStoreConfirmOpen(false);
    setStoreEnabledState(false);
    setStoreSaving(true);
    const result = await setShopStoreEnabled(false, shopId);
    setStoreSaving(false);
    if (!result.success) {
      setStoreEnabledState(prev);
      showError(result.error);
      return;
    }
    showSuccess("Tienda online apagada");
    router.refresh();
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

  function handleServiceReorder(serviceId: string, beforeServiceId?: string) {
    setServiceOrderIds((prevOrder) => {
      const without = prevOrder.filter((id) => id !== serviceId);
      if (beforeServiceId && without.includes(beforeServiceId)) {
        const idx = without.indexOf(beforeServiceId);
        const next = [...without];
        next.splice(idx, 0, serviceId);
        return next;
      }
      return [...without, serviceId];
    });
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

  function openMpConfigModal() {
    setDraftMaxInstallments(mpMaxInstallments);
    setDraftAcceptedTypes(MP_EXCLUDABLE_PAYMENT_TYPES.map((t) => t.id).filter((id) => !mpExcludedPaymentTypes.includes(id)));
    setShowMpConfigModal(true);
  }

  async function handleSaveMpPaymentConfig(maxInstallments: number | null, acceptedTypes: string[]) {
    if (!isOwnerOrAdmin || isSavingMpConfig) return;
    if (acceptedTypes.length === 0) {
      playError();
      showError("Debes aceptar al menos un medio de pago.");
      return;
    }
    setIsSavingMpConfig(true);
    try {
      const excludedPaymentTypes = MP_EXCLUDABLE_PAYMENT_TYPES.map((t) => t.id).filter((id) => !acceptedTypes.includes(id));
      const result = await updateMercadoPagoPaymentConfigAction(maxInstallments, excludedPaymentTypes);
      if (!result.success) {
        playError();
        showError(result.error);
        return;
      }
      setMpMaxInstallments(maxInstallments);
      setMpExcludedPaymentTypes(excludedPaymentTypes);
      setShowMpConfigModal(false);
      playSuccess();
      showSuccess("Configuracion de cobro guardada");
    } catch (e) {
      playError();
      showError(e instanceof Error ? e.message : "Error al guardar la configuracion de cobro");
    } finally {
      setIsSavingMpConfig(false);
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
      className="space-y-8 pb-20"
    >
      {/* Header */}
      <div>
        <h1 className="text-4xl sm:text-5xl text-gray-900 dark:text-white leading-none lowercase pt-2" style={{ fontFamily: "var(--font-borel), cursive", letterSpacing: "-0.07em" }}>Negocio</h1>
        <p className="mt-1.5 text-[13px] text-zinc-400 dark:text-zinc-500">Información pública y configuración técnica de tu local</p>
        <div className="mt-8 flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
            <Link
              id="setup-staff"
              href={withDashboardBase("/dashboard/staff", dashboardBasePath)}
              className="group flex items-center gap-3 py-3 px-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 shrink-0">
                <Users className="w-[18px] h-[18px] text-zinc-500 dark:text-zinc-400" />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 dark:text-white">Gestionar {staffPlural.toLowerCase()}</span>
                <span className="text-xs text-zinc-400 mt-0.5">Agregar, horarios y perfiles</span>
              </div>
            </Link>
            <Link
              id="setup-services"
              href={withDashboardBase("/dashboard/services", dashboardBasePath)}
              className="group flex items-center gap-3 py-3 px-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 shrink-0">
                <Scissors className="w-[18px] h-[18px] text-zinc-500 dark:text-zinc-400" />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 dark:text-white">Gestionar {servicePlural.toLowerCase()}</span>
                <span className="text-xs text-zinc-400 mt-0.5">Precios, duración y personal</span>
              </div>
            </Link>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setShowCreateShopModal(true)}
              disabled={!isOwnerOrAdmin || creatingShop}
              className="group flex items-center gap-3 py-3 px-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors w-full text-left disabled:opacity-40"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 shrink-0">
                <Plus className="w-[18px] h-[18px] text-zinc-500 dark:text-zinc-400" />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {creatingShop ? "Creando..." : "Crear nuevo local"}
                </span>
                <span className="text-xs text-zinc-400 mt-0.5">Agregar sucursal</span>
              </div>
            </button>
          </div>
        </div>
      </div>

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

      <div className="flex flex-col gap-8">
      {/* Card: Información Pública */}
      <form id="setup-public-info" onSubmit={handleSavePublicInfo} className="order-2">
        <div className="rounded-[2rem] border border-zinc-100 dark:border-zinc-800/50 transition-colors bg-white dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setShowPublicInfo((v) => !v)}
            className="w-full px-6 py-6 flex items-center gap-3 text-left"
          >
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Información Pública</h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Estos datos se muestran en tu página de reservas</p>
            </div>
          </button>
          <AnimatePresence initial={false}>
            {showPublicInfo && (
              <motion.div
                key="public-info-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-8 space-y-5">
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </form>

      <section className="order-5 max-sm:w-full max-sm:rounded-none max-sm:border-x-0 rounded-[2rem] border border-zinc-100 dark:border-zinc-800/50 transition-colors bg-white dark:bg-zinc-900 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowThemeCard((v) => !v)}
          className="w-full px-6 py-6 flex items-center gap-3 text-left"
        >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Personalizar mi tienda</h2>
                {showThemeCard && <InfoTooltip text="Elegí un diseño visual y personalizá los textos que se muestran en tu tienda online. Hacé clic sobre cualquier texto para editarlo directamente." />}
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Selecciona template y textos principales</p>
            </div>
        </button>

        <AnimatePresence initial={false}>
          {showThemeCard && (
            <motion.div
              key="theme-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="p-6">
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
                  services={previewServices}
                  sectionCatalog={sectionCatalog}
                  onServiceMove={moveServiceToSection}
                  onServiceReorder={handleServiceReorder}
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

                <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2 mb-4">
                    <Settings2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Flujo de la reserva</h3>
                    <div className="flex-1" />
                    <InfoTooltip text="Activá o desactivá las opciones que ve el cliente durante la reserva. Los pasos apagados se ocultan automáticamente." />
                  </div>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                    Estos son los pasos que verá tu cliente al reservar. Encendé o apagá los que quieras mostrar.
                  </p>

                  {/* Switch 1: asignar profesional después */}
                  <div
                    id="assign-staff-later"
                    className="rounded-2xl border bg-white dark:bg-zinc-900 p-5 space-y-3 transition-all duration-300 border-white/20 dark:border-white/10"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Elegir profesional después de la reserva</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                          Al activarlo, el cliente reserva sin elegir profesional y el turno queda &quot;sin asignar&quot;. Después lo asignás vos desde el calendario.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={assignStaffLater}
                        onClick={() => { if (isOwnerOrAdmin) void handleAssignStaffLaterChange(!assignStaffLater); }}
                        disabled={!isOwnerOrAdmin || assignStaffLaterSaving}
                        className={`relative w-12 h-7 rounded-full transition-colors duration-200 shrink-0 ${
                          assignStaffLater ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-700"
                        } ${!isOwnerOrAdmin ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                      >
                        <span
                          className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${
                            assignStaffLater ? "left-6" : "left-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Switch 2: tienda de productos online */}
                  <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-5 space-y-3 transition-all duration-300 border-white/20 dark:border-white/10 mt-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Tienda de productos online</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                          {hasStoreProducts
                            ? "Mostrá productos para la venta en tu tienda online. El cliente podrá sumarlos a su reserva."
                            : "Agregá al menos un producto para la venta desde Inventario para activar la tienda online."}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={storeEnabledState}
                        onClick={() => { if (isOwnerOrAdmin && hasStoreProducts) void handleStoreToggle(!storeEnabledState); }}
                        disabled={!isOwnerOrAdmin || storeSaving || !hasStoreProducts}
                        className={`relative w-12 h-7 rounded-full transition-colors duration-200 shrink-0 ${
                          storeEnabledState ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-700"
                        } ${!isOwnerOrAdmin || !hasStoreProducts ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                      >
                        <span
                          className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${
                            storeEnabledState ? "left-6" : "left-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Diagrama de pasos */}
                  <div className="mt-5">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 uppercase tracking-wide">Pasos de la reserva</p>
                    <div className="flex flex-wrap items-center gap-y-2">
                      {buildFlowSteps(initialServices.length, staffCount, assignStaffLater, storeEnabledState, hasStoreProducts, payAtShop).map((step, idx) => (
                        <span key={step.label} className="inline-flex items-center">
                          {idx > 0 && (
                            <ArrowRight className="w-4 h-4 mx-1.5 text-zinc-300 dark:text-zinc-600 shrink-0" strokeWidth={2.5} />
                          )}
                          <FlowStepChip step={step} />
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2">
                      Los pasos en gris se ocultan automáticamente del flujo según tu configuración.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ConfirmDialog
          open={storeConfirmOpen}
          title="Apagar tienda online"
          message="Se va a quitar el paso y el botón de tienda del flujo de reservas (/book). Los productos no se borran: podés volver a activarla cuando quieras."
          danger
          onCancel={() => setStoreConfirmOpen(false)}
          onConfirm={handleStoreTurnOffConfirmed}
        />
      </section>

      {/* Card: Configuración Técnica */}
      <div id="setup-payments" className="order-4 rounded-[2rem] border border-zinc-100 dark:border-zinc-800/50 transition-colors bg-white dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setShowPaymentsCard((v) => !v)}
          className="w-full px-6 py-6 flex items-center gap-3 text-left"
        >
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Forma de cobro</h2>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Mercado Pago, seña online y mensaje automático</p>
          </div>
        </button>
        <AnimatePresence initial={false}>
          {showPaymentsCard && (
            <motion.div
              key="payments-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="p-6 space-y-6">

          {canManageBilling ? (
          <div className="space-y-6">

            {/* Two-column payment methods */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Mercado Pago card */}
              <div
                role={isOwnerOrAdmin && !payAtShop && !data?.mp_oauth_connected ? "button" : undefined}
                tabIndex={isOwnerOrAdmin && !payAtShop && !data?.mp_oauth_connected ? 0 : -1}
                aria-disabled={!isOwnerOrAdmin || payAtShop || !!data?.mp_oauth_connected}
                onClick={() => {
                  if (!isOwnerOrAdmin) return;
                  if (payAtShop) { goToTimingSelector(); return; }
                  if (!data?.mp_oauth_connected) handleConnectMercadoPago();
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  if (!isOwnerOrAdmin) return;
                  e.preventDefault();
                  if (payAtShop) { goToTimingSelector(); return; }
                  if (!data?.mp_oauth_connected) handleConnectMercadoPago();
                }}
                className={`relative flex flex-col rounded-2xl border border-white/20 dark:border-white/10 bg-white dark:bg-zinc-900 p-5 transition-opacity ${
                  payAtShop
                    ? "opacity-40 cursor-default"
                    : data?.mp_oauth_connected
                      ? "opacity-100"
                      : isOwnerOrAdmin
                        ? "opacity-60 cursor-pointer hover:opacity-80"
                        : "opacity-40 cursor-default"
                }`}
              >
                {data?.mp_oauth_connected && !payAtShop && (
                  <button
                    type="button"
                    onClick={openMpConfigModal}
                    disabled={!isOwnerOrAdmin}
                    title="Configurar cobros"
                    className="absolute top-4 right-4 p-2 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  >
                    <Settings2 className="w-5 h-5" />
                  </button>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800">
                    <CreditCard className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Mercado Pago</h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Cobro online automatico</p>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden">
                  {!payAtShop && (
                  <div className="space-y-3" onClick={bankTransferEnabled ? (e) => e.stopPropagation() : undefined}>
                      {data?.mp_oauth_connected ? (
                        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            <p className="text-xs text-zinc-600 dark:text-zinc-300">Cuenta vinculada y lista para cobrar</p>
                          </div>
                          <button
                            type="button"
                            onMouseDown={playClick}
                            onClick={(e) => { e.stopPropagation(); handleDisconnectMercadoPago(); }}
                            disabled={!isOwnerOrAdmin || isDisconnectingMp}
                            className="text-xs text-zinc-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
                          >
                            {isDisconnectingMp ? "Desconectando..." : "Desconectar cuenta"}
                          </button>
                        </div>
                      ) : (
                        <div className="h-[42px]" aria-hidden="true" />
                      )}
                    </div>
                  )}
                </div>

                {/* Overlay: desactivada pero activable, o bloqueada por cobro en local */}
                {(!data?.mp_oauth_connected || payAtShop) && (
                  <div
                    className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-2xl px-4 text-center transition-colors ${
                      payAtShop || !isOwnerOrAdmin || data?.mp_oauth_connected
                        ? "bg-white/70 dark:bg-zinc-900/70"
                        : "bg-white/60 dark:bg-zinc-900/60 hover:bg-white/40 dark:hover:bg-zinc-900/40"
                    }`}
                  >
                    {payAtShop ? (
                      <>
                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Desactivado por cobro en el local</p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Click para cambiar el metodo de cobro</p>
                      </>
                    ) : (
                      <>
                        <Link2 className="w-4 h-4 mb-0.5 text-zinc-500 dark:text-zinc-400" />
                        <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Click para conectar</p>
                      </>
                    )}
                  </div>
                )}

                {/* Pros / Cons */}
                <div className="mt-auto space-y-1.5 pt-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400">Cobro automatico</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400">Comision del ~7% por operacion</span>
                  </div>
                </div>
              </div>

              {/* Transferencia card */}
              <div
                role="button"
                tabIndex={isOwnerOrAdmin ? 0 : -1}
                aria-disabled={!isOwnerOrAdmin}
                onClick={() => {
                  if (!isOwnerOrAdmin) return;
                  if (payAtShop) { goToTimingSelector(); return; }
                  setBankTransferEnabled(!bankTransferEnabled);
                  if (!bankTransferEnabled) { setPayAtShop(false); setBookingDepositEnabled(true); }
                }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                className={`relative flex flex-col rounded-2xl border border-white/20 dark:border-white/10 bg-white dark:bg-zinc-900 p-5 text-left transition-all duration-200 hover:border-zinc-300 dark:hover:border-zinc-600 ${
                  payAtShop
                    ? "opacity-40 cursor-default"
                    : bankTransferEnabled
                      ? "opacity-100 cursor-pointer"
                      : isOwnerOrAdmin
                        ? "opacity-60 cursor-pointer hover:opacity-80"
                        : "opacity-40 cursor-default"
                }`}
              >
                {bankTransferEnabled && (
                  <CheckCircle2 className="absolute top-4 right-4 w-5 h-5 text-zinc-900 dark:text-white" />
                )}

                {/* Overlay: desactivada pero activable, o bloqueada por cobro en local */}
                {!bankTransferEnabled && (
                  <div
                    className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-2xl px-4 text-center transition-colors ${
                      payAtShop || !isOwnerOrAdmin
                        ? "bg-white/70 dark:bg-zinc-900/70"
                        : "bg-white/60 dark:bg-zinc-900/60 hover:bg-white/40 dark:hover:bg-zinc-900/40"
                    }`}
                  >
                    {payAtShop ? (
                      <>
                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Desactivado por cobro en el local</p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Click para cambiar el metodo de cobro</p>
                      </>
                    ) : (
                      <>
                        <Landmark className="w-4 h-4 mb-0.5 text-zinc-500 dark:text-zinc-400" />
                        <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Click para activar</p>
                      </>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800">
                    <Landmark className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Transferencia</h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Pago por CVU, CBU o alias</p>
                  </div>
                </div>

                <div className="flex-1">
                  <div className="space-y-3" onClick={bankTransferEnabled ? (e) => e.stopPropagation() : undefined} onKeyDown={(e) => { if (bankTransferEnabled) e.stopPropagation(); }}>
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Alias / CVU / CBU</label>
                      <input
                        type="text"
                        value={bankCvuCb}
                        onChange={(e) => setBankCvuCb(e.target.value)}
                        disabled={!isOwnerOrAdmin || !bankTransferEnabled}
                        placeholder="Ej: mi.negocio.mp"
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500/30 transition-all disabled:opacity-50 cursor-text"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Nombre del titular de cuenta</label>
                        <input
                          type="text"
                          value={bankAlias}
                          onChange={(e) => setBankAlias(e.target.value)}
                          disabled={!isOwnerOrAdmin || !bankTransferEnabled}
                          placeholder="Ej: María López"
                          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500/30 transition-all disabled:opacity-50 cursor-text"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Banco</label>
                        <input
                          type="text"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          disabled={!isOwnerOrAdmin || !bankTransferEnabled}
                          placeholder="Ej: Mercado Pago"
                          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500/30 transition-all disabled:opacity-50 cursor-text"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pros / Cons */}
                <div className="mt-auto space-y-1.5 pt-2">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400">Requiere confirmacion manual</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-400">Sin comisiones</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Payment timing selector */}
            <div
              id="payment-timing"
              className={`rounded-2xl border bg-white dark:bg-zinc-900 p-5 space-y-3 transition-all duration-300 ${
                highlightTiming
                  ? "border-amber-400 ring-2 ring-amber-400/60"
                  : "border-white/20 dark:border-white/10"
              }`}
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Cuando se cobra</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-1">Defini si el cliente paga al reservar, al finalizar, o en el local.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Seña online */}
                <button
                  type="button"
                  onClick={() => { if (isOwnerOrAdmin) { setPayAtShop(false); setBookingDepositEnabled(true); } }}
                  disabled={!isOwnerOrAdmin}
                  className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.97] ${
                    !payAtShop && bookingDepositEnabled
                      ? "border-zinc-900 dark:border-white bg-zinc-50 dark:bg-zinc-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.3)]"
                      : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md"
                  } ${!isOwnerOrAdmin ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                >
                  {!payAtShop && bookingDepositEnabled && (
                    <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-zinc-900 dark:text-white" />
                  )}
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Cobrar sena online</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">El cliente paga una sena al reservar</p>
                  {!payAtShop && bookingDepositEnabled && (
                    <div className="mt-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">$</span>
                      <input
                        type="number"
                        min={0}
                        value={bookingDepositAmount}
                        onChange={(e) => setBookingDepositAmount(e.target.value)}
                        disabled={!isOwnerOrAdmin}
                        className="w-24 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 px-2 py-1 text-sm text-center text-gray-900 dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-zinc-500/30"
                        placeholder="3000"
                      />
                    </div>
                  )}
                </button>

                {/* Total online */}
                <button
                  type="button"
                  onClick={() => { if (isOwnerOrAdmin) { setPayAtShop(false); setBookingDepositEnabled(false); } }}
                  disabled={!isOwnerOrAdmin}
                  className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.97] ${
                    !payAtShop && !bookingDepositEnabled
                      ? "border-zinc-900 dark:border-white bg-zinc-50 dark:bg-zinc-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.3)]"
                      : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md"
                  } ${!isOwnerOrAdmin ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                >
                  {!payAtShop && !bookingDepositEnabled && (
                    <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-zinc-900 dark:text-white" />
                  )}
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Cobrar total online</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">El cliente paga el total al reservar</p>
                </button>

                {/* En local */}
                <button
                  type="button"
                  onClick={() => { if (isOwnerOrAdmin) { setPayAtShop(true); setBookingDepositEnabled(false); setBankTransferEnabled(false); } }}
                  disabled={!isOwnerOrAdmin}
                  className={`group relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.97] ${
                    payAtShop
                      ? "border-zinc-900 dark:border-white bg-zinc-50 dark:bg-zinc-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),0_4px_12px_rgba(0,0,0,0.3)]"
                      : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md"
                  } ${!isOwnerOrAdmin ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                >
                  {payAtShop && (
                    <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-zinc-900 dark:text-white" />
                  )}
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Cobrar en local</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">El cliente paga presencialmente</p>
                </button>
              </div>
            </div>

          </div>
          ) : (
            <div className="rounded-2xl border border-amber-200/60 bg-amber-50/70 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
              Solo el owner del local puede conectar Mercado Pago y gestionar facturacion.
            </div>
          )}

        </div>
              </motion.div>
            )}
          </AnimatePresence>
      </div>

      <div className="order-1 lg:grid lg:grid-cols-2 gap-6">
        {/* Card: Horarios de Atención */}
        <div id="setup-hours" className="rounded-[2rem] border border-zinc-100 dark:border-zinc-800/50 transition-colors bg-white dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setShowHoursCard((v) => !v)}
            className="w-full px-6 py-6 flex items-center gap-3 text-left"
          >
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Horarios de Atención</h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">Días y horarios de apertura del local</p>
            </div>
          </button>
          <AnimatePresence initial={false}>
            {showHoursCard && (
              <motion.div
                key="hours-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
              <div className="p-4">
            {hoursLoading ? (
              <div className="py-8 text-center text-sm text-zinc-400">Cargando horarios...</div>
            ) : businessHours ? (
              <>
                <div className="space-y-1">
                {DAYS.map((day) => {
                  const h = businessHours[day.key];
                  if (!h) return null;
                  return (
                    <div
                      key={day.key}
                      onClick={() => isOwnerOrAdmin && setBusinessHours({ ...businessHours, [day.key]: { ...h, open: !h.open } })}
                      className="flex flex-wrap items-center gap-3 py-3 px-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <p className={`text-sm font-medium min-w-[64px] ${h.open ? "text-gray-900 dark:text-white" : "text-zinc-400 dark:text-zinc-500"}`}>
                        {day.label}
                      </p>
                      <div className={`flex flex-wrap items-center gap-2 transition-all duration-200 pointer-events-none ${h.open ? "opacity-100" : "opacity-25"}`}>
                        <div className="pointer-events-auto">
                          <input
                            type="time"
                            value={h.start}
                            disabled={!isOwnerOrAdmin || !h.open}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, start: e.target.value } })}
                            className="rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
                          />
                        </div>
                        <span className="hidden sm:inline text-xs text-zinc-400">→</span>
                        <div className="pointer-events-auto">
                          <input
                            type="time"
                            value={h.end}
                            disabled={!isOwnerOrAdmin || !h.open}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, end: e.target.value } })}
                            className="rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
                          />
                        </div>

                        <div className="pointer-events-auto">
                          <button
                            type="button"
                            disabled={!isOwnerOrAdmin || !h.open}
                            onClick={(e) => {
                              e.stopPropagation();
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
                        </div>

                        {h.break_start && h.break_end && (
                          <>
                            <span className="hidden sm:inline text-xs text-zinc-400">Corte</span>
                            <div className="pointer-events-auto">
                              <input
                                type="time"
                                value={h.break_start}
                                disabled={!isOwnerOrAdmin || !h.open}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, break_start: e.target.value } })}
                                className="rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
                              />
                            </div>
                            <span className="hidden sm:inline text-xs text-zinc-400">→</span>
                            <div className="pointer-events-auto">
                              <input
                                type="time"
                                value={h.break_end}
                                disabled={!isOwnerOrAdmin || !h.open}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setBusinessHours({ ...businessHours, [day.key]: { ...h, break_end: e.target.value } })}
                                className="rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-40 [color-scheme:light] dark:[color-scheme:dark] w-[102px] disabled:cursor-not-allowed cursor-pointer"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
                <p className="mt-2 px-1 text-xs text-zinc-400 dark:text-zinc-500">El corte es un descanso: durante ese horario no se aceptan turnos.</p>
              </>
            ) : (
              <div className="py-8 text-center text-sm text-red-500">Error al cargar horarios</div>
            )}
          </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Card: Feriados y Excepciones */}
        <div className="rounded-[2rem] border border-zinc-100 dark:border-zinc-800/50 transition-colors bg-white dark:bg-zinc-900">
          <div className="flex items-center px-6 py-5 gap-3">
            <button
              type="button"
              onClick={() => setShowHolidaysCard((v) => !v)}
              className="flex items-center gap-3 flex-1 text-left cursor-pointer"
            >
              <div className="p-2 rounded-full bg-amber-500/15 shrink-0">
                <Calendar className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Feriados y Excepciones</h2>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">Cierres totales o horarios reducidos para dias puntuales</p>
              </div>
            </button>
            {isOwnerOrAdmin && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openNewOverride(); }}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium px-4 py-2 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Agregar
              </button>
            )}
          </div>
          <AnimatePresence initial={false}>
            {showHolidaysCard && (
              <motion.div
                key="holidays-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
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
                        {o.is_closed ? "Cerrado todo el día" : `${o.start_time} a ${o.end_time}${o.break_start && o.break_end ? ` (corte ${o.break_start}-${o.break_end})` : ""}`}
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <BaseModal
        open={showOverrideModal}
        onClose={() => setShowOverrideModal(false)}
        title={editOverride ? "Editar excepción" : "Nueva excepción"}
        maxWidth="sm"
      >
        <div className="p-5 space-y-4">
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
          <p className={`text-xs leading-relaxed ${overrideIsClosed ? "text-red-500 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
            {overrideIsClosed
              ? "Nadie podrá reservar ese día. No se muestra ningún horario."
              : "Solo se reserva en ese horario. Ej: 9 a 11 = turnos de 9 a 11."}
          </p>
          {!overrideIsClosed && (
            <>
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (overrideBreakStart && overrideBreakEnd) {
                      setOverrideBreakStart("");
                      setOverrideBreakEnd("");
                    } else {
                      setOverrideBreakStart("12:00");
                      setOverrideBreakEnd("13:00");
                    }
                  }}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                    overrideBreakStart && overrideBreakEnd
                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {overrideBreakStart && overrideBreakEnd ? "Quitar corte" : "+ Agregar corte"}
                </button>
              </div>
              {overrideBreakStart && overrideBreakEnd && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Corte desde</label>
                    <input
                      type="time"
                      value={overrideBreakStart}
                      onChange={(e) => setOverrideBreakStart(e.target.value)}
                      className="w-full rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Corte hasta</label>
                    <input
                      type="time"
                      value={overrideBreakEnd}
                      onChange={(e) => setOverrideBreakEnd(e.target.value)}
                      className="w-full rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              )}
            </>
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
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button type="button" onClick={() => setShowOverrideModal(false)} className="ui-btn-ghost rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
          <button type="button" onClick={handleSaveOverride} className="ui-btn-primary rounded-lg px-4 py-2 text-sm font-medium">Guardar</button>
        </div>
      </BaseModal>

      <BaseModal
        open={showMpConfigModal}
        onClose={() => setShowMpConfigModal(false)}
        title="Cobros con Mercado Pago"
        subtitle="Configura cuotas y medios de pago"
        maxWidth="sm"
        icon={<Settings2 className="w-5 h-5" />}
      >
        <div className="p-5 space-y-5">
          <div className="rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/60 px-4 py-3">
            <p className="text-xs text-sky-800 dark:text-sky-200 leading-relaxed">
              Cada pago tiene una comision: las tarjetas de credito son las mas caras y el saldo en cuenta, el mas barato. El plazo para recibir el dinero se elige en tu cuenta de Mercado Pago.
            </p>
            <a
              href="https://www.mercadopago.com.ar/ayuda/costo-recibir-pagos_220"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1 text-xs text-sky-800 dark:text-sky-200 font-medium underline underline-offset-2 hover:opacity-80"
            >
              Ver planes de cobro
            </a>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">¿Hasta cuantas cuotas?</label>
            <select
              value={draftMaxInstallments ?? ""}
              onChange={(e) => setDraftMaxInstallments(e.target.value === "" ? null : Number(e.target.value))}
              disabled={!isOwnerOrAdmin}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-500/30 disabled:opacity-50"
            >
              <option value="">Sin limite (recomendado)</option>
              <option value={1}>1 cuota</option>
              <option value={3}>Hasta 3 cuotas</option>
              <option value={6}>Hasta 6 cuotas</option>
              <option value={12}>Hasta 12 cuotas</option>
            </select>
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">¿Que medios de pago aceptas?</p>
            <div className="space-y-2">
              {MP_EXCLUDABLE_PAYMENT_TYPES.map((t) => {
                const checked = draftAcceptedTypes.includes(t.id);
                return (
                  <label key={t.id} className="flex items-center gap-2.5 cursor-pointer rounded-xl border border-zinc-200 dark:border-zinc-700 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setDraftAcceptedTypes((prev) =>
                          e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                        )
                      }
                      disabled={!isOwnerOrAdmin}
                      className="rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-white focus:ring-zinc-500/30 disabled:opacity-50"
                    />
                    <span className="text-sm text-gray-900 dark:text-white">{t.label}</span>
                    <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">{t.hint}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Comisiones aproximadas; dependen del plan de cobro de tu cuenta de Mercado Pago.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button type="button" onClick={() => setShowMpConfigModal(false)} className="ui-btn-ghost rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
          <button
            type="button"
            onClick={() => handleSaveMpPaymentConfig(draftMaxInstallments, draftAcceptedTypes)}
            disabled={!isOwnerOrAdmin || isSavingMpConfig}
            className="ui-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {isSavingMpConfig ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </BaseModal>

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
      <div className="rounded-[2rem] border border-zinc-100 dark:border-zinc-800/50 transition-colors bg-white dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setShowCommsCard((v) => !v)}
          className="w-full px-6 py-6 flex items-center gap-3 text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Comunicaciones con los clientes</h2>
              {showCommsCard && <InfoTooltip text="Al editar las plantillas, los nuevos mensajes de WhatsApp que se envíen automáticamente usarán el texto personalizado. Las etiquetas (@Nombre, @Servicio, etc.) se reemplazarán con los datos reales de cada turno o voucher." />}
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Personalizá los mensajes que reciben tus clientes</p>
          </div>
        </button>
        <AnimatePresence initial={false}>
          {showCommsCard && (
            <motion.div
              key="comms-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
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
              </motion.div>
            )}
          </AnimatePresence>
      </div>

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
            className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium shadow-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 cursor-pointer select-none transition-opacity duration-200"
          >
            {isSaving ? (
              <>
                <svg className="force-spin animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
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
              className="ui-btn-primary inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium"
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
      />

      <CloseShopModal
        isOpen={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        confirmText={closeConfirm}
        onConfirmTextChange={setCloseConfirm}
        onConfirm={handleCloseShop}
        pending={isDeleting}
      />

      <p className="text-xs text-center text-zinc-400 dark:text-zinc-600 pt-2">
        Los tokens de Mercado Pago se almacenan de forma segura en la base de datos.
      </p>
    </motion.div>
  );
}
