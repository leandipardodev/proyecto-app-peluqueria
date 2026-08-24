"use client";

import { Menu, Search, Moon, Sun, Gauge, Repeat2, Check, Volume2, VolumeX, Sparkles, Bell, Bug, CircleHelp, LogOut, KeyRound } from "lucide-react";
import { useState, useRef, useEffect, useLayoutEffect, useTransition, useMemo, useCallback, memo, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import DashboardMobileSidebar from "./dashboard-mobile-sidebar";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import { haptic } from "@/lib/haptic";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { OmniSearchResult } from "@/lib/dashboard/search/global-search-actions";
import { useDarkMode } from "@/lib/use-dark-mode";
import { usePerformanceMode } from "@/lib/use-performance-mode";
import { triggerDashboardNavTransition } from "@/lib/dashboard/shared/nav-transition";
import { useAuth } from "@/lib/auth-context";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";
import { useShopFeatures } from "@/lib/industry/use-features";
import { isMuted, setMuted } from "@/lib/sound";
import { getDashboardBasePath, withDashboardBase } from "@/lib/dashboard/shared/dashboard-base";
import { StatePanel } from "@/components/ui/state-panel";
import { DASHBOARD_LEGACY_SEGMENTS_SET } from "@/lib/dashboard/shared/legacy-segments";
import NotificationsPanel from "./notifications-panel";
import { useNotifications } from "@/lib/dashboard/use-notifications";
import { NAV_COMMANDS, ACTION_COMMANDS, type CommandItem, type CommandNav, type CommandAction, type CommandData } from "@/lib/dashboard/search/search-commands";
import { getIndustrySearchKeywords, getInitials, normalizeSearchText, scoreQueryAgainstTerms, formatDataLabel, formatDataHint } from "@/lib/dashboard/search/search-utils";
import BaseModal from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

interface DashboardHeaderProps {
  shopName: string;
  userName: string;
  userEmail: string;
  onLogout: () => Promise<void>;
  activeShopSlug: string | null;
  managedShops: Array<{ id: string; slug: string; nombre: string; active: boolean | null; plan_expiry: string | null }>;
  billingStatus: {
    daysRemaining: number | null;
    graceDaysRemaining: number | null;
    isExpired: boolean;
    inGrace: boolean;
  };
  lastPaymentDate: string | null;
}

const SEARCH_COLLAPSED_WIDTH = 280;
const SEARCH_EXPANDED_WIDTH = 640;

const DashboardHeader = memo(function DashboardHeader({ shopName, userName, userEmail, onLogout, activeShopSlug, managedShops, billingStatus, lastPaymentDate }: DashboardHeaderProps) {

  const { shop, user } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerPlural = INDUSTRY_CONFIG[industry].labels.customerPlural;
  const servicePlural = INDUSTRY_CONFIG[industry].labels.servicePlural;
  const staffPlural = INDUSTRY_CONFIG[industry].labels.staffPlural;
  const features = useShopFeatures();
  const filteredNavCommands = useMemo(() => NAV_COMMANDS.filter((cmd) => {
    if (cmd.id === "nav-stock") return features.inventory;
    if (cmd.id === "nav-marketing") return features.marketing;
    return true;
  }), [features]);
  const router = useRouter();
  const pathname = usePathname();
  const dashboardBasePath = getDashboardBasePath(pathname);
  const pathnameShopSlug = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const slug = parts[1];
    if (parts[0] === "dashboard" && slug && !DASHBOARD_LEGACY_SEGMENTS_SET.has(slug)) return slug;
    return null;
  }, [pathname]);
  const selectedShopSlug = pathnameShopSlug || activeShopSlug || managedShops[0]?.slug || "";
  const selectedShop = useMemo(
    () => (selectedShopSlug ? managedShops.find((shop) => shop.slug === selectedShopSlug) : managedShops[0]) || managedShops[0] || null,
    [managedShops, selectedShopSlug],
  );
  const billingUrl = selectedShop?.id ? `/billing-required?shop_id=${encodeURIComponent(selectedShop.id)}` : "/billing-required";
  const { dark, toggle: toggleDark } = useDarkMode();
  const { performanceMode, togglePerformanceMode } = usePerformanceMode();
  const { playClick, playSearchExpand } = useKlipSounds();
  const { addToast } = useToast();
  const shouldReduceMotion = useReducedMotion();

  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const [logoutPending, startLogoutTransition] = useTransition();
  const [soundMuted, setSoundMuted] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { unreadCount: notifCount } = useNotifications(shop?.id);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchInputReady, setSearchInputReady] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [dbResults, setDbResults] = useState<OmniSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  const avatarMenuRef = useRef<HTMLDivElement>(null);
  const shopMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Header progresivo: se oculta/revela 1:1 con el scroll (estilo Chrome movil).
  // Un loop de rAF interpola exponencialmente hacia el objetivo: los eventos de
  // scroll agrupados del momentum se convierten en movimiento continuo sin saltos.
  const headerElRef = useRef<HTMLElement | null>(null);
  const floatBtnRef = useRef<HTMLButtonElement | null>(null);
  const inHeaderMenuRef = useRef<HTMLButtonElement | null>(null);
  const headerHRef = useRef(0);
  const offsetRef = useRef(0);
  const targetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastYRef = useRef(0);
  const floatingRef = useRef(false);
  const menuOpenRef = useRef(false);
  const [headerFloating, setHeaderFloating] = useState(false);

  const paintHeaderOffset = useCallback((o: number) => {
    const el = headerElRef.current;
    const h = headerHRef.current;
    if (!el || h <= 0) return;
    const p = o / h;
    el.style.setProperty("--hp", p.toFixed(3));
    el.style.transform = `translateY(${-o}px)`;

    const fb = floatBtnRef.current;
    if (fb) {
      fb.style.opacity = String(p);
      fb.style.transform = `scale(${0.55 + 0.45 * p})`;
      fb.style.borderRadius = `${14 + 10 * p}px`;
      fb.style.pointerEvents = p >= 0.85 ? "auto" : "none";
    }

    const inHeaderBtn = inHeaderMenuRef.current;
    if (inHeaderBtn) inHeaderBtn.style.opacity = String(Math.max(0, 1 - p * 2));

    const nextFloating = p >= 0.85;
    if (nextFloating !== floatingRef.current) {
      floatingRef.current = nextFloating;
      setHeaderFloating(nextFloating);
    }
  }, []);

  const ensureLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    const step = () => {
      const target = targetRef.current;
      const current = offsetRef.current;
      const diff = target - current;
      if (Math.abs(diff) < 0.35) {
        offsetRef.current = target;
        paintHeaderOffset(target);
        rafRef.current = null;
        return;
      }
      offsetRef.current = current + diff * 0.28;
      paintHeaderOffset(offsetRef.current);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [paintHeaderOffset]);

  const setTargetOffset = useCallback((offset: number) => {
    const h = headerHRef.current;
    targetRef.current = Math.max(0, Math.min(h || 0, offset));
    ensureLoop();
  }, [ensureLoop]);
