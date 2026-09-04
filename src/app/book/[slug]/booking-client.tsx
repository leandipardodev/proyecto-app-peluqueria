"use client";

import { useEffect, useMemo, useState, memo, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  ExternalLink,
  Info,
  Landmark,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Minus,
  Package,
  Phone,
  Plus,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserRound,
  X,
  ZoomIn,
} from "lucide-react";
import { initMercadoPago } from "@mercadopago/sdk-react";
import { fetchPublicAvailableSlots, createPublicAppointment, createPublicComboAppointment, deletePublicAppointment, fetchPublicShopDateOverrides } from "@/lib/dashboard/booking/public-booking-actions";
import type { PublicStoreProduct } from "@/lib/dashboard/store/public-store-actions";
import { productColor } from "@/lib/dashboard/store/product-color";
import QRCode from "qrcode";
import GoogleSignInButton from "@/components/auth/google-sign-in-button";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { resolveTemplate, type BookingTheme } from "./booking-themes";
import { toArgentinaLocalIsoString } from "@/lib/argentina-time";
import { InstagramIcon, WhatsappIcon } from "./booking-icons";
import type { Industry } from "@/lib/industry/types";
import type { BookingTemplateId } from "@/lib/booking/theme-presets";

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
  WEEKDAY_KEYS,
  formatDate,
  formatDisplayDate,
  parseHHmmToMinutes,
  to24HourTimeLabel,
  formatTimeFromIso,
  warmAudio,
  playSuccessSound,
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
    assignStaffLater: boolean;
    businessHours?: Record<string, { open: boolean }> | null;
    bankTransferEnabled: boolean;
    bookingDepositEnabled: boolean;
    bookingDepositAmount: number;
    bankCvuCb: string;
    bankAlias: string;
    bankName: string;
    logoUrl: string;
    heroTitle: string;
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
  storeEnabled?: boolean;
  storeProducts?: PublicStoreProduct[];
  storeError?: string | null;
  status?: string | null;
  orderId?: string | null;
  initialStep?: string | null;
}

function pushCard3D(e: React.PointerEvent<HTMLDivElement | HTMLButtonElement>) {
  const card = e.currentTarget;
  const rect = card.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
  const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  card.style.transform = `perspective(800px) rotateX(${-y * 14}deg) rotateY(${x * 14}deg) scale(0.97)`;
  card.style.transition = 'transform 0.08s cubic-bezier(0.16,1,0.3,1)';
}

function formatARSAmount(amount: number): string {
  return `$${amount.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function releaseCard3D(e: React.PointerEvent<HTMLDivElement | HTMLButtonElement>) {
  const card = e.currentTarget;
  card.style.transform = '';
  card.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1)';
}

function getRippleRect(el: HTMLElement): { left: number; top: number; width: number; height: number } {
  const container = el.closest(".overflow-hidden") ?? el.parentElement;
  return container?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
}

type RipplePosition = { x: number; y: number; size: number };

const RippleWaves = memo(function RippleWaves({ position, colors }: {
  position?: RipplePosition;
  colors: string[];
}) {
  if (!position) {
    return <span className="absolute inset-0 pointer-events-none z-0" style={{ background: colors[colors.length - 1] }} />;
  }
  return (
    <>
      {colors.map((color, i) => (
        <motion.span
          key={`w${i}`}
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 1, opacity: i < colors.length - 1 ? 0 : 1 }}
          transition={{ duration: 1.5, ease: [0.25, 1, 0.08, 1], delay: i * 0.08, opacity: { duration: 0.5, delay: i * 0.08 + 0.25, ease: "easeInOut" } }}
          className="absolute rounded-full pointer-events-none z-0"
          style={{
            left: position.x - position.size / 2,
            top: position.y - position.size / 2,
            width: position.size,
            height: position.size,
            background: color,
          }}
        />
      ))}
    </>
  );
});

const ServiceCard = memo(function ServiceCard({
  svc, isInCart, cartIdx, cartLength, ripplePosition, waves,
  cardDepth, selected, plain, plate, hoverBorder, heading, tiny, priceText, priceFx, selectedText, accentBg, progressFill,
  tactileClass, onToggle,
}: {
  svc: Service;
  isInCart: boolean;
  cartIdx: number;
  cartLength: number;
  ripplePosition?: RipplePosition;
  waves: string[];
  cardDepth: string;
  selected: string;
  plain: string;
  plate: string;
  hoverBorder: string;
  heading: string;
  tiny: string;
  priceText: string;
  priceFx: string;
  selectedText: string;
  accentBg: string;
  progressFill: string;
  tactileClass: string;
  onToggle: (svc: Service, e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <motion.div
      role="option"
      aria-selected={isInCart}
      onPointerDown={pushCard3D}
      onPointerUp={releaseCard3D}
      onPointerLeave={releaseCard3D}
      className={`relative w-full rounded-3xl border-2 transition-[transform,box-shadow] duration-200 ${cardDepth} ${isInCart ? `${selected} border-transparent` : `${plain} ${plate} ${hoverBorder}`}`}
      style={{ scrollSnapAlign: "start" }}
    >
      <div className="overflow-hidden rounded-3xl relative">
        {isInCart && <RippleWaves position={ripplePosition} colors={waves} />}
        {isInCart && (
          <div
            className="absolute inset-0 rounded-3xl pointer-events-none z-[2]"
            style={{ boxShadow: `inset 0 0 10px 1px ${selectedText}20, 0 0 10px 1px ${selectedText}12` } as React.CSSProperties}
          />
        )}
        <button
          type="button"
          onClick={(e) => onToggle(svc, e)}
          draggable={false}
          className={`w-full px-5 py-4 text-left relative z-10 outline-none focus:outline-none focus-visible:outline-none ${tactileClass}`}
          style={isInCart ? { color: selectedText } as React.CSSProperties : undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className={`text-lg font-medium break-words whitespace-normal text-left ${heading}`} style={isInCart ? { color: selectedText } as React.CSSProperties : undefined}>{svc.name}</p>
              {svc.description && (
                <p className={`mt-0.5 text-xs leading-relaxed overflow-hidden ${tiny}`} style={{
                  maxHeight: isInCart ? "300px" : "2.5em",
                  transition: "max-height 0.5s cubic-bezier(0.16,1,0.3,1)",
                  ...(isInCart ? { color: selectedText } as React.CSSProperties : {}),
                } as React.CSSProperties}>{svc.description}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className={`shrink-0 ${priceText} ${priceFx} tabular-nums`} style={isInCart ? { color: selectedText } as React.CSSProperties : undefined}>
                <span className="mr-1.5 align-top text-[0.72em] font-semibold opacity-85">$</span>
                <span className="tracking-[-0.045em]">{svc.price.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </p>
              <span
                className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none tabular-nums"
                style={{ backgroundColor: isInCart ? selectedText : accentBg, color: isInCart ? accentBg : selectedText } as React.CSSProperties}
              >
                <Clock className="w-3 h-3" strokeWidth={2} />
                {formatDuration(svc.duration_minutes)}
              </span>
            </div>
          </div>
        </button>
      </div>
      {cartIdx >= 0 && cartLength > 1 && (
        <span
          className={`absolute -right-3 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center min-w-6 h-6 rounded-full px-1.5 text-[11px] font-bold leading-none text-white tabular-nums ${progressFill} shadow-[0_4px_14px_rgba(0,0,0,0.35)] ring-2 ring-white/90 dark:ring-black/50`}
        >
          {cartIdx + 1}
        </span>
      )}
    </motion.div>
  );
});

const StaffCard = memo(function StaffCard({
  staff, isSelected, ripplePosition, waves,
  cardDepth, selected, plain, hoverBorder, heading, tiny, accent, plate, selectedText,
  tactileClass, onToggle,
}: {
  staff: StaffMember;
  isSelected: boolean;
  ripplePosition?: RipplePosition;
  waves: string[];
  cardDepth: string;
  selected: string;
  plain: string;
  hoverBorder: string;
  heading: string;
  tiny: string;
  accent: string;
  plate: string;
  selectedText: string;
  tactileClass: string;
  onToggle: (staff: StaffMember, e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const initials = staff.name.charAt(0).toUpperCase();
  return (
    <motion.div
      onPointerDown={pushCard3D}
      onPointerUp={releaseCard3D}
      onPointerLeave={releaseCard3D}
      className={`rounded-[14px] border-2 transition-[transform,box-shadow] duration-200 ${cardDepth} ${isSelected ? `${selected} border-transparent` : `${plain} ${hoverBorder}`}`}
    >
      <div className="overflow-hidden rounded-[14px] relative">
        {isSelected && <RippleWaves position={ripplePosition} colors={waves} />}
        {isSelected && (
          <div className="absolute inset-0 rounded-[14px] pointer-events-none z-[2]" style={{ boxShadow: `inset 0 0 10px 1px ${selectedText}20, 0 0 10px 1px ${selectedText}12` } as React.CSSProperties} />
        )}
        <button
          type="button"
          onClick={(e) => onToggle(staff, e)}
          draggable={false}
          className={`w-full px-5 py-6 text-left relative z-10 outline-none focus:outline-none focus-visible:outline-none ${tactileClass}`}
          style={isSelected ? { color: selectedText } as React.CSSProperties : undefined}
        >
          <div className="flex flex-col items-center text-center gap-3">
            <div className={`relative w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/30 shadow-xl flex items-center justify-center shrink-0 ${plate}`}>
              {staff.photo_url ? (
                <Image src={staff.photo_url} alt="" fill sizes="80px" className="object-cover" />
              ) : (
                <span className={`text-2xl font-bold ${accent}`}>{initials}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className={`text-lg font-semibold tracking-tight ${heading}`} style={isSelected ? { color: selectedText } as React.CSSProperties : undefined}>{staff.name}</p>
              {staff.description && (
                <p className={`text-xs leading-snug mt-1 line-clamp-2 ${tiny}`} style={isSelected ? { color: selectedText } as React.CSSProperties : undefined}>{staff.description}</p>
              )}
              {(staff.instagram || staff.whatsapp) && (
                <div className="flex items-center justify-center gap-3 mt-2">
                  {staff.instagram && (
                    <span className="text-xs flex items-center gap-1" style={isSelected ? { color: selectedText } as React.CSSProperties : undefined}>
                      <InstagramIcon />
                      {staff.instagram.startsWith("@") ? staff.instagram : `@${staff.instagram}`}
                    </span>
                  )}
                  {staff.whatsapp && (
                    <span className="text-xs flex items-center gap-1" style={isSelected ? { color: selectedText } as React.CSSProperties : undefined}>
                      <WhatsappIcon />
                      {staff.whatsapp}
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
});

function SelectionPill({ serviceCount, productCount, staff, noPreference, templateStyles, onTap }: {
  serviceCount: number;
  productCount: number;
  staff: StaffMember[];
  noPreference?: boolean;
  templateStyles: BookingTheme;
  onTap: () => void;
}) {
  const totalCount = serviceCount + productCount;
  const prevCount = useRef(totalCount);
  const [justChanged, setJustChanged] = useState(false);

  useEffect(() => {
    if (totalCount !== prevCount.current) {
      setJustChanged(true);
      prevCount.current = totalCount;
      const t = setTimeout(() => setJustChanged(false), 500);
      return () => clearTimeout(t);
    }
  }, [totalCount]);

  const displayStaff = staff.slice(0, 4);
  const overflow = staff.length > 4 ? staff.length - 4 : 0;

  if (totalCount === 0 && staff.length === 0 && !noPreference) return null;

  return (
    <motion.div
      layout
      onClick={onTap}
      initial={{ opacity: 0, scale: 0.8, y: -4 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: 0,
        borderRadius: ["1.25rem 0.5rem 1.25rem 0.5rem", "1rem 1rem 0.6rem 1.25rem", "1.25rem 0.5rem 1.25rem 0.5rem"],
      }}
      exit={{ opacity: 0, scale: 0.8, y: -4, transition: { duration: 0.15 } }}
      transition={{
        borderRadius: { duration: 6, repeat: Infinity, ease: "easeInOut" },
        default: { type: "spring", stiffness: 400, damping: 25, mass: 0.7 },
      }}
      className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer select-none ${templateStyles.plate} border ${templateStyles.hoverBorder} shadow-lg`}
    >
      {serviceCount > 0 && (
        <motion.div
          layout
          className={`flex items-center gap-1 text-[10px] font-semibold leading-none ${templateStyles.heading}`}
          animate={justChanged ? {
            x: [0, -2.5, 2.5, -1.5, 1.5, 0],
            transition: { duration: 0.35, ease: "easeInOut" },
          } : {}}
        >
          <Package className="w-3 h-3" />
          <AnimatePresence mode="popLayout">
            <motion.span
              key={serviceCount}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                transition: { type: "spring", stiffness: 600, damping: 14, mass: 0.35 },
              }}
              exit={{ scale: 0, opacity: 0, transition: { duration: 0.12 } }}
              className="tabular-nums"
            >
              {serviceCount}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      )}

      {productCount > 0 && (
        <motion.div
          layout
          className={`flex items-center gap-1 text-[10px] font-semibold leading-none ${templateStyles.heading}`}
          animate={justChanged ? {
            x: [0, -2.5, 2.5, -1.5, 1.5, 0],
            transition: { duration: 0.35, ease: "easeInOut" },
          } : {}}
        >
          <ShoppingBag className="w-3 h-3" />
          <AnimatePresence mode="popLayout">
            <motion.span
              key={productCount}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: 1,
                opacity: 1,
                transition: { type: "spring", stiffness: 600, damping: 14, mass: 0.35 },
              }}
              exit={{ scale: 0, opacity: 0, transition: { duration: 0.12 } }}
              className="tabular-nums"
            >
              {productCount}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      )}

      {totalCount > 0 && staff.length > 0 && (
        <div className={`w-px h-3 rounded-full ${templateStyles.line}`} />
      )}

      {noPreference ? (
        <motion.span layout className={`text-[10px] font-semibold leading-none ${templateStyles.heading}`}>
          Sin preferencia
        </motion.span>
      ) : staff.length > 0 && (
        <motion.div layout className="flex items-center -space-x-1.5">
          <AnimatePresence mode="popLayout">
            {displayStaff.map((s, i) => (
              <motion.div
                key={s.id}
                layout
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  transition: { type: "spring", stiffness: 550, damping: 16, mass: 0.35, delay: i * 0.06 },
                }}
                exit={{ scale: 0, opacity: 0, transition: { duration: 0.18, ease: "easeInOut" } }}
                className="w-5 h-5 rounded-full overflow-hidden ring-[1.5px] ring-white/30 flex items-center justify-center"
                style={{ zIndex: staff.length - i }}
              >
                {s.photo_url ? (
                  <Image src={s.photo_url} alt="" width={20} height={20} className="object-cover w-full h-full" />
                ) : (
                  <span className="text-[7px] font-bold leading-none">{s.name.charAt(0)}</span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {overflow > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-[9px] font-semibold ml-0.5"
            >
              +{overflow}
            </motion.span>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function SelectionSummary({ cart, selectedCombo, staff, noPreference, totalDuration, totalPrice, products, storeCart, onUpdateProductQty, onRemoveProduct, templateStyles, onClose }: {
  cart: Service[];
  selectedCombo: Combo | null;
  staff: StaffMember[];
  noPreference?: boolean;
  totalDuration: number;
  totalPrice: number;
  products: PublicStoreProduct[];
  storeCart: Record<string, number>;
  onUpdateProductQty: (productId: string, qty: number) => void;
  onRemoveProduct: (productId: string) => void;
  templateStyles: BookingTheme;
  onClose: () => void;
}) {
  const items = selectedCombo
    ? [{ id: selectedCombo.id, name: selectedCombo.name, duration: selectedCombo.total_duration, price: selectedCombo.price }]
    : cart.map(s => ({ id: s.id, name: s.name, duration: s.duration_minutes, price: s.price }));
  const storeItems = products.filter((p) => (storeCart[p.id] ?? 0) > 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-md" />
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 24 }}
        animate={{
          scale: 1, opacity: 1, y: 0,
          borderRadius: ["1.5rem 0.75rem 1.5rem 0.75rem", "1.25rem 1.25rem 0.85rem 1.5rem", "1.5rem 0.75rem 1.5rem 0.75rem"],
        }}
        exit={{ scale: 0.88, opacity: 0, y: 24, transition: { duration: 0.18 } }}
        transition={{
          borderRadius: { duration: 5, repeat: Infinity, ease: "easeInOut" },
          default: { type: "spring", stiffness: 400, damping: 28, mass: 0.8 },
        }}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-sm overflow-hidden ${templateStyles.shell}`}
      >
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold ${templateStyles.heading}`}>Resumen</span>
            <button type="button" onClick={onClose} className={`text-[10px] font-medium ${templateStyles.tiny} hover:opacity-70 transition-opacity`}>
              Cerrar
            </button>
          </div>

          {items.length > 0 || storeItems.length > 0 ? (
            <div className="space-y-2 max-h-56 overflow-y-auto delicate-scroll -mx-1 px-1">
              {items.length > 0 && (
                <p className={`text-[10px] uppercase tracking-wider font-semibold ${templateStyles.tiny}`}>Servicios</p>
              )}
              {items.map((item) => (
                <div key={item.id} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${templateStyles.plate}`}>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${templateStyles.heading}`}>{item.name}</p>
                    <p className={`text-[11px] mt-0.5 ${templateStyles.tiny}`}>{item.duration} min</p>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums shrink-0 ${templateStyles.priceText}`}>
                    ${item.price.toLocaleString("es-AR")}
                  </span>
                </div>
              ))}

              {storeItems.length > 0 && (
                <>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold ${templateStyles.tiny} pt-1`}>Productos</p>
                  {storeItems.map((product) => {
                    const qty = storeCart[product.id] ?? 0;
                    return (
                      <div key={product.id} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${templateStyles.plate}`}>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${templateStyles.heading}`}>{product.name}</p>
                          <p className={`text-[11px] mt-0.5 ${templateStyles.tiny}`}>${product.price.toLocaleString("es-AR")} c/u</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onUpdateProductQty(product.id, qty - 1)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-zinc-300 dark:border-zinc-600 cursor-pointer select-none active:scale-90 transition-transform"
                            aria-label="Quitar uno"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-5 text-center text-sm font-bold tabular-nums">{qty}</span>
                          <button
                            type="button"
                            onClick={() => qty < product.stock_quantity && onUpdateProductQty(product.id, qty + 1)}
                            disabled={qty >= product.stock_quantity}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-zinc-300 dark:border-zinc-600 cursor-pointer select-none active:scale-90 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Agregar uno"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveProduct(product.id)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-red-500 cursor-pointer select-none transition-colors"
                            aria-label="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          ) : null}

          <div className={`flex items-center justify-between pt-2 border-t ${templateStyles.line}`}>
            <span className={`text-xs ${templateStyles.tiny}`}>
              {items.length > 0 && `${items.length} ${items.length > 1 ? "servicios" : "servicio"}`}
              {items.length > 0 && storeItems.length > 0 && " + "}
              {storeItems.length > 0 && `${storeItems.length} producto${storeItems.length > 1 ? "s" : ""}`}
              {items.length > 0 && ` · ${totalDuration} min`}
            </span>
            <span className={`text-sm font-bold tabular-nums ${templateStyles.priceText} ${templateStyles.priceFx}`}>
              $ {totalPrice.toLocaleString("es-AR")}
            </span>
          </div>

          {noPreference ? (
            <div className="space-y-2">
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${templateStyles.tiny}`}>Profesional</span>
              <div className="flex flex-wrap gap-2">
                <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${templateStyles.plate}`}>
                  <span className={`text-xs font-medium ${templateStyles.heading}`}>Sin preferencia</span>
                </div>
              </div>
            </div>
          ) : staff.length > 0 && (
            <div className="space-y-2">
              <span className={`text-[10px] uppercase tracking-wider font-semibold ${templateStyles.tiny}`}>Profesional{staff.length > 1 ? "es" : ""}</span>
              <div className="flex flex-wrap gap-2">
                {staff.map(s => (
                  <div key={s.id} className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${templateStyles.plate}`}>
                    <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                      {s.photo_url ? (
                        <Image src={s.photo_url} alt="" width={20} height={20} className="object-cover w-full h-full" />
                      ) : (
                        <span className={`text-[9px] font-bold ${templateStyles.accent}`}>{s.name.charAt(0)}</span>
                      )}
                    </div>
                    <span className={`text-xs font-medium ${templateStyles.heading}`}>{s.name.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function StoreImageModal({ product, onClose }: { product: PublicStoreProduct; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.15 } }}
        transition={{ type: "spring", stiffness: 1520, damping: 52, mass: 0.8 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 inline-flex items-center justify-center w-9 h-9 rounded-full bg-white text-zinc-800 shadow-lg hover:scale-105 active:scale-95 transition-transform cursor-pointer"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="overflow-hidden rounded-2xl bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image_url ?? undefined} alt={product.name} className="w-full h-auto max-h-[70dvh] object-contain" />
        </div>
        <div className="mt-3 text-center">
          <p className="text-white font-semibold text-sm">{product.name}</p>
          <p className="text-white/60 text-xs mt-0.5">{formatARSAmount(product.price)}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StoreTab({ products, storeError, storeCart, status, orderId, updateProductQty, onShowImage, templateStyles }: {
  products: PublicStoreProduct[];
  storeError: string | null;
  storeCart: Record<string, number>;
  status: string | null;
  orderId: string | null;
  updateProductQty: (productId: string, quantity: number) => void;
  onShowImage: (product: PublicStoreProduct) => void;
  templateStyles: BookingTheme;
}) {
  const [expandedDesc, setExpandedDesc] = useState<string | null>(null);
  const storeScrollRef = useRef<HTMLDivElement>(null);
  const [storeAtTop, setStoreAtTop] = useState(true);
  const [storeCanScroll, setStoreCanScroll] = useState(false);

  useEffect(() => {
    const el = storeScrollRef.current;
    if (!el) return;
    setStoreCanScroll(el.scrollHeight > el.clientHeight + 4);
    setStoreAtTop(el.scrollTop <= 10);
  }, [products.length]);

  const banner = status
    ? status === "success"
      ? { tone: "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300", icon: <CheckCircle2 className="w-5 h-5 shrink-0" />, title: "¡Pago aprobado!", text: "Tu pedido fue confirmado. Te avisaremos cuando esté listo." }
      : status === "pending"
        ? { tone: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300", icon: <Info className="w-5 h-5 shrink-0" />, title: "Pago en proceso", text: "Estamos esperando la confirmación del pago." }
        : { tone: "bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300", icon: <AlertTriangle className="w-5 h-5 shrink-0" />, title: "El pago no se completó", text: "No se realizó ningún cobro. Podés intentar nuevamente." }
    : null;

  return (
    <div className="relative flex flex-col h-full min-h-0">
      {banner && (
        <div className={`mb-3 flex items-start gap-3 rounded-2xl border p-3.5 ${banner.tone}`}>
          {banner.icon}
          <div className="min-w-0">
            <p className="text-sm font-semibold">{banner.title}</p>
            <p className="text-xs opacity-90">{banner.text}</p>
            {orderId && <p className="text-xs opacity-80 mt-0.5">N° de pedido: {orderId}</p>}
          </div>
        </div>
      )}

      <div
        ref={storeScrollRef}
        onScroll={() => {
          const el = storeScrollRef.current;
          if (!el) return;
          setStoreAtTop(el.scrollTop <= 10);
          setStoreCanScroll(el.scrollHeight > el.clientHeight + 4);
        }}
        className="flex-1 overflow-y-auto overflow-x-hidden delicate-scroll pb-3 -mx-1 px-1"
      >
        {storeError ? (
          <div className={`text-sm px-4 py-3 rounded-2xl border ${templateStyles.errorBox}`}>{storeError}</div>
        ) : products.length === 0 ? (
          <div className="py-12 text-center">
            <div className={`flex items-center justify-center w-14 h-14 rounded-full ${templateStyles.plate} mx-auto`}>
              <ShoppingBag className={`w-6 h-6 ${templateStyles.accent}`} />
            </div>
            <p className={`mt-3 text-sm font-semibold ${templateStyles.heading}`}>La tienda está vacía</p>
            <p className={`mt-1 text-xs ${templateStyles.tiny}`}>No hay productos disponibles por ahora. Volvé pronto.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {products.map((product) => {
              const qty = storeCart[product.id] ?? 0;
              const soldOut = product.stock_quantity <= 0;
              const lowStock = !soldOut && product.stock_quantity < 5;
              const maxed = qty >= product.stock_quantity;
              const isExpanded = expandedDesc === product.id;
              return (
                <div
                  key={product.id}
                  className={`relative flex flex-col ${templateStyles.plain} ${templateStyles.cardDepth} rounded-2xl ${templateStyles.hoverBorder} overflow-hidden ${soldOut ? "opacity-55" : ""}`}
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/80 via-white/30 to-white/5 dark:from-white/[0.1] dark:via-white/[0.04] dark:to-transparent" />
                  <div className="relative h-44 w-full overflow-hidden">
                    {product.image_url ? (
                      <button
                        type="button"
                        onClick={() => onShowImage(product)}
                        className="group absolute inset-0 w-full h-full"
                        aria-label={`Ampliar imagen de ${product.name}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]" />
                        <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm opacity-0 scale-90 transition-all duration-300 group-hover:opacity-100 group-hover:scale-100">
                          <ZoomIn className="w-3.5 h-3.5" />
                          Ampliar
                        </span>
                      </button>
                    ) : (
                      <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${productColor(product.id)} text-white`}>
                        <Package className="w-12 h-12" />
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

                    <button
                      type="button"
                      onClick={() => setExpandedDesc(isExpanded ? null : product.id)}
                      className={`absolute inset-x-0 bottom-0 z-10 w-full text-left cursor-pointer select-none ${isExpanded ? "h-full" : ""}`}
                      aria-label={isExpanded ? "Ocultar descripción completa" : "Ver descripción completa"}
                    >
                      <div className={`flex flex-col justify-end ${isExpanded ? "h-full overflow-y-auto delicate-scroll p-3.5" : "px-3.5 pb-2.5 pt-12"}`}>
                        <h3 className={`text-sm font-bold text-white leading-tight drop-shadow ${isExpanded ? "" : "truncate"}`}>{product.name}</h3>
                        {product.description ? (
                          <>
                            <p className={`text-[11px] leading-snug text-white/90 ${isExpanded ? "" : "line-clamp-2"}`}>
                              {product.description}
                            </p>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/70 ${isExpanded ? "mt-2.5" : "mt-1"}`}>
                              {isExpanded ? (
                                <>
                                  <ChevronDown className="w-3 h-3 rotate-180" />
                                  Ver menos
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3 h-3" />
                                  Ver más
                                </>
                              )}
                            </span>
                          </>
                        ) : (
                          <p className="text-[11px] text-white/60 italic">Sin descripción</p>
                        )}
                      </div>
                    </button>

                    {soldOut && (
                      <span className="absolute top-2 left-2 z-10 rounded-full bg-zinc-900/80 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 backdrop-blur-sm">
                        Sin stock
                      </span>
                    )}
                    {lowStock && (
                      <span className="absolute top-2 left-2 z-10 rounded-full bg-amber-400/95 text-amber-950 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 backdrop-blur-sm">
                        Quedan {product.stock_quantity}
                      </span>
                    )}
                  </div>

                  <div className="relative p-3.5 flex-1 flex flex-col">
                    <div className={`pointer-events-none absolute inset-0 ${templateStyles.progressFill} opacity-20 dark:opacity-25`} />
                    <div className="relative flex items-center justify-between gap-2">
                      <span className={`text-base font-bold ${templateStyles.priceFx}`}>{formatARSAmount(product.price)}</span>
                    </div>
                    <div className="relative mt-3">
                      {soldOut ? (
                        <div className={`w-full rounded-xl ${templateStyles.plate} ${templateStyles.tiny} text-sm font-medium px-4 py-2 text-center`}>
                          Sin stock
                        </div>
                      ) : qty === 0 ? (
                        <button
                          type="button"
                          onClick={() => updateProductQty(product.id, 1)}
                          className={`w-full inline-flex items-center justify-center gap-2 rounded-xl ${templateStyles.progressFill} text-white text-sm font-semibold px-4 py-2 shadow-[0_10px_22px_-12px_rgba(0,0,0,0.45)] hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer select-none`}
                        >
                          <Plus className="w-4 h-4" />
                          Agregar
                        </button>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => updateProductQty(product.id, qty - 1)}
                            className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 ${templateStyles.accent} ${templateStyles.hoverBorder} transition-colors cursor-pointer select-none active:scale-95`}
                            aria-label="Quitar uno"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className={`text-sm font-bold ${templateStyles.heading} tabular-nums`}>{qty}</span>
                          <button
                            type="button"
                            onClick={() => !maxed && updateProductQty(product.id, qty + 1)}
                            disabled={maxed}
                            className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 ${templateStyles.accent} ${templateStyles.hoverBorder} disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer select-none active:scale-95`}
                            aria-label="Agregar uno"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {storeAtTop && storeCanScroll && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
        >
          <div className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-medium border shadow-lg backdrop-blur-md ${templateStyles.plate}`}>
            <ChevronDown className={`h-3.5 w-3.5 animate-bounce ${templateStyles.accent}`} />
            <span className={templateStyles.tiny}>Deslizá para ver más</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

const BookingClient = memo(function BookingClient({ shop, services, servicesError, combos, combosError, staffMembers, staffServicesMap, storeEnabled = false, storeProducts = [], storeError = null, status = null, orderId = null, initialStep = null }: BookingClientProps) {
  const { user, isLoading: isAuthLoading } = useAuth();

  const isStorePreview = initialStep === "tienda" && storeEnabled;
  const [step, setStep] = useState(() => (isStorePreview ? 4 : 0));
  const [showSummary, setShowSummary] = useState(false);
  const [expandedContact, setExpandedContact] = useState<"address" | "whatsapp" | "instagram" | null>(null);
  const contactRowRef = useRef<HTMLDivElement>(null);
  const pendingContactRef = useRef<"address" | "whatsapp" | "instagram" | null>(null);
  const [storeCart, setStoreCart] = useState<Record<string, number>>({});
  const [storeLightbox, setStoreLightbox] = useState<PublicStoreProduct | null>(null);
  const [storeArrivedViaButton, setStoreArrivedViaButton] = useState(false);
  const storeJumpOriginRef = useRef(0);

  const handleExpandContact = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, contact: "address" | "whatsapp" | "instagram") => {
      if (expandedContact === contact) {
        pendingContactRef.current = null;
        return;
      }
      e.preventDefault();
      triggerHaptic(8);
      if (expandedContact) {
        pendingContactRef.current = contact;
        setExpandedContact(null);
      } else {
        pendingContactRef.current = null;
        setExpandedContact(contact);
      }
    },
    [expandedContact]
  );

  useEffect(() => {
    if (!expandedContact) return;
    const handler = (event: MouseEvent | TouchEvent) => {
      if (contactRowRef.current && !contactRowRef.current.contains(event.target as Node)) {
        pendingContactRef.current = null;
        setExpandedContact(null);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [expandedContact]);

  useEffect(() => {
    for (const s of staffMembers) {
      if (s.photo_url) {
        const img = new window.Image();
        img.src = s.photo_url;
      }
    }
  }, [staffMembers]);

  useEffect(() => {
    if (!shop.phone) { setQrCodeUrl(null); return; }
    const waUrl = `https://wa.me/${shop.phone.replace(/\D/g, "")}`;
    QRCode.toDataURL(waUrl, { width: 200, margin: 2, color: { dark: "#000000", light: "#ffffff" } })
      .then(setQrCodeUrl)
      .catch(() => setQrCodeUrl(null));
  }, [shop.phone]);

  useEffect(() => {
    if (user) setLoginRequired(false);
  }, [user]);

  const [stepDirection, setStepDirection] = useState(1);
  const prevStepRef = useRef(-1);
  useEffect(() => {
    setStepDirection(step > prevStepRef.current ? 1 : -1);
    prevStepRef.current = step;
  }, [step]);

  useEffect(() => {
    setRipplePositions({});
  }, [step]);

  const restoredSelectionRef = useRef<{ slot: Slot; staff: StaffMember | null } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("klip_booking_draft");
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.shopSlug !== shop.slug) return;
      if (draft.cart) setCart(draft.cart);
      else if (draft.selectedService) setCart([draft.selectedService]);
      if (draft.selectedStaff && !assignStaffLater) setSelectedStaff(draft.selectedStaff);
      if (draft.noPreference || assignStaffLater) setNoPreference(true);
      if (draft.selectedDate) setSelectedDate(new Date(draft.selectedDate));
      if (draft.selectedSlot) {
        setSelectedSlot(draft.selectedSlot);
        restoredSelectionRef.current = { slot: draft.selectedSlot, staff: draft.staffForAppointment ?? null };
      }
      if (draft.selectedCombo) setSelectedCombo(draft.selectedCombo);
      if (draft.staffForAppointment) setStaffForAppointment(draft.staffForAppointment);
      if (draft.customerName) setCustomerName(draft.customerName);
      if (draft.customerEmail) setCustomerEmail(draft.customerEmail);
      if (draft.customerPhone) setCustomerPhone(draft.customerPhone);
      if (draft.selectedCategory) setSelectedCategory(draft.selectedCategory);
      if (draft.step && !isStorePreview) setStep(assignStaffLater && draft.step === 1 ? 2 : draft.step);
      sessionStorage.removeItem("klip_booking_draft");
    } catch {
      /* ignore corrupt data */
    }
  }, [shop.slug, isStorePreview]);

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

  const [cart, setCart] = useState<Service[]>([]);
  const [selectedCombo, setSelectedCombo] = useState<Combo | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [staffForAppointment, setStaffForAppointment] = useState<StaffMember | null>(null);
  const [slotStaffPicker, setSlotStaffPicker] = useState<{ slot: Slot; availableStaff: StaffMember[] } | null>(null);
  const [noPreference, setNoPreference] = useState(() => shop.assignStaffLater);
  const staffLookup = useMemo(() => new Map(staffMembers.map(s => [s.id, s])), [staffMembers]);

  const [ripplePositions, setRipplePositions] = useState<Record<string, RipplePosition>>({});

  const cartRef = useRef<Service[]>([]);
  useEffect(() => { cartRef.current = cart; }, [cart]);
  const staffRef = useRef<StaffMember[]>([]);
  useEffect(() => { staffRef.current = selectedStaff; }, [selectedStaff]);

  const handleToggleService = useCallback((svc: Service, e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic(15, e.currentTarget);
    const rect = getRippleRect(e.currentTarget);
    const size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2.5);
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const isRemoving = cartRef.current.some((s) => s.id === svc.id);
    if (isRemoving) {
      setRipplePositions((prev) => { const rest = { ...prev }; delete rest[svc.id]; return rest; });
      setCart((prev) => prev.filter((s) => s.id !== svc.id));
    } else {
      setRipplePositions((prev) => ({ ...prev, [svc.id]: { x, y, size } }));
      setCart((prev) => [...prev, svc]);
    }
    setSelectedCombo(null);
  }, [setRipplePositions, setCart, setSelectedCombo]);

  const handleToggleStaff = useCallback((staff: StaffMember, e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic(15, e.currentTarget);
    const rect = getRippleRect(e.currentTarget);
    const size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2.5);
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const isRemoving = staffRef.current.some((ss) => ss.id === staff.id);
    setStaffForAppointment(null);
    setNoPreference(false);
    if (isRemoving) {
      setRipplePositions((prev) => { const rest = { ...prev }; delete rest[staff.id]; return rest; });
      setSelectedStaff((prev) => prev.filter((ss) => ss.id !== staff.id));
    } else {
      setRipplePositions((prev) => ({ ...prev, [staff.id]: { x, y, size } }));
      setSelectedStaff((prev) => [...prev, staff]);
    }
  }, [setRipplePositions, setSelectedStaff, setStaffForAppointment, setNoPreference]);

  const handleNoPreference = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic(15, e.currentTarget);
    const rect = getRippleRect(e.currentTarget);
    const size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2.5);
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRipplePositions((prev) => {
      const rest = { ...prev };
      for (const s of staffRef.current) delete rest[s.id];
      return { ...rest, "no-preference": { x, y, size } };
    });
    setSelectedStaff([]);
    setStaffForAppointment(null);
    setSlotStaffPicker(null);
    setNoPreference(true);
  }, [setRipplePositions, setSelectedStaff, setStaffForAppointment, setSlotStaffPicker, setNoPreference]);

  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const fetchedDatesRef = useRef(new Set<string>());
  const pendingDateRef = useRef<string | null>(null);
  const [monthOverrides, setMonthOverrides] = useState<Record<string, { is_closed: boolean; start_time: string | null; end_time: string | null }>>({});



  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [nameError, setNameError] = useState("");

  const hasServices = cart.length > 0 || selectedCombo !== null;
  const storeCartCount = useMemo(() => Object.values(storeCart).reduce((sum, q) => sum + q, 0), [storeCart]);
  const hasStoreItems = storeCartCount > 0;
  const productsTotal = useMemo(
    () => storeProducts.reduce((sum, p) => sum + p.price * (storeCart[p.id] ?? 0), 0),
    [storeProducts, storeCart]
  );

  const needsPayment = useMemo(() => {
    if (hasStoreItems) return true;
    if (!shop.payAtShop) {
      if (selectedCombo) return selectedCombo.services.some((s) => !s.pay_at_shop);
      return cart.some((s) => !s.pay_at_shop);
    }
    return false;
  }, [hasStoreItems, shop.payAtShop, cart, selectedCombo]);

  const CART_STORAGE_KEY = `klip-book-cart:${shop.id}`;

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { serviceIds?: string[]; comboId?: string | null; storeCart?: Record<string, number> } | null;
      if (!parsed || typeof parsed !== "object") return;
      if (Array.isArray(parsed.serviceIds)) {
        const loaded = parsed.serviceIds
          .map((id) => services.find((s) => s.id === id))
          .filter((s): s is Service => Boolean(s));
        if (loaded.length > 0) setCart(loaded);
      }
      if (typeof parsed.comboId === "string") {
        const combo = combos.find((c) => c.id === parsed.comboId) ?? null;
        if (combo) setSelectedCombo(combo);
      }
      if (parsed.storeCart && typeof parsed.storeCart === "object") {
        const valid: Record<string, number> = {};
        for (const [productId, qty] of Object.entries(parsed.storeCart)) {
          const product = storeProducts.find((p) => p.id === productId);
          if (!product || product.stock_quantity <= 0) continue;
          valid[productId] = Math.max(1, Math.min(Number(qty) || 1, product.stock_quantity));
        }
        setStoreCart(valid);
      }
    } catch {
      /* ignore corrupt data */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify({
        serviceIds: cart.map((s) => s.id),
        comboId: selectedCombo?.id ?? null,
        storeCart,
      }));
    } catch {
      /* storage unavailable */
    }
  }, [CART_STORAGE_KEY, cart, selectedCombo, storeCart]);

  useEffect(() => {
    if (status === "success" || status === "pending") {
      setCart([]);
      setSelectedCombo(null);
      setStoreCart({});
    }
  }, [status]);

  const updateProductQty = useCallback((productId: string, quantity: number) => {
    setStoreCart((prev) => {
      const next = { ...prev };
      if (quantity <= 0) {
        delete next[productId];
        return next;
      }
      const product = storeProducts.find((p) => p.id === productId);
      next[productId] = Math.min(quantity, product?.stock_quantity ?? quantity);
      return next;
    });
  }, [storeProducts, setStoreCart]);

  const removeProduct = useCallback((productId: string) => {
    setStoreCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }, [setStoreCart]);

  const [submitting, setSubmitting] = useState(false);
  const [creatingPreference, setCreatingPreference] = useState(false);
  const [barCompleteFired, setBarCompleteFired] = useState(false);

  useEffect(() => {
    if ((submitting || creatingPreference) && !barCompleteFired) setBarCompleteFired(true);
  }, [submitting, creatingPreference, barCompleteFired]);

  const [paymentPreferenceId, setPaymentPreferenceId] = useState<string | null>(null);
  const [paymentInitPoint, setPaymentInitPoint] = useState<string | null>(null);
  const [chargedAmount, setChargedAmount] = useState<number | null>(null);
  const [isDepositPayment, setIsDepositPayment] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"mp" | "bank_transfer" | null>(null);
  const selectedPaymentMethodRef = useRef<"mp" | "bank_transfer" | null>(null);
  useEffect(() => { selectedPaymentMethodRef.current = selectedPaymentMethod; }, [selectedPaymentMethod]);
  const [bankTransferDetails, setBankTransferDetails] = useState<{ cvuCb: string; alias: string; bankName: string } | null>(null);
  const [bankTransferWhatsAppMessage, setBankTransferWhatsAppMessage] = useState<string | null>(null);

  const pendingAppointmentIdsRef = useRef<string[]>([]);
  const confirmLockRef = useRef(false);
  const slotRetriedRef = useRef(false);
  const slotsRef = useRef<HTMLDivElement>(null);
  const horariosScrollRef = useRef<HTMLDivElement>(null);
  const stepsScrollRef = useRef<HTMLDivElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);




  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");

  function saveBookingDraft() {
    const draft = {
      shopSlug: shop.slug,
      cart,
      selectedStaff,
      noPreference,
      selectedDate: selectedDate?.toISOString(),
      selectedSlot,
      selectedCombo,
      staffForAppointment,
      customerName,
      customerEmail,
      customerPhone,
      selectedCategory,
      step: 3,
    };
    try {
      sessionStorage.setItem("klip_booking_draft", JSON.stringify(draft));
    } catch {
      /* sessionStorage might be full or unavailable */
    }
  }
  const industryConfig = INDUSTRY_CONFIG[shop.industry] || INDUSTRY_CONFIG.peluqueria;
  const serviceWord = industryConfig.labels.serviceSingular;
  const staffWord = industryConfig.labels.staffSingular;
  const assignStaffLater = shop.assignStaffLater;
  const serviceWordLower = serviceWord.toLowerCase();
  const staffWordLower = staffWord.toLowerCase();

  const storeStep = storeEnabled ? 4 : -1;
  const pagoStep = storeEnabled ? 5 : 4;
  const totalSteps = storeEnabled ? 6 : 5;
  const isStoreOnly = storeEnabled && !hasServices;
  const datosFilled = customerName.trim().includes(" ") && customerEmail.trim().length > 0 && customerPhone.trim().length > 0;
  const storeItemsCount = Object.keys(storeCart).length;

  const stepTitles = useMemo(() => {
    const titles = [
      `Elegí tu ${serviceWordLower}`,
      `Elegí tu ${staffWordLower}`,
      "Elegí fecha y horario",
      "Tus datos",
      "Tienda",
      "Pago",
    ];
    return storeEnabled ? titles : titles.filter((_, i) => i !== 4);
  }, [serviceWordLower, staffWordLower, storeEnabled]);

  const barProgress = storeEnabled
    ? step === 0 ? 0 : step === 1 ? 0.2 : step === 2 ? 0.4 : step === 3 ? 0.6 : step === 4 ? 0.8 : 1
    : step === 0 ? 0 : step === 1 ? 0.2 : step === 2 ? 0.6 : step === 3 ? 0.8 : 1;

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

  const selectedComboId = selectedCombo?.id ?? null;
  const cartIdsKey = useMemo(() => cart.map((svc) => svc.id).join("|"), [cart]);

  const availableStaff = useMemo(() => {
    if (selectedComboId) {
      const combo = combos?.find((c) => c.id === selectedComboId) ?? null;
      if (combo) {
        const comboServiceIds = combo.services.map((svc) => svc.id);
        return staffMembers.filter((s) => {
          const myIds = staffServicesMap[s.id];
          return myIds && comboServiceIds.every((cid) => myIds.includes(cid));
        });
      }
    }
    if (cartIdsKey) {
      const cartServiceIds = cartIdsKey.split("|");
      return staffMembers.filter((s) => {
        const myIds = staffServicesMap[s.id];
        if (!myIds || myIds.length === 0) return true;
        return cartServiceIds.every((cid) => myIds.includes(cid));
      });
    }
    return staffMembers;
  }, [staffMembers, staffServicesMap, cartIdsKey, selectedComboId, combos]);

  useEffect(() => {
    const valid = selectedStaff.filter((s) => availableStaff.find((a) => a.id === s.id));
    if (valid.length !== selectedStaff.length) {
      setSelectedStaff(valid);
    }
  }, [availableStaff, selectedStaff]);

  const autoSkippedRef = useRef(false);
  useEffect(() => {
    if (autoSkippedRef.current) return;
    if (step === 0 && services.length <= 1 && combos.length === 0) {
      autoSkippedRef.current = true;
      if (services.length === 1) setCart([services[0]]);
      setStep(assignStaffLater ? 2 : 1);
    }
  }, [step, services, combos, assignStaffLater]);
  useEffect(() => {
    if (!autoSkippedRef.current || step !== 1) return;
    if (availableStaff.length <= 1 || assignStaffLater) {
      if (availableStaff.length === 1 && !assignStaffLater) setSelectedStaff([availableStaff[0]]);
      setStep(2);
    }
  }, [step, availableStaff, assignStaffLater]);

  useEffect(() => {
    const publicKey = shop.mpPublicKey || process.env.NEXT_PUBLIC_MP_PUBLIC_KEY || process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (!publicKey) return;
    initMercadoPago(publicKey, { locale: "es-AR" });
  }, [shop.mpPublicKey]);

  useEffect(() => {
    if (cart.length === 0 && !selectedCombo) return;
    if (!selectedDate || fetchedDatesRef.current.has(formatDate(selectedDate))) return;

    setLoadingSlots(true);
    setSelectedSlot((prev) => (restoredSelectionRef.current && prev ? prev : null));
    setStaffForAppointment((prev) => (restoredSelectionRef.current && prev ? prev : null));
    if (restoredSelectionRef.current) restoredSelectionRef.current = null;
    setSlotStaffPicker(null);
    const dateStr = formatDate(selectedDate);
    const slotDuration = selectedCombo
      ? selectedCombo.total_duration
      : cart.reduce((sum, s) => sum + s.duration_minutes, 0);

    (async () => {
      try {
        const staffFilter = !noPreference && selectedStaff.length > 0
          ? selectedStaff.map((s) => s.id)
          : availableStaff.map((s) => s.id);
        const result = await fetchPublicAvailableSlots(shop.id, slotDuration, dateStr, staffFilter);
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
  }, [availableStaff, cart, selectedCombo, selectedDate, selectedStaff, noPreference, shop.id]);

  const prevLoadingSlots = useRef<boolean | null>(null);

  useEffect(() => {
    if (!selectedDate) return;
    if (prevLoadingSlots.current === true && !loadingSlots) {
      requestAnimationFrame(() => {
        const el = horariosScrollRef.current;
        if (el && availableSlots.length > 0) {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
      });
    }
    prevLoadingSlots.current = loadingSlots;
  }, [loadingSlots, selectedDate, availableSlots.length]);

  useEffect(() => {
    if (pendingDateRef.current === null && fetchedDatesRef.current.size === 0) return;
    pendingDateRef.current = null;
    fetchedDatesRef.current = new Set();
    setAvailableSlots((prev) => prev.length > 0 ? [] : prev);
    setSlotsError(null);
    setSelectedSlot(null);
    setSelectedDate(null);
  }, [cart, selectedCombo, selectedStaff, noPreference]);

  useEffect(() => {
    const startDate = formatDate(new Date(viewYear, viewMonth, 1));
    const endDate = formatDate(new Date(viewYear, viewMonth + 1, 0));
    (async () => {
      const result = await fetchPublicShopDateOverrides(shop.id, startDate, endDate);
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
    const timeouts = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.(".delicate-scroll") as HTMLElement | null;
      if (!el) return;
      el.classList.add("scrolling");
      const existing = timeouts.get(el);
      if (existing) clearTimeout(existing);
      timeouts.set(el, setTimeout(() => el.classList.remove("scrolling"), 800));
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
    };
  }, []);

  const googleCalendarUrl = useMemo(() => {
    if (!selectedSlot || (cart.length === 0 && !selectedCombo)) return null;
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
    const name = selectedCombo?.name ?? (cart.length > 0 ? cart.map(s => s.name).join(" + ") : "Turno");
    const title = `${shop.name} - ${name}`;
    const details = `Turno reservado en ${shop.name}`;
    const location = shop.address || "";
    const dates = `${toGoogleDate(selectedSlot.start)}/${toGoogleDate(selectedSlot.end)}`;
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}&dates=${encodeURIComponent(dates)}`;
  }, [selectedSlot, cart, selectedCombo, shop.name, shop.address]);

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
        return cart.length > 0 || selectedCombo !== null || hasStoreItems;
      case 1:
        return selectedStaff.length > 0 || noPreference;
      case 2:
        return selectedSlot !== null && (staffForAppointment !== null || noPreference);
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

  const handlePhoneChange = (value: string) => {
    setCustomerPhone(value);
    if (phoneError) setPhoneError("");
  };

  function validateName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "El nombre es obligatorio";
    if (!trimmed.includes(" ")) return "Ingresá nombre y apellido";
    return "";
  }

  const handleNameChange = (value: string) => {
    setCustomerName(value);
    if (nameError) setNameError("");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setNameError("");
    setPhoneError("");
  };

  function rollbackAppointments(ids: string[]) {
    return Promise.allSettled(ids.map((id) => deletePublicAppointment({ appointmentId: id, shopId: shop.id }).catch(() => {})));
  }

  function handleLoginRequired() {
    setStep(3);
    setLoginRequired(true);
    setError("Para reservar otro turno, iniciá sesión con Google");
    setSubmitting(false);
    setCreatingPreference(false);
  }

  async function completeFlow() {
    await new Promise((r) => setTimeout(r, 700));
    playSuccessSound();
    setSubmitting(false);
    setDone(true);
  }

  async function createCartAppointments(status: "scheduled" | "pending_payment", phone: string): Promise<{ ids: string[] } | null> {
    const createdIds: string[] = [];
    let prevEnd = selectedSlot!.start;
    for (let i = 0; i < cart.length; i++) {
      const svc = cart[i];
      const svcStart = prevEnd;
      const svcEnd = new Date(new Date(svcStart).getTime() + svc.duration_minutes * 60000).toISOString();
      const result = await createPublicAppointment({
        shopId: shop.id,
        serviceId: svc.id,
        staffId: staffForAppointment?.id,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: phone,
        authenticatedUserId: user?.id,
        skipRepeatCache: i < cart.length - 1,
        startTime: svcStart,
        endTime: svcEnd,
        status,
      });
      if (!result.success) {
        await rollbackAppointments(createdIds);
        if (result.error === "login_required") return null;
        throw new Error(result.error || "No se pudo reservar el turno");
      }
      createdIds.push(result.data!.appointmentId);
      prevEnd = svcEnd;
    }
    return { ids: createdIds };
  }

  async function maybeRetrySlotTaken(error: string | undefined): Promise<boolean> {
    if (error !== "slot_taken") return false;
    if (slotRetriedRef.current) return false;
    const ownIds = pendingAppointmentIdsRef.current;
    if (ownIds.length === 0) return false;
    slotRetriedRef.current = true;
    await Promise.allSettled(ownIds.map((id) => deletePublicAppointment({ appointmentId: id, shopId: shop.id }).catch(() => {})));
    pendingAppointmentIdsRef.current = [];
    confirmLockRef.current = false;
    setSubmitting(false);
    setCreatingPreference(false);
    setError(null);
    handleConfirm();
    return true;
  }

  async function handleConfirm() {
    if (confirmLockRef.current) return;
    confirmLockRef.current = true;
    try {
    if (cart.length === 0 && !selectedCombo && !hasStoreItems) return;
    if (hasServices && !selectedSlot) return;
    if (!customerName || !customerPhone) return;
    if (!isLoggedIn && !customerEmail.trim()) return;

    const nameErr = validateName(customerName);
    if (nameErr) { setNameError(nameErr); return; }

    const phoneErr = validatePhone(customerPhone);
    if (phoneErr) { setPhoneError(phoneErr); return; }

    warmAudio();

    setSubmitting(true);
    setError(null);

    const [{ formatArgentinePhone }] = await Promise.all([import("@/lib/validation")]);
    const formattedPhone = formatArgentinePhone(customerPhone);
    const paymentMethod = selectedPaymentMethodRef.current ?? "mp";
    const storeItems = Object.entries(storeCart).map(([productId, quantity]) => ({ productId, quantity }));

    // Products-only checkout (no appointment): store order with its own payment
    if (hasStoreItems && !hasServices) {
      setCreatingPreference(true);
      const { createStoreOrder } = await import("@/lib/dashboard/store/public-store-actions");
      const result = await createStoreOrder({
        shopId: shop.id,
        shopSlug: shop.slug,
        items: storeItems,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: formattedPhone,
        paymentMethod,
      });
      setSubmitting(false); setCreatingPreference(false);
      if (!result.success) { setError(result.error || "No se pudo iniciar el pago"); return; }
      if (!result.data) { setError("No se pudo iniciar el pago"); return; }
      const data = result.data;
      setChargedAmount(data.totalAmount);
      setIsDepositPayment(false);
      if (paymentMethod === "mp" && data.initPoint) {
        setSelectedPaymentMethod("mp");
        setPaymentPreferenceId(data.preferenceId ?? null);
        setPaymentInitPoint(data.initPoint);
        setStep(pagoStep);
        return;
      }
      if (paymentMethod === "bank_transfer" && data.bankTransfer) {
        setSelectedPaymentMethod("bank_transfer");
        setBankTransferDetails({ cvuCb: data.bankTransfer.cbu, alias: data.bankTransfer.alias, bankName: data.bankTransfer.bankName });
        setBankTransferWhatsAppMessage(
          `Hola ${shop.name}, hice un pedido por ${formatARSAmount(data.totalAmount)} por transferencia. Mi pedido queda pendiente de confirmar.`
        );
        setStep(pagoStep);
        return;
      }
      setError("No se pudo iniciar el pago. Intenta de nuevo.");
      return;
    }

    // Combined checkout: appointment(s) + store order paid together
    if (hasStoreItems && hasServices) {
      setCreatingPreference(true);
      const { createCombinedCheckout } = await import("@/lib/dashboard/booking/public-booking-actions");
      const result = await createCombinedCheckout({
        shopId: shop.id,
        shopSlug: shop.slug,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: formattedPhone,
        authenticatedUserId: user?.id,
        paymentMethod,
        staffId: staffForAppointment?.id,
        startTime: selectedSlot!.start,
        combo: selectedCombo
          ? {
              comboId: selectedCombo.id,
              comboName: selectedCombo.name,
              comboPrice: selectedCombo.price,
              services: selectedCombo.services.map((s) => ({ id: s.id, name: s.name, duration_minutes: s.duration_minutes, price: s.price })),
              totalDuration: selectedCombo.total_duration,
            }
          : undefined,
        cartServices: !selectedCombo && cart.length > 0
          ? cart.map((s) => ({ id: s.id, name: s.name, duration_minutes: s.duration_minutes, price: s.price }))
          : undefined,
        storeItems,
      });
      setSubmitting(false); setCreatingPreference(false);
      if (!result.success) { setError(result.error || "No se pudo iniciar el pago"); return; }
      if (!result.data) { setError("No se pudo iniciar el pago"); return; }
      const data = result.data;
      pendingAppointmentIdsRef.current = data.appointmentIds;
      setChargedAmount(data.chargedAmount);
      setIsDepositPayment(data.isDeposit);
      if (paymentMethod === "mp" && data.initPoint) {
        setPaymentPreferenceId(data.preferenceId ?? null);
        setPaymentInitPoint(data.initPoint);
        setStep(pagoStep);
        return;
      }
      if (paymentMethod === "bank_transfer" && data.bankTransfer) {
        setBankTransferDetails({ cvuCb: data.bankTransfer.cbu, alias: data.bankTransfer.alias, bankName: data.bankTransfer.bankName });
        setBankTransferWhatsAppMessage(
          `Hola ${shop.name}, reservé turno por ${formatARSAmount(data.totalAmount)} y pagué por transferencia. Quedo a la espera de confirmación.`
        );
        setStep(pagoStep);
        return;
      }
      setError("No se pudo iniciar el pago. Intenta de nuevo.");
      return;
    }

    if (!selectedSlot) return;

    // Non-paid flow
    if (!needsPayment && !selectedPaymentMethodRef.current) {
      if (selectedCombo) {
        const result = await createPublicComboAppointment({
          shopId: shop.id,
          comboId: selectedCombo.id,
          comboName: selectedCombo.name,
          comboPrice: selectedCombo.price,
          services: selectedCombo.services,
          staffId: staffForAppointment?.id,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim() || undefined,
          customerPhone: formattedPhone,
          authenticatedUserId: user?.id,
          startTime: selectedSlot.start,
          status: "scheduled",
        });
        if (!result.success && result.error === "login_required") { handleLoginRequired(); return; }
        if (!result.success) { setSubmitting(false); setError(result.error || "No se pudo reservar el turno"); return; }
        await completeFlow();
        return;
      }

      const cartResult = await createCartAppointments("scheduled", formattedPhone);
      if (cartResult === null) { handleLoginRequired(); return; }
      await completeFlow();
      return;
    }

    // Paid flow
    if (selectedCombo) {
      setCreatingPreference(true);
      const comboResult = await createPublicComboAppointment({
        shopId: shop.id,
        comboId: selectedCombo.id,
        comboName: selectedCombo.name,
        comboPrice: selectedCombo.price,
        services: selectedCombo.services,
        staffId: staffForAppointment?.id,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: formattedPhone,
        authenticatedUserId: user?.id,
        startTime: selectedSlot.start,
        status: "pending_payment",
      });
      if (!comboResult.success) {
        setSubmitting(false); setCreatingPreference(false);
        if (comboResult.error === "login_required") { handleLoginRequired(); return; }
        if (await maybeRetrySlotTaken(comboResult.error)) return;
        setError(comboResult.error || "No se pudo crear el turno"); return;
      }
      if (!comboResult.data) { setSubmitting(false); setCreatingPreference(false); setError("No se pudo crear el turno"); return; }

      const { createPaymentPreference } = await import("@/lib/dashboard/booking/public-booking-actions");
      const prefResult = await createPaymentPreference({
        appointmentId: comboResult.data.appointmentIds[0],
        shopId: shop.id,
        shopSlug: shop.slug,
        overridePrice: selectedCombo.price,
        comboAppointmentIds: comboResult.data.appointmentIds,
      });
      setSubmitting(false); setCreatingPreference(false);
      if (!prefResult.success) { setError(prefResult.error || "No se pudo iniciar el pago"); return; }
      if (!prefResult.data) { setError("No se pudo iniciar el pago"); return; }
      pendingAppointmentIdsRef.current = comboResult.data.appointmentIds;
      setPaymentPreferenceId(prefResult.data.preferenceId);
      setPaymentInitPoint(prefResult.data.initPoint);
      setChargedAmount(prefResult.data.chargedAmount ?? null);
      setIsDepositPayment(Boolean(prefResult.data.isDeposit));
      setStep(pagoStep);
      return;
    }

    // Cart paid flow — create appointments with pending_payment then payment preference
    setCreatingPreference(true);
    const cartResult = await createCartAppointments("pending_payment", formattedPhone);
    if (cartResult === null) { setCreatingPreference(false); handleLoginRequired(); return; }

    const totalPrice = cart.reduce((sum, s) => sum + s.price, 0);
    const { createPaymentPreference } = await import("@/lib/dashboard/booking/public-booking-actions");
    const prefResult = await createPaymentPreference({
      appointmentId: cartResult.ids[0],
      shopId: shop.id,
      shopSlug: shop.slug,
      overridePrice: totalPrice,
      comboAppointmentIds: cartResult.ids,
    });
    setSubmitting(false); setCreatingPreference(false);
    if (!prefResult.success) { setError(prefResult.error || "No se pudo iniciar el pago"); return; }
    if (!prefResult.data) { setError("No se pudo iniciar el pago"); return; }
    pendingAppointmentIdsRef.current = cartResult.ids;
    setPaymentPreferenceId(prefResult.data.preferenceId);
    setPaymentInitPoint(prefResult.data.initPoint);
    setChargedAmount(prefResult.data.chargedAmount ?? null);
    setIsDepositPayment(Boolean(prefResult.data.isDeposit));
    setStep(pagoStep);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error inesperado al procesar el turno";
    if (await maybeRetrySlotTaken(msg)) return;
    setSubmitting(false);
    setCreatingPreference(false);
    setError(msg);
  } finally {
    confirmLockRef.current = false;
  }
  }

  const continueFromTienda = () => {
    if (hasServices) {
      if (cart.length === 0 && !selectedCombo) { setStep(0); return; }
      if (selectedStaff.length === 0 && !noPreference) { setStep(1); return; }
      if (selectedSlot === null || (staffForAppointment === null && !noPreference)) { setStep(2); return; }
      if (!datosFilled) { setStep(3); return; }
      const phoneErr = validatePhone(customerPhone);
      if (phoneErr) { setPhoneError(phoneErr); setStep(3); return; }
      handleConfirm();
      return;
    }
    if (!hasStoreItems) { setStep(0); return; }
    if (!datosFilled) { setStep(3); return; }
    const phoneErr = validatePhone(customerPhone);
    if (phoneErr) { setPhoneError(phoneErr); setStep(3); return; }
    handleConfirm();
  };

  const handleReset = () => {
    autoSkippedRef.current = false;
    setStep(0);
    setCart([]);
    setSelectedCombo(null);
    setSelectedStaff([]);
    setNoPreference(false);
    setSelectedDate(null);
    setSelectedSlot(null);
    setStaffForAppointment(null);
    setSlotStaffPicker(null);
    setAvailableSlots([]);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setSubmitting(false);
    setCreatingPreference(false);
    setBarCompleteFired(false);
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
  };

  const summaryService = selectedCombo?.name
    || (cart.length > 0 ? `${cart.length} servicios` : "")
    || (hasStoreItems ? `${storeCartCount} ${storeCartCount > 1 ? "productos" : "producto"}` : "")
    || "Sin servicio";
  const summaryDate = selectedDate ? formatDisplayDate(selectedDate).replace(/^\w/, (c) => c.toUpperCase()) : "Sin fecha";
  const summaryTime = selectedSlot ? formatTimeFromIso(selectedSlot.start) || to24HourTimeLabel(selectedSlot.time) : "Sin hora";

  const servicePrice = selectedCombo?.price ?? cart.reduce((sum, s) => sum + s.price, 0);
  const totalPrice = servicePrice + productsTotal;
  const totalDuration = selectedCombo
    ? selectedCombo.total_duration
    : cart.reduce((sum, s) => sum + s.duration_minutes, 0);
  const depositEnabled = shop.bookingDepositEnabled !== false;
  const configuredDeposit = shop.bookingDepositAmount;
  const depositPortion = depositEnabled && hasServices
    ? Math.max(1, Math.min(servicePrice, configuredDeposit > 0 ? configuredDeposit : servicePrice))
    : servicePrice;
  const previewIsDeposit = depositEnabled && hasServices && depositPortion < servicePrice;
  const previewChargeAmount = depositPortion + productsTotal;
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
      <div className="relative z-10 flex h-full items-start justify-center pt-[calc(env(safe-area-inset-top)+0.75rem)] pr-3 pb-3 pl-3 sm:pr-6 sm:pb-6 sm:pl-6 lg:p-8">
        <div className="w-full max-w-md md:max-w-xl">
        <motion.div
          className={`rounded-[32px] p-4 sm:p-6 lg:p-8 h-[min(860px,calc(100dvh-env(safe-area-inset-top)-1.5rem))] sm:h-[min(900px,calc(100dvh-env(safe-area-inset-top)-3rem))] flex flex-col ${templateStyles.shell}`}
          style={(step === 3 || step === pagoStep) && !done ? { height: 'auto' } as React.CSSProperties : undefined}>
          {!done ? (
            <>
              <div className="pb-0 sm:pb-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-14 w-14 sm:h-16 sm:w-16 flex items-center justify-center shrink-0 overflow-hidden rounded-2xl">
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
                    <div className="truncate">
                      <div
                        className={`text-[1.4rem] sm:text-[1.85rem] md:text-[2.25rem] font-black leading-[1.1] tracking-[-0.035em] truncate ${templateStyles.headingFx} bg-gradient-to-r ${templateStyles.titleGradient} bg-clip-text text-transparent`}
                      >
                        {shop.heroTitle || shop.name}
                      </div>
                    </div>
                  </div>
                  {step < pagoStep && (cart.length > 0 || selectedStaff.length > 0 || selectedCombo || noPreference || hasStoreItems) && (
                    <SelectionPill
                      serviceCount={cart.length + (selectedCombo ? 1 : 0)}
                      productCount={storeCartCount}
                      staff={staffForAppointment ? [staffForAppointment] : selectedStaff}
                      noPreference={noPreference}
                      templateStyles={templateStyles}
                      onTap={() => setShowSummary(true)}
                    />
                  )}
                </div>
                <div className="relative flex items-center justify-center pt-3 pb-1">
                  <div className={`absolute inset-x-4 h-[2px] rounded-full ${templateStyles.progressTrack}`} />
                  <div className="absolute inset-x-4 h-[2px]">
                    <motion.div
                      className="absolute inset-0 rounded-full origin-left"
                      style={{ boxShadow: "0 0 18px 2px rgba(168,85,247,0.55), 0 0 40px 6px rgba(168,85,247,0.25)" }}
                      animate={{ scaleX: barProgress, opacity: step >= 3 ? 1 : 0 }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    />
                    <motion.div
                      className="absolute inset-0 origin-left"
                      animate={{ scaleX: barProgress }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <motion.div
                        key={`step-pulse-${step}`}
                        className="absolute inset-0 rounded-full pointer-events-none"
                        initial={{ scaleY: 1, opacity: 0 }}
                        animate={{ scaleY: [1, 2.4, 1], opacity: [0, 0.7, 0] }}
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                        style={{ boxShadow: `0 0 12px 2px ${extractHex(templateStyles.accent)}` }}
                      />
                      {barCompleteFired && (
                        <motion.div
                          key="bar-complete-plop"
                          className="absolute inset-0 rounded-full pointer-events-none"
                          initial={{ scaleY: 1, opacity: 0 }}
                          animate={{ scaleY: [1, 3.4, 1], opacity: [0, 1, 0] }}
                          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.35 }}
                          style={{ boxShadow: `0 0 20px 4px ${extractHex(templateStyles.accent)}, 0 0 44px 12px rgba(168,85,247,0.4)` }}
                        />
                      )}
                    </motion.div>
                    <motion.div
                      className={`absolute inset-0 rounded-full origin-left overflow-hidden ${templateStyles.progressFill}`}
                      animate={{ scaleX: barProgress, opacity: step >= 3 ? 1 : 0.8 }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <motion.div
                        className="pointer-events-none absolute inset-0 rounded-full"
                        style={{
                          backgroundImage: "linear-gradient(90deg, #f472b6 0%, #fbbf24 35%, #34d399 65%, #60a5fa 100%)",
                        }}
                        animate={{ opacity: step >= 3 ? 1 : 0 }}
                        transition={{ duration: 0.4 }}
                      />
                      <motion.div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          backgroundImage: "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.9) 50%, transparent 100%)",
                          backgroundSize: "120px 100%",
                          backgroundRepeat: "no-repeat",
                        }}
                        animate={{ x: ["-60%", "130%"] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "linear", repeatDelay: 0.25 }}
                      />
                    </motion.div>
                  </div>
                  <span
                    className={`relative z-10 px-3 py-1 text-[11px] font-semibold whitespace-nowrap rounded-full leading-tight ${templateStyles.stepPill}`}
                  >
                    {step >= 0 && step < totalSteps ? stepTitles[step] : ""}
                  </span>
                </div>
              </div>

              <div className="pt-0 sm:pt-1 min-h-0 flex-1 relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    ref={stepsScrollRef}
                    custom={{ dir: stepDirection, step }}
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
                          <div className="flex-1 overflow-y-auto overflow-x-hidden delicate-scroll px-4 pt-2 pb-3 [scroll-snap-type:y_proximity]">
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
                                      <RippleWaves position={ripplePositions[combo.id]} colors={rippleWaves} />
                                    )}
                                    {isSelected && (
                                      <div
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
                                      setCart([]);
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
                                        <span
                                          className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none tabular-nums"
                                          style={{ backgroundColor: isSelected ? rippleConfig.text : rippleConfig.bg, color: isSelected ? rippleConfig.bg : rippleConfig.text } as React.CSSProperties}
                                        >
                                          <Clock className="w-3 h-3" strokeWidth={2} />
                                          {formatDuration(combo.total_duration)}
                                        </span>
                                      </div>
                                    </div>
                                  </button>
                                  </div>
                                </motion.div>
                              );
                            })
                          ) : (
                            filteredServices.map((svc) => {
                              const isInCart = cart.some((s) => s.id === svc.id);
                              const cartIdx = cart.findIndex((s) => s.id === svc.id);
                              return (
                                  <ServiceCard
                                  key={svc.id}
                                  svc={svc}
                                  isInCart={isInCart}
                                  cartIdx={cartIdx}
                                  cartLength={cart.length}
                                  ripplePosition={ripplePositions[svc.id]}
                                  waves={rippleWaves}
                                  cardDepth={templateStyles.cardDepth}
                                  selected={templateStyles.selected}
                                  plain={templateStyles.plain}
                                  plate={templateStyles.plate}
                                  hoverBorder={templateStyles.hoverBorder}
                                  heading={templateStyles.heading}
                                  tiny={templateStyles.tiny}
                                  priceText={templateStyles.priceText}
                                  priceFx={templateStyles.priceFx}
                                  selectedText={rippleConfig.text}
                                  accentBg={rippleConfig.bg}
                                  progressFill={templateStyles.progressFill}
                                  tactileClass={tactileClass}
                                  onToggle={handleToggleService}
                                />
                              );
                            }))}
                        </motion.div>
                        {cart.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-3 p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700"
                          >
                            <div className="flex items-center justify-between text-sm">
                              <span className={`font-medium ${templateStyles.heading}`}>
                                {cart.length} servicio{cart.length > 1 ? "s" : ""}
                              </span>
                              <span className={`font-semibold tabular-nums ${templateStyles.priceText}`}>
                                $ {cart.reduce((s, svc) => s + svc.price, 0).toLocaleString("es-AR")}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {cart.map((svc) => (
                                <span key={svc.id} className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${templateStyles.pricePill}`}>
                                  {svc.name} · {svc.duration_minutes}min
                                </span>
                              ))}
                            </div>
                            <p className={`mt-1 text-xs ${templateStyles.tiny}`}>
                              Total: {cart.reduce((s, svc) => s + svc.duration_minutes, 0)} min
                            </p>
                          </motion.div>
                        )}
                        </div>
                        </div>
                      </div>
                    )}

                    {step === 1 && !assignStaffLater && (
                      <div className="flex flex-col h-full min-h-0">
                        <div className="flex flex-col min-h-0 max-h-full w-full">
                        <div className="flex-1 overflow-y-auto overflow-x-hidden delicate-scroll px-1 pt-2 pb-3 [scroll-snap-type:y_proximity]">
                           <div className="space-y-3">
                        <motion.div
                          onPointerDown={pushCard3D}
                          onPointerUp={releaseCard3D}
                          onPointerLeave={releaseCard3D}
                          className={`rounded-[14px] border-2 transition-[transform,box-shadow] duration-200 ${templateStyles.cardDepth} ${noPreference ? `${templateStyles.selected} border-transparent` : `${templateStyles.plain} ${templateStyles.hoverBorder}`}`}
                        >
                          <div className="overflow-hidden rounded-[14px] relative">
                            {noPreference && <RippleWaves position={ripplePositions["no-preference"]} colors={rippleWaves} />}
                            {noPreference && (
                              <div className="absolute inset-0 rounded-[14px] pointer-events-none z-[2]" style={{ boxShadow: `inset 0 0 10px 1px ${rippleConfig.text}20, 0 0 10px 1px ${rippleConfig.text}12` } as React.CSSProperties} />
                            )}
                            <button
                              type="button"
                              onClick={handleNoPreference}
                              draggable={false}
                              className={`w-full px-5 py-6 text-center relative z-10 outline-none focus:outline-none focus-visible:outline-none ${tactileClass}`}
                              style={noPreference ? { color: rippleConfig.text } as React.CSSProperties : undefined}
                            >
                              <div className="flex flex-col items-center">
                                <p className={`text-lg sm:text-xl font-semibold tracking-tight ${templateStyles.heading}`} style={noPreference ? { color: rippleConfig.text } as React.CSSProperties : undefined}>Sin preferencia</p>
                                <p className={`text-[11px] uppercase tracking-[0.16em] mt-1 ${templateStyles.tiny}`} style={noPreference ? { color: rippleConfig.text } as React.CSSProperties : undefined}>{`Cualquier ${staffWordLower} disponible`}</p>
                              </div>
                            </button>
                          </div>
                        </motion.div>
                        {availableStaff.map((s) => {
                          const isSelected = selectedStaff.some((ss) => ss.id === s.id);
                          return (
                            <StaffCard
                              key={s.id}
                              staff={s}
                              isSelected={isSelected}
                              ripplePosition={ripplePositions[s.id]}
                              waves={rippleWaves}
                              cardDepth={templateStyles.cardDepth}
                              selected={templateStyles.selected}
                              plain={templateStyles.plain}
                              hoverBorder={templateStyles.hoverBorder}
                              heading={templateStyles.heading}
                              tiny={templateStyles.tiny}
                              accent={templateStyles.accent}
                              plate={templateStyles.plate}
                              selectedText={rippleConfig.text}
                              tactileClass={tactileClass}
                              onToggle={handleToggleStaff}
                            />
                          );
                        })}
                          </div>
                        </div>
                        </div>
                      </div>
                    )}

                    {step === 2 && (
                      <div className="flex flex-col h-full min-h-0 relative">
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
                        <div ref={horariosScrollRef} className="overflow-y-auto delicate-scroll pb-4 flex-1 min-h-0">
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
                            const weekdayClosed = shop.businessHours
                              ? shop.businessHours[WEEKDAY_KEYS[d.getDay()]]?.open === false
                              : false;
                            const isClosed = override ? override.is_closed === true : weekdayClosed;
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
                                  <RippleWaves position={ripplePositions[`date-${dateStr}`]} colors={rippleWaves} />
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
                                  const slotStaff = slot.staffIds.map((id) => staffLookup.get(id)).filter(Boolean) as StaffMember[];
                                  const allSelected = slotStaff.length === selectedStaff.length;
                                  const staffLabel = slotStaff.length === 1
                                    ? slotStaff[0].name.split(" ")[0]
                                    : slotStaff.length <= 2 && allSelected
                                      ? "Ambos"
                                      : allSelected
                                        ? "Todos"
                                        : slotStaff.map((s) => s.name.split(" ")[0]).join(" · ");
                                  return (
                                    <motion.div
                                      key={slot.start}
                                      className="flex flex-col items-center gap-0.5"
                                    >
                                    <motion.button
                                      key={slot.start}
                                      onClick={(e) => {
                                        if (noPreference) {
                                          triggerHaptic(10, e.currentTarget);
                                          setSelectedSlot(slot);
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          const size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2);
                                          setRipplePositions(prev => ({ ...prev, [`slot-${slot.start}`]: { x: e.clientX - rect.left, y: e.clientY - rect.top, size } }));
                                          return;
                                        }
                                        if (slot.staffIds.length === 1) {
                                          const staff = staffLookup.get(slot.staffIds[0]);
                                          if (staff) setStaffForAppointment(staff);
                                          triggerHaptic(10, e.currentTarget);
                                          setSelectedSlot(slot);
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          const size = Math.ceil(Math.sqrt(rect.width * rect.width + rect.height * rect.height) * 2);
                                          setRipplePositions(prev => ({ ...prev, [`slot-${slot.start}`]: { x: e.clientX - rect.left, y: e.clientY - rect.top, size } }));
                                        } else {
                                          const availableStaff = slot.staffIds.map((id) => staffLookup.get(id)).filter(Boolean) as StaffMember[];
                                          setSlotStaffPicker({ slot, availableStaff });
                                        }
                                      }}
                                      draggable={false}
                                      className={`relative overflow-hidden h-9 text-sm font-medium transition-all duration-200 border-b-2 px-1 ${
                                        isSelected
                                          ? `${templateStyles.selected} border-transparent`
                                          : `border-transparent ${templateStyles.heading} ${templateStyles.hoverBorder}`
                                      }`}
                                    >
                                      {isSelected && (
                                        <RippleWaves position={ripplePositions[`slot-${slot.start}`]} colors={rippleWaves} />
                                      )}
                                      <span className="relative z-10 text-xs" style={isSelected ? { color: rippleConfig.text } as React.CSSProperties : undefined}>
                                        {formatTimeFromIso(slot.start) || to24HourTimeLabel(slot.time)}
                                      </span>
                                    </motion.button>
                                    {!noPreference && (
                                      <span className={`text-[9px] leading-tight ${isSelected ? templateStyles.accent : templateStyles.tiny}`}>
                                        {staffLabel}
                                      </span>
                                    )}
                                    </motion.div>
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

                      <AnimatePresence>
                      {slotStaffPicker && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => setSlotStaffPicker(null)}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-md" />
          <motion.div
            initial={{ scale: 0.88, opacity: 0, y: 24 }}
                            animate={{
                              scale: 1, opacity: 1, y: 0,
                              borderRadius: ["1.5rem 0.75rem 1.5rem 0.75rem", "1.25rem 1.25rem 0.85rem 1.5rem", "1.5rem 0.75rem 1.5rem 0.75rem"],
                            }}
                            exit={{ scale: 0.88, opacity: 0, y: 24, transition: { duration: 0.18 } }}
                            transition={{
                              borderRadius: { duration: 5, repeat: Infinity, ease: "easeInOut" },
                              default: { type: "spring", stiffness: 400, damping: 28, mass: 0.8 },
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className={`relative w-full max-w-sm overflow-hidden ${templateStyles.shell}`}
                          >
                            <div className="p-5 space-y-4">
                              <div className="flex items-center justify-between">
                                <span className={`text-sm font-semibold ${templateStyles.heading}`}>¿Con quién querés atenderte?</span>
                                <button type="button" onClick={() => setSlotStaffPicker(null)} className={`text-[10px] font-medium ${templateStyles.tiny} hover:opacity-70 transition-opacity`}>
                                  Cerrar
                                </button>
                              </div>
                              <div className="space-y-2">
                                {slotStaffPicker.availableStaff.map((staff) => (
                                  <button
                                    key={staff.id}
                                    type="button"
                                    onClick={() => {
                                      setStaffForAppointment(staff);
                                      setSelectedSlot(slotStaffPicker.slot);
                                      setSlotStaffPicker(null);
                                    }}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${templateStyles.plate} hover:opacity-85`}
                                  >
                                    <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                                      {staff.photo_url ? (
                                        <Image src={staff.photo_url} alt="" width={40} height={40} className="object-cover w-full h-full" />
                                      ) : (
                                        <span className={`text-sm font-bold ${templateStyles.accent}`}>{staff.name.charAt(0)}</span>
                                      )}
                                    </div>
                                    <span className={`text-sm font-medium truncate ${templateStyles.heading}`}>{staff.name}</span>
                                    <ChevronRight className={`w-4 h-4 ml-auto shrink-0 ${templateStyles.tiny}`} />
                                  </button>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        </motion.div>
                      )}
                      </AnimatePresence>
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
                            <div className="space-y-2">
                              <p className={`text-center text-xs font-medium uppercase tracking-wider ${templateStyles.tiny}`}>
                                Iniciá sesión para continuar
                              </p>
                              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-blue-700 shadow-lg shadow-blue-500/30">
                                <div className="absolute inset-0 shimmer-slide" />
                                <GoogleSignInButton shopSlug={shop.slug} className="relative !py-3.5 !text-base !font-semibold !text-white !border-0 !bg-transparent !shadow-none !backdrop-blur-none" onSignInStart={saveBookingDraft} />
                              </div>
                            </div>

                            {loginRequired && shop.phone && (
                              <div className="mt-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                                  <span className={`text-[10px] uppercase tracking-widest font-medium ${templateStyles.tiny}`}>ó</span>
                                  <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                                </div>
                                <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                                  <svg viewBox="0 0 24 24" className="h-3 w-3 fill-[#25D366]" aria-hidden="true">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                  </svg>
                                  <a
                                    href={`https://wa.me/${shop.phone.replace(/\D/g, "")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                                  >
                                    Mandanos WhatsApp
                                  </a>
                                </div>
                                {qrCodeUrl && (
                                  <div className="flex justify-center mt-1.5">
                                    <div className="relative inline-flex p-1 rounded-lg bg-white shadow-xs">
                                      <motion.div
                                        initial={{ rotate: -1 }}
                                        animate={{ rotate: 1 }}
                                        transition={{ repeat: Infinity, repeatType: "reverse", duration: 4, ease: "easeInOut" }}
                                      >
                                        <Image
                                          src={qrCodeUrl}
                                          alt="Código QR para WhatsApp del local"
                                          className="rounded"
                                          width={120}
                                          height={120}
                                          unoptimized
                                        />
                                      </motion.div>
                                      <motion.div
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.15 }}
                                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                      >
                                        <div className="h-5 w-5 rounded-full bg-white flex items-center justify-center shadow-xs">
                                          {shop.logoUrl ? (
                                            <Image
                                              src={shop.logoUrl}
                                              alt=""
                                              width={16}
                                              height={16}
                                              className="rounded-full object-cover"
                                              aria-hidden
                                            />
                                          ) : (
                                            <span className="text-[8px] font-bold text-black">{shop.name.charAt(0).toUpperCase()}</span>
                                          )}
                                        </div>
                                      </motion.div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

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

                    {step === storeStep && storeEnabled && (
                      <div className="flex flex-col h-full min-h-0">
                        {!storeArrivedViaButton && (
                          <div className="flex flex-col items-center text-center px-4 pt-2 pb-4">
                            <h2 className={`text-xl sm:text-2xl font-black leading-tight tracking-[-0.03em] ${templateStyles.headingFx} bg-gradient-to-r ${templateStyles.titleGradient} bg-clip-text text-transparent`}>
                              Podés agregar productos a tu pedido
                            </h2>
                            <p className={`mt-2 text-sm ${templateStyles.meta}`}>
                              Es opcional: podés continuar sin comprar nada.
                            </p>
                          </div>
                        )}
                        {error && (
                          <div className={`mx-0.5 mb-2 text-sm px-4 py-2.5 rounded-xl border ${templateStyles.errorBox}`}>
                            {error === "slot_taken" ? "Ese turno ya no está disponible. Elegí otro horario." : error}
                          </div>
                        )}
                        <div className="flex-1 overflow-y-auto delicate-scroll pb-4 px-0.5">
                          <StoreTab
                            products={storeProducts}
                            storeError={storeError}
                            storeCart={storeCart}
                            status={status}
                            orderId={orderId}
                            updateProductQty={updateProductQty}
                            templateStyles={templateStyles}
                            onShowImage={setStoreLightbox}
                          />
                        </div>
                      </div>
                    )}

                    {step === pagoStep && (
                      <div className="flex flex-col h-full min-h-0">
                      <div className="flex-1 overflow-y-auto delicate-scroll pb-4 px-0.5">
                          <div className="space-y-4">

                            {/* Back - animated like steps 1-3 */}
                            <motion.button
                              initial={{ opacity: 0, x: -70, scale: 0.5 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              transition={{ type: "spring", stiffness: 550, damping: 20, mass: 0.7 }}
                              onClick={async () => {
                                const ids = pendingAppointmentIdsRef.current;
                                if (ids.length > 0) {
                                  await Promise.allSettled(ids.map((id) => deletePublicAppointment({ appointmentId: id, shopId: shop.id }).catch(() => {})));
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
                                className="absolute inset-0 rounded-full pointer-events-none"
                                style={{ background: "radial-gradient(circle at 30% 50%, rgba(255,255,255,0.15), transparent 70%)" }}
                                animate={{ opacity: [0.25, 0.45, 0.25] }}
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
                              <p className={`text-[11px] uppercase tracking-[0.12em] font-semibold ${templateStyles.checkoutKicker}`}>
                                {hasServices ? "Resumen del turno" : "Resumen del pedido"}
                              </p>
                              <div className="space-y-1.5">
                                {hasServices && (
                                  <>
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
                                    {staffForAppointment ? (
                                      <div className="flex items-center justify-between gap-2">
                                        <span className={`text-xs ${templateStyles.checkoutKicker}`}>Profesional</span>
                                        <span className={`text-sm font-semibold ${templateStyles.checkoutTitle}`}>{staffForAppointment.name}</span>
                                      </div>
                                    ) : noPreference ? (
                                      <div className="flex items-center justify-between gap-2">
                                        <span className={`text-xs ${templateStyles.checkoutKicker}`}>Profesional</span>
                                        <span className={`text-sm font-semibold ${templateStyles.checkoutTitle}`}>Sin preferencia</span>
                                      </div>
                                    ) : null}
                                  </>
                                )}
                                {hasStoreItems && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className={`text-xs ${templateStyles.checkoutKicker}`}>Productos ({storeCartCount})</span>
                                    <span className={`text-sm font-semibold tabular-nums ${templateStyles.checkoutTitle}`}>{formatARSAmount(productsTotal)}</span>
                                  </div>
                                )}
                              </div>
                              <div className={`border-t pt-2.5 flex items-center justify-between gap-2 ${templateStyles.checkoutKicker.replace(/text-\S+/, 'border-current')}`}>
                                {effectiveIsDeposit && hasServices && effectiveChargedAmount < totalPrice ? (
                                  <>
                                    <span className={`text-xs font-semibold ${templateStyles.checkoutKicker}`}>Total a pagar</span>
                                    <span className={`text-lg font-bold tabular-nums ${templateStyles.checkoutAmount}`}>
                                      <span className="mr-1 align-top text-[0.65em] font-semibold opacity-85">$</span>
                                      {effectiveChargedAmount.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                      <span className={`text-xs font-normal ml-1.5 opacity-60 ${templateStyles.checkoutKicker}`}>
                                        / {formatARSAmount(totalPrice)}
                                      </span>
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className={`text-xs font-semibold ${templateStyles.checkoutKicker}`}>Total</span>
                                    <span className={`text-lg font-bold tabular-nums ${templateStyles.checkoutAmount}`}>
                                      <span className="mr-1 align-top text-[0.65em] font-semibold opacity-85">$</span>
                                      {effectiveChargedAmount.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
                                    await Promise.allSettled(ids.map((id) => deletePublicAppointment({ appointmentId: id, shopId: shop.id }).catch(() => {})));
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
                                    await Promise.allSettled(ids.map((id) => deletePublicAppointment({ appointmentId: id, shopId: shop.id }).catch(() => {})));
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
                                  ) : paymentInitPoint ? (
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
                                      <p className={`text-xs mt-2 ${templateStyles.tiny}`}>{hasServices ? "Reservando turno..." : "Procesando pedido..."}</p>
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
                  {step > 0 && step !== pagoStep && !(step === storeStep && storeArrivedViaButton) && (
                    <motion.button
                      key="back"
                      initial={{ opacity: 0, x: -70, scale: 0.5 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -70, scale: 0.5 }}
                      transition={{ type: "spring", stiffness: 550, damping: 20, mass: 0.7 }}
                      onClick={(e) => { triggerHaptic(10, e.currentTarget); if (isStoreOnly && step === 3) { setStep(0); return; } if (isStoreOnly && step === storeStep) { setStep(0); return; } if (assignStaffLater && step === 2) { setStep(0); return; } setStep((s) => s - 1); }}
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
                        className="absolute inset-0 rounded-full pointer-events-none"
                        style={{ background: "radial-gradient(circle at 30% 50%, rgba(255,255,255,0.15), transparent 70%)" }}
                        animate={{ opacity: [0.25, 0.45, 0.25] }}
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

                <motion.div layout className="flex-1 min-w-0" transition={{ type: "spring", stiffness: 400, damping: 28 }}>
                  {step === storeStep && storeEnabled && storeItemsCount > 0 && (
                    <div className="min-w-0 text-right sm:text-left">
                      <p className={`text-[10px] uppercase tracking-wider font-semibold ${templateStyles.tiny}`}>{storeItemsCount} {storeItemsCount > 1 ? "productos" : "producto"}</p>
                      <p className={`text-base font-bold tabular-nums ${templateStyles.checkoutAmount}`}>{formatARSAmount(productsTotal)}</p>
                    </div>
                  )}
                </motion.div>

                {step < 3 && (
                  <motion.button
                    key="continue"
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 26, mass: 0.9 }}
                    onClick={(e) => {
                      if (!canGoNext) return;
                      triggerHaptic(12, e.currentTarget);
                      if (!hasServices && hasStoreItems) { setStep(3); return; }
                      if (assignStaffLater && step === 0) { setStep(2); return; }
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
                    {/* Content */}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <span>Continuar</span>
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

                {step === storeStep && storeEnabled && (
                  <motion.button
                    key="store-continue"
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 26, mass: 0.9 }}
                    onClick={(e) => {
                      if (submitting || creatingPreference) return;
                      triggerHaptic(12, e.currentTarget);
                      if (storeArrivedViaButton) { setStep(storeJumpOriginRef.current); return; }
                      continueFromTienda();
                    }}
                    disabled={submitting || creatingPreference}
                    whileHover={storeArrivedViaButton || storeCartCount > 0 ? { scale: 1.06 } : { scale: 1.02 }}
                    whileTap={storeArrivedViaButton || storeCartCount > 0 ? { scale: 0.9 } : { scale: 0.98 }}
                    className={`relative overflow-hidden px-6 py-2.5 rounded-full text-sm font-medium whitespace-nowrap ${templateStyles.next} ${submitting || creatingPreference ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <span className="relative z-10 flex items-center gap-1.5">
                      {storeArrivedViaButton ? (
                        <>
                          <ChevronLeft className="w-4 h-4" />
                          <span>Ok, volver</span>
                        </>
                      ) : storeCartCount > 0 ? (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Confirmar y pagar
                        </>
                      ) : (
                        <>
                          <span>No me interesa, continuar</span>
                          <motion.span
                            animate={{ x: [0, 5, 0] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.3 }}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </motion.span>
                        </>
                      )}
                    </span>
                  </motion.button>
                )}
              </motion.div>

              <div ref={contactRowRef} className={`mt-5 ${step === pagoStep ? "hidden" : ""} relative flex items-center justify-center gap-2 sm:gap-2.5`}>
                {storeEnabled && step < storeStep && (
                  <button
                    type="button"
                    onClick={(e) => { triggerHaptic(10, e.currentTarget); if (step === storeStep) { setStep(storeJumpOriginRef.current); return; } setStoreArrivedViaButton(true); storeJumpOriginRef.current = step; setStep(storeStep); }}
                    className={`shrink-0 inline-flex items-center gap-1.5 h-8 rounded-full border px-2.5 transition-colors sm:absolute sm:left-0 ${templateStyles.plate} ${templateStyles.hoverBorder} ${templateStyles.sectionFocus}`}
                    aria-label="Ir a la tienda"
                  >
                    <ShoppingBag className={`w-3.5 h-3.5 shrink-0 ${templateStyles.meta} ${templateStyles.metaHover}`} />
                    <span className={`text-xs font-medium ${templateStyles.heading}`}>Tienda</span>
                    {storeCartCount > 0 && (
                      <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${templateStyles.stepPill}`}>
                        {storeCartCount}
                      </span>
                    )}
                  </button>
                )}
                {shop.address && (
                    <a
                      href={`https://www.google.com/maps/search/${encodeURIComponent(shop.city ? `${shop.address}, ${shop.city}` : shop.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => handleExpandContact(e, "address")}
                      className={`group inline-flex h-8 items-center rounded-full border px-2 transition-colors ${templateStyles.plate} ${templateStyles.hoverBorder}`}
                      aria-label={shop.address}
                    >
                      <MapPin className={`w-3.5 h-3.5 shrink-0 transition-colors ${templateStyles.meta} ${templateStyles.metaHover}`} />
                      <AnimatePresence
                        onExitComplete={() => {
                          if (pendingContactRef.current) {
                            setExpandedContact(pendingContactRef.current);
                            pendingContactRef.current = null;
                          }
                        }}
                      >
                        {expandedContact === "address" && (
                          <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ type: "spring", stiffness: 1520, damping: 52, mass: 0.8 }}
                            className="overflow-hidden whitespace-nowrap"
                          >
                            <motion.span
                              initial={{ scale: 0.5, y: 4, opacity: 0 }}
                              animate={{ scale: 1, y: 0, opacity: 1 }}
                              exit={{ scale: 0.5, y: 4, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 2200, damping: 40, mass: 0.6, delay: 0.015 }}
                              className={`inline-block max-w-[140px] truncate pl-2 text-xs font-medium ${templateStyles.heading}`}
                            >
                              {shop.address}
                            </motion.span>
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </a>
                  )}
                  {shop.phone && (
                    <a
                      href={`https://wa.me/${shop.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => handleExpandContact(e, "whatsapp")}
                      className={`group inline-flex h-8 items-center rounded-full border px-2 transition-colors ${templateStyles.plate} ${templateStyles.hoverBorder}`}
                      aria-label={shop.phone}
                    >
                      <WhatsappIcon className={`w-3.5 h-3.5 shrink-0 transition-colors ${templateStyles.meta} ${templateStyles.metaHover}`} />
                      <AnimatePresence
                        onExitComplete={() => {
                          if (pendingContactRef.current) {
                            setExpandedContact(pendingContactRef.current);
                            pendingContactRef.current = null;
                          }
                        }}
                      >
                        {expandedContact === "whatsapp" && (
                          <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ type: "spring", stiffness: 1520, damping: 52, mass: 0.8 }}
                            className="overflow-hidden whitespace-nowrap"
                          >
                            <motion.span
                              initial={{ scale: 0.5, y: 4, opacity: 0 }}
                              animate={{ scale: 1, y: 0, opacity: 1 }}
                              exit={{ scale: 0.5, y: 4, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 2200, damping: 40, mass: 0.6, delay: 0.015 }}
                              className={`inline-block max-w-[140px] truncate pl-2 text-xs font-medium ${templateStyles.heading}`}
                            >
                              {shop.phone}
                            </motion.span>
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </a>
                  )}
                  {shop.instagramUrl && (
                    <a
                      href={shop.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => handleExpandContact(e, "instagram")}
                      className={`group inline-flex h-8 items-center rounded-full border px-2 transition-colors ${templateStyles.plate} ${templateStyles.hoverBorder}`}
                      aria-label="Instagram"
                    >
                      <InstagramIcon className={`w-3.5 h-3.5 shrink-0 transition-colors ${templateStyles.meta} ${templateStyles.metaHover}`} />
                      <AnimatePresence
                        onExitComplete={() => {
                          if (pendingContactRef.current) {
                            setExpandedContact(pendingContactRef.current);
                            pendingContactRef.current = null;
                          }
                        }}
                      >
                        {expandedContact === "instagram" && (
                          <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ type: "spring", stiffness: 1520, damping: 52, mass: 0.8 }}
                            className="overflow-hidden whitespace-nowrap"
                          >
                            <motion.span
                              initial={{ scale: 0.5, y: 4, opacity: 0 }}
                              animate={{ scale: 1, y: 0, opacity: 1 }}
                              exit={{ scale: 0.5, y: 4, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 2200, damping: 40, mass: 0.6, delay: 0.015 }}
                              className={`inline-block max-w-[140px] truncate pl-2 text-xs font-medium ${templateStyles.heading}`}
                            >
                              Instagram
                            </motion.span>
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </a>
                  )}
                <a
                  href="https://klip.com.ar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`shrink-0 inline-flex items-center gap-1 text-[10px] transition-colors ${templateStyles.meta} ${templateStyles.metaHover} sm:absolute sm:right-0`}
                >
                  <span>powered by</span>
                  <span className="font-bold tracking-wide">KLIP</span>
                </a>
              </div>

              <AnimatePresence>
                {showSummary && (
                  <SelectionSummary
                    cart={cart}
                    selectedCombo={selectedCombo}
                    staff={staffForAppointment ? [staffForAppointment] : selectedStaff}
                    noPreference={noPreference}
                    totalDuration={totalDuration}
                    totalPrice={totalPrice}
                    products={storeProducts}
                    storeCart={storeCart}
                    onUpdateProductQty={updateProductQty}
                    onRemoveProduct={removeProduct}
                    templateStyles={templateStyles}
                    onClose={() => setShowSummary(false)}
                  />
                )}
              </AnimatePresence>
              <AnimatePresence>
                {storeLightbox && (
                  <StoreImageModal product={storeLightbox} onClose={() => setStoreLightbox(null)} />
                )}
              </AnimatePresence>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex flex-col h-full py-6 text-center"
            >
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="relative mb-6">
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    initial={{ scale: 0.8, opacity: 0.5 }}
                    animate={{ scale: 1.7, opacity: 0 }}
                    transition={{ duration: 0.7, ease: "easeOut", delay: 0.18 }}
                    style={{ boxShadow: `0 0 0 2px ${extractHex(templateStyles.accent)}` }}
                  />
                  {[0, 1, 2, 3, 4, 5].map((i) => {
                    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
                    const dist = 60 + (i % 3) * 16;
                    return (
                      <motion.span
                        key={i}
                        className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
                        style={{ background: extractHex(templateStyles.accent) }}
                        initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                        animate={{
                          x: Math.cos(angle) * dist,
                          y: Math.sin(angle) * dist,
                          opacity: [0, 1, 0],
                          scale: [0, 1, 0.4],
                        }}
                        transition={{ duration: 0.8, delay: 0.15 + (i % 3) * 0.06, ease: "easeOut" }}
                      />
                    );
                  })}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
                    className="relative w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
                    style={{ background: extractHex(templateStyles.accent) }}
                  >
                    <motion.div
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.22 }}
                    >
                      <Check className="w-10 h-10 text-white" strokeWidth={3} />
                    </motion.div>
                  </motion.div>
                </div>
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
                  {hasServices && (
                    <>
                      <p className="truncate"><span className={templateStyles.tiny}>{`${serviceWord}:`}</span> {summaryService}</p>
                      <p className="truncate"><span className={templateStyles.tiny}>Fecha:</span> {summaryDate}</p>
                      <p className="truncate"><span className={templateStyles.tiny}>Hora:</span> {summaryTime}</p>
                    </>
                  )}
                  {hasStoreItems && (
                    <p className="truncate"><span className={templateStyles.tiny}>Productos:</span> {storeCartCount} · {formatARSAmount(productsTotal)}</p>
                  )}
                  <p className="truncate">
                    <span className={templateStyles.tiny}>
                      {effectiveIsDeposit && hasServices && effectiveChargedAmount < totalPrice ? "Seña online:" : "Pago online:"}
                    </span> {formatARSAmount(effectiveChargedAmount)}
                  </p>
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
                      if (storeEnabled && !isStoreOnly) {
                        setStoreArrivedViaButton(false);
                        if (hasStoreItems) {
                          handleConfirm();
                        } else {
                          setStep(storeStep);
                        }
                        return;
                      }
                      if (shop.bankTransferEnabled) {
                        setStep(pagoStep);
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
                        <span className="relative z-10">
                          {storeEnabled && !isStoreOnly ? "Continuar" : hasServices && hasStoreItems ? "Confirmar y pagar" : hasStoreItems ? "Confirmar pedido" : "Confirmar turno"}
                        </span>
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