// Medición inicial
  useLayoutEffect(() => {
    const el = headerElRef.current;
    if (!el) return;
    const measure = () => {
      headerHRef.current = el.offsetHeight;
      // Clamp por si el header cambio de alto (rotacion, zoom): nunca >100%
      offsetRef.current = Math.min(offsetRef.current, headerHRef.current);
      targetRef.current = Math.min(targetRef.current, headerHRef.current);
      setTargetOffset(offsetRef.current);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [paintHeaderOffset, setTargetOffset]);

  useEffect(() => { menuOpenRef.current = menuOpen; }, [menuOpen]);
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);
  useEffect(() => {
    if (menuOpen && floatingRef.current) {
      floatingRef.current = false;
      setHeaderFloating(false);
      offsetRef.current = 0;
      setTargetOffset(0);
    }
  }, [menuOpen, setTargetOffset]);

  useEffect(() => {
    const scroller: HTMLElement | null = document.querySelector("main");
    if (!scroller) return;
    let lastY = scroller.scrollTop;

    const onScroll = () => {
      if (menuOpenRef.current) return;
      const y = scroller.scrollTop;
      const max = scroller.scrollHeight - scroller.clientHeight;
      const dy = y - lastY;
      lastY = y;

      // Sin contenido scrolleable o rubber-band superior: mostrar
      if (max <= 4 || y <= 0) {
        setTargetOffset(0);
        return;
      }
      // Zona final: congelar progreso (evita loops con el rebote de iOS)
      if (y >= max - 2) return;

      // Progresivo puro: cada pixel de scroll mueve la animacion 1:1
      setTargetOffset(offsetRef.current + dy);
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  const rotatingWords = useMemo(() => [
    "clientes...",
    ...(features.inventory ? ["stock..."] : []),
    "caja...",
    ...(features.marketing ? ["marketing..."] : []),
    "comandos...",
  ], [features.inventory, features.marketing]);
  const billingDerived = useMemo(() => {
    const gracePosition = 2 - Math.max(0, billingStatus.graceDaysRemaining ?? 0) + 1;
    const daysBadgeLabel = billingStatus.daysRemaining === null
      ? "--"
      : billingStatus.daysRemaining > 0
        ? `${billingStatus.daysRemaining}d`
        : billingStatus.inGrace
          ? `${gracePosition}!/2`
          : "0d";
    const planSummary = billingStatus.daysRemaining === null
      ? "PLAN PRO"
      : billingStatus.daysRemaining > 0
        ? `PLAN PRO • ${billingStatus.daysRemaining} DIAS RESTANTES`
        : billingStatus.inGrace
          ? `PLAN VENCIDO • DÍA ${gracePosition} de 2 DE CORTESÍA`
          : "PLAN VENCIDO";
    const showBillingCta = billingStatus.daysRemaining !== null && billingStatus.daysRemaining <= 3;
    const billingCtaTone = billingStatus.daysRemaining !== null && billingStatus.daysRemaining <= 0
      ? "critical"
      : billingStatus.daysRemaining !== null && billingStatus.daysRemaining <= 1
        ? "warning"
        : "normal";
    const billingCtaClass = billingCtaTone === "critical"
      ? "mt-2 inline-flex items-center rounded-full border border-red-300/80 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-700/50 dark:bg-red-900/35 dark:text-red-200"
      : billingCtaTone === "warning"
        ? "mt-2 inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-900/35 dark:text-amber-200"
        : "mt-2 inline-flex items-center rounded-full border border-rose-300/70 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-200";
    const billingCtaLabel = billingCtaTone === "critical"
      ? "Plan vencido - pagar ahora"
      : billingCtaTone === "warning"
        ? "Vence pronto - pagar"
        : "Pagar mensualidad";
    return { daysBadgeLabel, planSummary, showBillingCta, billingCtaTone, billingCtaClass, billingCtaLabel };
  }, [billingStatus.daysRemaining, billingStatus.graceDaysRemaining, billingStatus.inGrace]);
  const { daysBadgeLabel, planSummary, showBillingCta, billingCtaTone, billingCtaClass, billingCtaLabel } = billingDerived;
  const lastPaymentFormatted = useMemo(() => {
    if (!lastPaymentDate) return null;
    return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "short", year: "numeric" }).format(new Date(lastPaymentDate));
  }, [lastPaymentDate]);

  function navigateWithTransition(target: string) {
    triggerDashboardNavTransition();
    router.push(target);
  }

  function handleMobileOpen() {
    playClick();
    setMobileOpen(true);
  }

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) {
      setShowSearchDropdown(false);
      return;
    }
    const t = setTimeout(() => setShowSearchDropdown(true), 180);
    return () => clearTimeout(t);
  }, [searchOpen]);

  useEffect(() => {
    if (searchFocused) return;
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % rotatingWords.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [searchFocused, rotatingWords.length]);

  useEffect(() => {
    if (!searchOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (!searchRef.current) return;
      if (!searchRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!shopMenuOpen) return;
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setShopMenuOpen(false);
    }
    function handleClickOutside(e: MouseEvent) {
      if (!shopMenuRef.current) return;
      if (!shopMenuRef.current.contains(e.target as Node)) {
        setShopMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [shopMenuOpen]);

  useEffect(() => {
    setSoundMuted(isMuted());
    const handleStorage = () => setSoundMuted(isMuted());
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!searchOpen || q.length < 2) {
      setDbResults([]);
      setSearchError(null);
      return;
    }

    const timer = setTimeout(async () => {
      const [stockRes, servicesRes, customersRes, staffRes] = await Promise.all([
        supabase
          .from("stock")
          .select("id, nombre_producto, quantity")
          .eq("shop_id", shop?.id ?? "")
          .ilike("nombre_producto", `%${q}%`)
          .order("nombre_producto", { ascending: true })
          .limit(8),
        supabase
          .from("services")
          .select("id, name, duration_minutes")
          .eq("shop_id", shop?.id ?? "")
          .ilike("name", `%${q}%`)
          .order("name", { ascending: true })
          .limit(8),
        supabase
          .from("customers")
          .select("id, nombre, telefono")
          .eq("shop_id", shop?.id ?? "")
          .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`)
          .order("nombre", { ascending: true })
          .limit(8),
        supabase
          .from("user_profiles")
          .select("user_id, name, email, role")
          .eq("shop_id", shop?.id ?? "")
          .in("role", ["owner", "staff"])
          .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
          .order("name", { ascending: true })
          .limit(8),
      ]);

      if (stockRes.error || servicesRes.error || customersRes.error || staffRes.error) {
        setSearchError("Error en la busqueda");
        setDbResults([]);
        return;
      }
      setSearchError(null);
      setDbResults([
        ...(stockRes.data || []).map((item: { id: string; nombre_producto: string; quantity: number | null }) => ({ type: "stock" as const, ...item, quantity: item.quantity ?? 0 })),
        ...(servicesRes.data || []).map((item: { id: string; name: string; duration_minutes: number | null }) => ({ type: "service" as const, ...item, duration_minutes: item.duration_minutes ?? 0 })),
        ...(customersRes.data || []).map((item: { id: string; nombre: string; telefono: string | null }) => ({ type: "customer" as const, ...item })),
        ...(staffRes.data || []).map((item: { user_id: string; name: string | null; email: string | null; role: string | null }) => ({ type: "staff" as const, id: item.user_id, name: item.name ?? "", email: item.email ?? "", role: item.role ?? "" })),
      ]);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchOpen, shop?.id]);

  const commandItems = useMemo(() => {
    const q = query.trim();
    const industryKeywords = getIndustrySearchKeywords(industry);
    const navCommandsResolved = filteredNavCommands.map((item) => (
      item.id === "nav-customers"
        ? { ...item, label: item.label.replace("__CUSTOMERS_LABEL__", customerPlural) }
        : item.id === "nav-services"
          ? { ...item, label: item.label.replace("__SERVICES_LABEL__", servicePlural) }
          : item.id === "nav-staff"
            ? { ...item, label: item.label.replace("__STAFF_LABEL__", staffPlural) }
            : item
    ));
    const nav = navCommandsResolved
      .map((c) => {
        if (c.id === "nav-billing") return { ...c, to: billingUrl };
        return { ...c, to: withDashboardBase(c.to, dashboardBasePath) };
      })
      .map((c) => {
        const extraKeywords = industryKeywords[c.id] || [];
        return { item: c, score: scoreQueryAgainstTerms(q, [c.label, c.hint, ...c.keywords, ...extraKeywords]) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);

    const action = ACTION_COMMANDS
      .map((c) => ({ item: c, score: scoreQueryAgainstTerms(q, [c.label, c.hint, ...c.keywords]) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);

    const stock: CommandData[] = features.inventory ? dbResults.filter((r) => r.type === "stock").map((r) => ({ id: `stock-${r.id}`, kind: "data", value: r })) : [];
    const services: CommandData[] = dbResults.filter((r) => r.type === "service").map((r) => ({ id: `service-${r.id}`, kind: "data", value: r }));
    const people: CommandData[] = dbResults
      .filter((r) => r.type === "customer" || r.type === "staff")
      .map((r) => ({ id: `${r.type}-${r.id}`, kind: "data", value: r }));
    return {
      nav,
      action,
      stock,
      services,
      people,
      flat: [...action, ...nav, ...stock, ...services, ...people] as CommandItem[],
    };
  }, [query, dbResults, dashboardBasePath, billingUrl, customerPlural, servicePlural, staffPlural, industry, features, filteredNavCommands]);

  useEffect(() => {
    setActiveIndex(0);
  }, [commandItems.flat.length, query]);

  function closeSearch(immediate = false) {
    const clear = () => {
      setQuery("");
      setDbResults([]);
      setSearchError(null);
    };

    if (immediate) {
      setShowSearchDropdown(false);
      setSearchOpen(false);
      setSearchInputReady(false);
      clear();
      return;
    }

    setShowSearchDropdown(false);
    setTimeout(() => {
      setSearchOpen(false);
      setSearchInputReady(false);
      clear();
    }, 140);
  }

  async function execute(item: CommandItem) {
    if (item.kind === "data") {
      const result = item.value;
      closeSearch(true);
      if (result.type === "customer") {
        navigateWithTransition(`${withDashboardBase("/dashboard/customers", dashboardBasePath)}?q=${encodeURIComponent(result.nombre || result.telefono || "")}&customerId=${result.id}`);
        return;
      }
      if (result.type === "stock") {
        if (!features.inventory) return;
        navigateWithTransition(withDashboardBase("/dashboard/inventory", dashboardBasePath));
        return;
      }
      if (result.type === "service") {
        navigateWithTransition(withDashboardBase("/dashboard/services", dashboardBasePath));
        return;
      }
      navigateWithTransition(withDashboardBase("/dashboard/staff", dashboardBasePath));
      return;
    }

    if (item.kind === "nav") {
      closeSearch(true);
      navigateWithTransition(item.to);
      return;
    }

    if (item.action === "toggleTheme") {
      toggleDark();
      closeSearch(true);
      return;
    }

    if (item.action === "togglePerformance") {
      togglePerformanceMode();
      closeSearch(true);
      return;
    }

    startLogoutTransition(async () => {
      try { await supabase.auth.signOut(); } catch { /* best effort */ }
      try { await onLogout(); } catch { /* server action redirect */ }
      router.refresh();
      closeSearch(true);
    });
  }

  function onPaletteKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (!searchOpen) setSearchOpen(true);
      return;
    }

    const total = commandItems.flat.length;
    if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
      inputRef.current?.blur();
      return;
    }
    if (total === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((v) => (v + 1) % total);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((v) => (v <= 0 ? total - 1 : v - 1));
      return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void execute(commandItems.flat[activeIndex]);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      setPlaceholderIndex((prev) => (prev + 1) % rotatingWords.length);
      return;
    }
  }

  function handleLogoutClick() {
    if (typeof window !== "undefined" && !window.confirm("¿Cerrar sesión?")) return;
    startLogoutTransition(async () => {
      try { await supabase.auth.signOut(); } catch { /* best effort */ }
      try { await onLogout(); } catch { /* server action redirect */ }
      router.refresh();
    });
  }

  async function handleChangePassword() {
    if (savingPassword) return;
    if (newPassword.length < 6) {
      addToast("La contraseña debe tener al menos 6 caracteres", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast("Las contraseñas no coinciden", "error");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        addToast(error.message, "error");
        return;
      }
      addToast("Contraseña actualizada correctamente", "success");
      setShowPasswordModal(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Error al cambiar la contraseña", "error");
    } finally {
      setSavingPassword(false);
    }
  }

  function handleShopSwitch(nextSlug: string) {
    if (!nextSlug) return;
    if (nextSlug === selectedShopSlug) return;
    const shop = managedShops.find((s) => s.slug === nextSlug);
    if (shop?.id) {
      const isSecure = window.location.protocol === "https:";
      document.cookie = `klip_active_shop_id=${shop.id}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${isSecure ? "; Secure" : ""}`;
    }
    const parts = pathname.split("/").filter(Boolean);
    const tail = parts[0] === "dashboard" ? parts.slice(2).join("/") : "";
    const nextPath = tail ? `/dashboard/${nextSlug}/${tail}` : `/dashboard/${nextSlug}`;
    router.push(nextPath);
  }

  return (
    <>
      <header
        ref={headerElRef}
        className="dashboard-mobile-header absolute inset-x-0 top-0 z-50 flex items-center gap-4 backdrop-blur-xl shadow-sm border-b border-white/10 dark:border-white/5 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.5rem)] touch-pan-x [overscroll-behavior-y:none] lg:px-6 lg:pt-2.5"
      >
        <button
          ref={inHeaderMenuRef}
          type="button"
          onClick={handleMobileOpen}
          aria-label="Abrir menú de navegación"
          aria-hidden={headerFloating}
          tabIndex={headerFloating ? -1 : 0}
          className={`min-[1367px]:hidden p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5 transition-all duration-200 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
            headerFloating ? "pointer-events-none" : ""
          }`}
        >
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-2 shrink-0" style={{ transform: "translateY(calc(var(--hp, 0) * 26px))", opacity: "calc((1 - var(--hp, 0)) * (1 - var(--hp, 0)))" }}>
          <div className="relative group" ref={shopMenuRef}>
            <button
              type="button"
              onClick={() => managedShops.length > 1 && setShopMenuOpen((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-xl px-2 py-1 transition ${managedShops.length > 1 ? "hover:bg-white/35 dark:hover:bg-white/10" : "cursor-default"}`}
              aria-haspopup={managedShops.length > 1 ? "menu" : undefined}
              aria-expanded={managedShops.length > 1 ? shopMenuOpen : undefined}
              aria-label="Local actual"
            >
              <h2 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white tracking-tight">
                {selectedShop?.nombre || shopName}
              </h2>
              {managedShops.length > 1 && (
                <Repeat2 className={`h-4 w-4 text-gray-500 dark:text-zinc-400 transition-all ${shopMenuOpen ? "opacity-100 rotate-180" : "opacity-0 group-hover:opacity-100"}`} />
              )}
            </button>
            <AnimatePresence>
              {managedShops.length > 1 && shopMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.985 }}
                  transition={{ duration: 0.08, ease: "easeOut" }}
                  className="absolute left-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-white/30 bg-white/72 p-1 shadow-xl shadow-black/10 backdrop-blur-lg dark:border-white/10 dark:bg-zinc-950/78"
                  role="menu"
                >
                  {managedShops.map((shop) => {
                    const isActive = shop.slug === selectedShopSlug;
                    return (
                      <button
                        key={shop.slug}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShopMenuOpen(false);
                          handleShopSwitch(shop.slug);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                          isActive
                            ? "bg-violet-500/10 text-violet-700 dark:bg-violet-500/18 dark:text-violet-200"
                            : "text-gray-700 hover:bg-white/60 dark:text-zinc-200 dark:hover:bg-white/8"
                        }`}
                      >
                        <span className="truncate">{shop.nombre}</span>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-violet-700/90 dark:text-violet-200/90">
                            Actual
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="hidden sm:flex flex-1 justify-center" style={{ transform: "translateY(calc(var(--hp, 0) * -22px))", opacity: "calc(1 - var(--hp, 0) * 1.3)" }}>
          <motion.div
            ref={searchRef}
            animate={{ width: searchOpen ? SEARCH_EXPANDED_WIDTH : SEARCH_COLLAPSED_WIDTH }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="relative"
          >
            <input
              type="text"
              name="username"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute opacity-0 pointer-events-none h-0 w-0"
            />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute opacity-0 pointer-events-none h-0 w-0"
            />
            <div className="rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 px-4 py-2 text-sm text-zinc-500 transition-all flex items-center">
              <Search className="w-4 h-4 mr-3" />
              {!searchFocused && query.trim().length === 0 && (
                <div className="absolute left-11 right-24 pointer-events-none flex items-center text-sm">
                  <span className="text-zinc-500">Buscá </span>
                  <span className="relative ml-1 inline-flex w-[12ch] overflow-hidden h-5 items-center text-zinc-400">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={rotatingWords[placeholderIndex]}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.24, ease: "easeOut" }}
                        className="absolute left-0"
                      >
                        {rotatingWords[placeholderIndex]}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </div>
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (!searchOpen) playSearchExpand();
                  setSearchOpen(true);
                }}
                onFocus={() => {
                  if (!searchOpen) playSearchExpand();
                  setSearchOpen(true);
                  setSearchInputReady(true);
                  setSearchFocused(true);
                }}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={onPaletteKeyDown}
                placeholder={searchFocused ? "Escribí para buscar..." : ""}
                autoComplete="one-time-code"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                name="klip-global-search"
                id="search-input-klip"
                type="search"
                inputMode="search"
                data-lpignore="true"
                data-form-type="other"
                data-1p-ignore="true"
                aria-autocomplete="none"
                readOnly={!searchInputReady}
                className="flex-1 bg-transparent outline-none text-zinc-700 dark:text-zinc-100 placeholder-zinc-400"
              />
              {!searchOpen && query.trim().length === 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-zinc-300 dark:text-zinc-500">
                  <span>Ctrl</span>
                  <span className="text-[11px]">+</span>
                  <span className="text-sm leading-none">K</span>
                </span>
              )}

            </div>

            <AnimatePresence>
              {showSearchDropdown && (query.trim().length > 0 || commandItems.flat.length > 0 || isPending || searchError) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute top-12 left-0 right-0 z-[70] rounded-2xl border border-black/[0.05] dark:border-white/10 bg-white/90 dark:bg-black/78 backdrop-blur-[16px] shadow-[0_24px_64px_rgba(0,0,0,0.18)] overflow-hidden"
                >
                  <div className="max-h-[56vh] overflow-y-auto p-2">
                    {searchError && <p className="px-3 py-2 text-sm text-red-600">{searchError}</p>}
                    {isPending && <p className="px-3 py-2 text-sm text-zinc-500">Buscando...</p>}

                    {commandItems.action.length > 0 && (
                      <>
                        <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">Acciones</p>
                        {commandItems.action.map((item) => {
                          const flatIndex = commandItems.flat.findIndex((x) => x.id === item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => void execute(item)}
                              className={`w-full text-left px-3 py-2 rounded-lg border-l-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                                flatIndex === activeIndex
                                  ? "bg-[#E6F2FF] border-l-[#0071E3] text-[#0f2f57]"
                                  : "border-l-transparent hover:bg-white/70 dark:hover:bg-zinc-900/40"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm">{item.label}</p>
                                  <p className="text-xs text-zinc-500">{item.hint}</p>
                                </div>
                                <span className="text-xs text-zinc-500">?</span>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {commandItems.nav.length > 0 && (
                      <>
                        <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">Acciones</p>
                        {commandItems.nav.map((item) => {
                          const flatIndex = commandItems.flat.findIndex((x) => x.id === item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => void execute(item)}
                              className={`w-full text-left px-3 py-2 rounded-lg border-l-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                                flatIndex === activeIndex
                                  ? "bg-[#E6F2FF] border-l-[#0071E3] text-[#0f2f57]"
                                  : "border-l-transparent hover:bg-white/70 dark:hover:bg-zinc-900/40"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm">{item.label}</p>
                                  <p className="text-xs text-zinc-500">{item.hint}</p>
                                </div>
                                <span className="text-xs text-zinc-500">?</span>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {commandItems.stock.length > 0 && (
                      <>
                        <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">Stock</p>
                        {commandItems.stock.map((item) => {
                          const flatIndex = commandItems.flat.findIndex((x) => x.id === item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => void execute(item)}
                              className={`w-full text-left px-3 py-2 rounded-lg border-l-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                                flatIndex === activeIndex
                                  ? "bg-[#E6F2FF] border-l-[#0071E3] text-[#0f2f57]"
                                  : "border-l-transparent hover:bg-white/70 dark:hover:bg-zinc-900/40"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm">{formatDataLabel(item.value)}</p>
                                  <p className={`text-xs ${(item.value.type === "stock" && item.value.quantity < 3) ? "text-red-600" : "text-zinc-500"}`}>{formatDataHint(item.value)}</p>
                                </div>
                                <span className="text-xs text-zinc-500">?</span>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {commandItems.services.length > 0 && (
                      <>
                        <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">Servicios</p>
                        {commandItems.services.map((item) => {
                          const flatIndex = commandItems.flat.findIndex((x) => x.id === item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => void execute(item)}
                              className={`w-full text-left px-3 py-2 rounded-lg border-l-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                                flatIndex === activeIndex
                                  ? "bg-[#E6F2FF] border-l-[#0071E3] text-[#0f2f57]"
                                  : "border-l-transparent hover:bg-white/70 dark:hover:bg-zinc-900/40"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm">{formatDataLabel(item.value)}</p>
                                  <p className="text-xs text-zinc-500">{formatDataHint(item.value)}</p>
                                </div>
                                <span className="text-xs text-zinc-500">?</span>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {commandItems.people.length > 0 && (
                      <>
                        <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">Personas</p>
                        {commandItems.people.map((item) => {
                          const flatIndex = commandItems.flat.findIndex((x) => x.id === item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => void execute(item)}
                              className={`w-full text-left px-3 py-2 rounded-lg border-l-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
                                flatIndex === activeIndex
                                  ? "bg-[#E6F2FF] border-l-[#0071E3] text-[#0f2f57]"
                                  : "border-l-transparent hover:bg-white/70 dark:hover:bg-zinc-900/40"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm">{formatDataLabel(item.value)}</p>
                                  <p className="text-xs text-zinc-500">{formatDataHint(item.value)}</p>
                                </div>
                                <span className="text-xs text-zinc-500">?</span>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {!isPending && commandItems.flat.length === 0 && !searchError && query.trim().length > 0 && (
                      <StatePanel title="Sin resultados" description="No encontramos nada con ese criterio de búsqueda." />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        <div className="flex items-center gap-2 ml-auto" style={{ transform: "translateY(calc(var(--hp, 0) * -42px))", opacity: "calc(1 - var(--hp, 0) * 1.7)" }}>
          <div className="relative">
              <motion.button
              type="button"
              data-notif-toggle="true"
              onClick={() => {
                setMenuOpen(false);
                setNotifOpen((v) => !v);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="relative p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              aria-label="Notificaciones"
              whileTap={{ scale: 0.95 }}
            >
              <Bell className="w-5 h-5" strokeWidth={1.5} />
              {notifCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-[0_2px_6px_rgba(239,68,68,0.5)]"
                >
                  {notifCount > 9 ? "9+" : notifCount}
                </motion.span>
              )}
            </motion.button>
            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.985 }}
                  transition={{ duration: 0.08, ease: "easeOut" }}
                >
                  <NotificationsPanel onClose={() => setNotifOpen(false)} shopId={shop?.id} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div ref={avatarMenuRef} className="relative">
            <div className="flex flex-col items-end gap-1">
              <div className="relative">
                {billingStatus.isExpired && !shouldReduceMotion && (
                  <motion.div
                    className="pointer-events-none absolute -inset-[6px] rounded-full border-2 border-rose-500/60"
                    animate={{
                      opacity: [0.3, 1, 0.3],
                      scale: [1, 1.08, 1],
                    }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
                {billingStatus.isExpired && shouldReduceMotion && (
                  <div className="pointer-events-none absolute -inset-[6px] rounded-full border-2 border-rose-500/30" />
                )}
                <motion.button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="relative h-10 w-10 rounded-full bg-[#0071E3] border border-[#0b7ff2] flex items-center justify-center text-sm font-semibold text-white shrink-0 select-none hover:bg-[#0b7ff2] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                  aria-label="Menú de usuario"
                  title={userName}
                  animate={billingStatus.isExpired && !shouldReduceMotion ? {
                    boxShadow: [
                      "0 0 6px rgba(225,29,72,0.4)",
                      "0 0 24px rgba(225,29,72,0.7), 0 0 40px rgba(225,29,72,0.25)",
                      "0 0 6px rgba(225,29,72,0.4)",
                    ],
                  } : {}}
                  transition={billingStatus.isExpired && !shouldReduceMotion ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
                >
                  <span className="-translate-y-[2px]">{getInitials(userName)}</span>
                  {billingStatus.isExpired ? (
                    <motion.span
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[30%] rounded-full px-1.5 py-[1px] text-[9px] font-semibold leading-none text-white border border-rose-400 bg-rose-600 shadow-[0_2px_8px_rgba(225,29,72,0.6)]"
                      animate={!shouldReduceMotion ? { scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] } : {}}
                      transition={!shouldReduceMotion ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
                    >
                      {daysBadgeLabel}
                    </motion.span>
                  ) : (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[30%] rounded-full px-1.5 py-[1px] text-[9px] font-semibold leading-none text-white border border-[#5da9f4] bg-[#0071E3] shadow-[0_2px_6px_rgba(0,113,227,0.45)]">
                      {daysBadgeLabel}
                    </span>
                  )}
                </motion.button>
              </div>
            </div>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.985 }}
                  transition={{ duration: 0.08, ease: "easeOut" }}
                  className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/20 dark:border-white/10 bg-white/95 dark:bg-black/85 backdrop-blur-xl shadow-xl overflow-hidden z-50"
                >
                <div className="px-3 py-2 border-b border-white/20 dark:border-white/10">
                  <p className="text-xs text-zinc-500">Cuenta</p>
                  <p className="text-sm text-gray-900 dark:text-white truncate">{userEmail || userName}</p>
                  <p className="text-[10px] font-medium text-slate-400 mt-1">{planSummary}</p>
                  {lastPaymentDate ? (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Último pago: {lastPaymentFormatted}
                    </p>
                  ) : (
                    <p className="text-[10px] text-rose-400 mt-0.5 font-medium">Sin pagos registrados</p>
                  )}
                  <motion.button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      const w = Math.min(400, Math.round(window.screen.width * 0.35));
                      const h = Math.round(w * 16 / 9);
                      const left = Math.round((window.screen.width - w) / 2);
                      const top = Math.round((window.screen.height - h) / 2);
                      window.open(
                        billingUrl,
                        "klip-subscription",
                        `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no`
                      );
                    }}
                    className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-200/60 bg-gradient-to-r from-violet-600 to-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-shadow hover:shadow-violet-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                    whileTap={{ scale: 0.97 }}
                  >
                    <motion.div
                      className="pointer-events-none absolute inset-0 rounded-2xl"
                      animate={{
                        boxShadow: [
                          "inset 0 0 12px rgba(255,255,255,0.3), 0 0 8px rgba(139,92,246,0.2)",
                          "inset 0 0 24px rgba(255,255,255,0.5), 0 0 20px rgba(139,92,246,0.5)",
                          "inset 0 0 12px rgba(255,255,255,0.3), 0 0 8px rgba(139,92,246,0.2)",
                        ],
                      }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <Sparkles className="relative z-10 h-4 w-4" />
                    <span className="relative z-10">Suscripción</span>
                    <motion.span
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-amber-200"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      Plan
                    </motion.span>
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowPasswordModal(true);
                    }}
                    className="mt-2 flex w-full items-center gap-2 rounded-xl border border-white/20 dark:border-white/10 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                  >
                    <KeyRound className="w-4 h-4 text-zinc-400" />
                    Cambiar contraseña
                  </button>
                </div>
                <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-white/20 dark:border-white/10 px-3 py-2">
                    <span className="text-sm text-gray-800 dark:text-gray-100">Modo oscuro</span>
                    <button
                      type="button"
                      onClick={toggleDark}
                      className={`relative w-10 h-5 rounded-full transition-colors ${dark ? "bg-violet-600" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${dark ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>

                  <div className={`flex items-center justify-between rounded-xl border px-3 py-2 transition-all duration-300 ${performanceMode ? "border-white/20 dark:border-white/10" : "border-violet-200/40 dark:border-violet-800/30 bg-violet-50/40 dark:bg-violet-950/30"}`}>
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className={`w-4 h-4 ${performanceMode ? "text-zinc-400 dark:text-zinc-500" : "text-violet-500"}`} />
                      <span className={performanceMode ? "text-gray-800 dark:text-gray-100" : "text-violet-800 dark:text-violet-200 font-medium"}>Animaciones</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        haptic(6);
                        togglePerformanceMode();
                      }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${performanceMode ? "bg-gray-300" : "bg-violet-600"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${performanceMode ? "translate-x-0" : "translate-x-5"}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/20 dark:border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                      {soundMuted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-sky-500" />}
                      Sonido/Vibración
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        haptic(6);
                        const nextMuted = !soundMuted;
                        setMuted(nextMuted);
                        setSoundMuted(nextMuted);
                      }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${soundMuted ? "bg-gray-300" : "bg-sky-600"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${soundMuted ? "translate-x-0" : "translate-x-5"}`} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      aria-label="Ayuda"
                      title="Ayuda"
                      onClick={() => {
                        setMenuOpen(false);
                        window.dispatchEvent(new CustomEvent("dashboard:open-help"));
                      }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/20 dark:border-white/10 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                    >
                      <CircleHelp className="w-4 h-4 text-zinc-400" />
                      <span>Ayuda</span>
                    </button>

                    <button
                      type="button"
                      aria-label="Reportar bug"
                      title="Reportar bug"
                      onClick={() => {
                        setMenuOpen(false);
                        window.dispatchEvent(new CustomEvent("dashboard:open-bug-report"));
                      }}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/20 dark:border-white/10 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                    >
                      <Bug className="w-4 h-4 text-zinc-400" />
                      <span>Bug</span>
                    </button>
                  </div>

                <div className="border-t border-white/20 dark:border-white/10 pt-3">
                  <button
                    type="button"
                    disabled={logoutPending}
                    onClick={() => {
                      setMenuOpen(false);
                      handleLogoutClick();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    <LogOut className="w-4 h-4" />
                    Cerrar sesión
                  </button>
                </div>
                </div>
              </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Hamburger flotante: emerge progresivamente con el scroll */}
      <button
        ref={floatBtnRef}
        type="button"
        onClick={handleMobileOpen}
        aria-label="Abrir menú de navegación"
        aria-hidden={!headerFloating}
        tabIndex={headerFloating ? 0 : -1}
        style={{
          opacity: 0,
          transform: "scale(0.55)",
          borderRadius: "14px",
          pointerEvents: "none",
        }}
        className="fixed left-4 top-[calc(env(safe-area-inset-top)+0.65rem)] z-[60] min-[1367px]:hidden flex items-center justify-center w-11 h-11 text-gray-500 dark:text-zinc-200 bg-white/75 dark:bg-zinc-900/70 backdrop-blur-xl border border-white/50 dark:border-white/10 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.25)] hover:bg-white dark:hover:bg-zinc-800/90 hover:shadow-[0_10px_28px_-6px_rgba(124,58,237,0.35)] hover:text-violet-600 dark:hover:text-violet-300 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <Menu className="w-5 h-5" strokeWidth={1.5} />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-40 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={() => setMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      <DashboardMobileSidebar
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        userName={userName}
      />

      <BaseModal
        open={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="Cambiar contraseña"
        subtitle="Elegí una nueva contraseña para tu cuenta"
        maxWidth="sm"
        icon={<KeyRound className="w-5 h-5" />}
      >
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Nueva contraseña</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoFocus
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">Repetí la nueva contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button type="button" onClick={() => setShowPasswordModal(false)} className="ui-btn-ghost rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
          <button
            type="button"
            onClick={handleChangePassword}
            disabled={savingPassword}
            className="ui-btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {savingPassword ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </BaseModal>

      <style jsx global>{`
        #search-input-klip::-webkit-search-decoration,
        #search-input-klip::-webkit-search-cancel-button,
        #search-input-klip::-webkit-search-results-button,
        #search-input-klip::-webkit-search-results-decoration {
          -webkit-appearance: none;
          appearance: none;
          display: none;
        }
        #search-input-klip:focus-visible {
          box-shadow: none !important;
        }
      `}</style>
    </>
  );
});

export default DashboardHeader;
