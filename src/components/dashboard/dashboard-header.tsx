"use client";

import { Menu, Search, Moon, Sun, Gauge, Repeat2, Check, Volume2, VolumeX, SlidersHorizontal } from "lucide-react";
import { useState, useRef, useEffect, useTransition, useMemo, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DashboardMobileSidebar from "./dashboard-mobile-sidebar";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { globalSearch, type OmniSearchResult } from "@/lib/dashboard/global-search-actions";
import { useDarkMode } from "@/lib/use-dark-mode";
import { usePerformanceMode } from "@/lib/use-performance-mode";
import { triggerDashboardNavTransition } from "@/lib/dashboard/nav-transition";
import { useAuth } from "@/lib/auth-context";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";
import { useShopFeatures } from "@/lib/industry/use-features";
import { isMuted, setMuted } from "@/lib/sound";
import { getDashboardBasePath, withDashboardBase } from "@/lib/dashboard/dashboard-base";
import { DASHBOARD_LEGACY_SEGMENTS_SET } from "@/lib/dashboard/legacy-segments";
import { NAV_COMMANDS, ACTION_COMMANDS, type CommandItem, type CommandNav, type CommandAction, type CommandData } from "@/lib/dashboard/search-commands";
import { getIndustrySearchKeywords, getInitials, normalizeSearchText, scoreQueryAgainstTerms, formatDataLabel, formatDataHint } from "@/lib/dashboard/search-utils";

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
}

const SEARCH_COLLAPSED_WIDTH = 280;
const SEARCH_EXPANDED_WIDTH = 640;

export default function DashboardHeader({ shopName, userName, userEmail, onLogout, activeShopSlug, managedShops, billingStatus }: DashboardHeaderProps) {

  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerPlural = INDUSTRY_CONFIG[industry].labels.customerPlural;
  const servicePlural = INDUSTRY_CONFIG[industry].labels.servicePlural;
  const staffPlural = INDUSTRY_CONFIG[industry].labels.staffPlural;
  const features = useShopFeatures();
  const filteredNavCommands = NAV_COMMANDS.filter((cmd) => {
    if (cmd.id === "nav-stock") return features.inventory;
    if (cmd.id === "nav-marketing") return features.marketing;
    return true;
  });
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

  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const [logoutPending, startLogoutTransition] = useTransition();
  const [soundMuted, setSoundMuted] = useState(false);

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

  const rotatingWords = [
    "clientes...",
    ...(features.inventory ? ["stock..."] : []),
    "caja...",
    ...(features.marketing ? ["marketing..."] : []),
    "comandos...",
  ];
  const daysBadgeLabel = billingStatus.daysRemaining === null
    ? "--"
    : billingStatus.daysRemaining > 0
      ? `${billingStatus.daysRemaining}d`
      : billingStatus.inGrace
        ? `G${Math.max(0, billingStatus.graceDaysRemaining ?? 0)}d`
        : "0d";
  const planSummary = billingStatus.daysRemaining === null
    ? "PLAN PRO"
    : billingStatus.daysRemaining > 0
      ? `PLAN PRO • ${billingStatus.daysRemaining} DIAS RESTANTES`
      : billingStatus.inGrace
        ? `PLAN VENCIDO • EN GRACIA (${Math.max(0, billingStatus.graceDaysRemaining ?? 0)} DIAS)`
        : "PLAN VENCIDO";
  const showBillingCta =
    billingStatus.daysRemaining !== null && billingStatus.daysRemaining <= 3;
  const billingCtaTone =
    billingStatus.daysRemaining !== null && billingStatus.daysRemaining <= 0
      ? "critical"
      : billingStatus.daysRemaining !== null && billingStatus.daysRemaining <= 1
        ? "warning"
        : "normal";
  const billingCtaClass =
    billingCtaTone === "critical"
      ? "mt-2 inline-flex items-center rounded-full border border-red-300/80 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-700/50 dark:bg-red-900/35 dark:text-red-200"
      : billingCtaTone === "warning"
        ? "mt-2 inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-900/35 dark:text-amber-200"
        : "mt-2 inline-flex items-center rounded-full border border-rose-300/70 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-200";
  const billingCtaLabel =
    billingCtaTone === "critical"
      ? "Plan vencido - pagar ahora"
      : billingCtaTone === "warning"
        ? "Vence pronto - pagar"
        : "Pagar mensualidad";

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
    function handleClickOutside(e: MouseEvent) {
      if (!avatarMenuRef.current) return;
      if (!avatarMenuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!shopMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (!shopMenuRef.current) return;
      if (!shopMenuRef.current.contains(e.target as Node)) {
        setShopMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [shopMenuOpen]);

  useEffect(() => {
    setSoundMuted(isMuted());
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!searchOpen || q.length < 2) {
      setDbResults([]);
      setSearchError(null);
      return;
    }

    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearch(q);
        if (!res.success) {
          setSearchError(res.error);
          setDbResults([]);
          return;
        }
        setSearchError(null);
        setDbResults(res.data ?? []);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchOpen]);

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
      await onLogout();
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
    if (e.key === "Enter") {
      e.preventDefault();
      void execute(commandItems.flat[activeIndex]);
    }
  }

  function handleLogoutClick() {
    startLogoutTransition(async () => {
      await onLogout();
      router.refresh();
    });
  }

  function handleShopSwitch(nextSlug: string) {
    if (!nextSlug) return;
    if (nextSlug === selectedShopSlug) return;
    const parts = pathname.split("/").filter(Boolean);
    const tail = parts[0] === "dashboard" ? parts.slice(2).join("/") : "";
    const nextPath = tail ? `/dashboard/${nextSlug}/${tail}` : `/dashboard/${nextSlug}`;
    router.push(nextPath);
  }

  return (
    <>
      <header className="dashboard-mobile-header sticky top-0 z-50 shrink-0 flex items-center gap-4 bg-white/10 dark:bg-black/10 backdrop-blur-xl border-b border-white/20 dark:border-white/10 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.5rem)] touch-pan-x [overscroll-behavior-y:none] lg:px-6 lg:pt-2.5 transition-colors">
        <button
          onClick={handleMobileOpen}
          className="lg:hidden p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/5 transition-all cursor-pointer select-none"
        >
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative group" ref={shopMenuRef}>
            <button
              type="button"
              onClick={() => managedShops.length > 1 && setShopMenuOpen((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-xl px-2 py-1 transition ${pathname === dashboardBasePath ? "" : ""} ${managedShops.length > 1 ? "hover:bg-white/35 dark:hover:bg-white/10" : "cursor-default"}`}
              aria-haspopup={managedShops.length > 1 ? "menu" : undefined}
              aria-expanded={managedShops.length > 1 ? shopMenuOpen : undefined}
              aria-label="Local actual"
            >
              <h2 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white tracking-tight">
                {managedShops.find((shop) => shop.slug === selectedShopSlug)?.nombre || shopName}
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
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
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

        <div className="hidden sm:flex flex-1 justify-center">
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
                              className={`w-full text-left px-3 py-2 rounded-lg border-l-4 transition-all ${
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
                                <span className="text-xs text-zinc-500">↵</span>
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
                              className={`w-full text-left px-3 py-2 rounded-lg border-l-4 transition-all ${
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
                                <span className="text-xs text-zinc-500">↵</span>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {commandItems.stock.length > 0 && (
                      <>
                        <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">📦 Stock</p>
                        {commandItems.stock.map((item) => {
                          const flatIndex = commandItems.flat.findIndex((x) => x.id === item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => void execute(item)}
                              className={`w-full text-left px-3 py-2 rounded-lg border-l-4 transition-all ${
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
                                <span className="text-xs text-zinc-500">↵</span>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {commandItems.services.length > 0 && (
                      <>
                        <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">✂️ Servicios</p>
                        {commandItems.services.map((item) => {
                          const flatIndex = commandItems.flat.findIndex((x) => x.id === item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => void execute(item)}
                              className={`w-full text-left px-3 py-2 rounded-lg border-l-4 transition-all ${
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
                                <span className="text-xs text-zinc-500">↵</span>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {commandItems.people.length > 0 && (
                      <>
                        <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-zinc-500">👤 Personas</p>
                        {commandItems.people.map((item) => {
                          const flatIndex = commandItems.flat.findIndex((x) => x.id === item.id);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => void execute(item)}
                              className={`w-full text-left px-3 py-2 rounded-lg border-l-4 transition-all ${
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
                                <span className="text-xs text-zinc-500">↵</span>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {!isPending && commandItems.flat.length === 0 && !searchError && query.trim().length > 0 && (
                      <p className="px-3 py-6 text-sm text-zinc-500 text-center">Sin resultados</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <div ref={avatarMenuRef} className="relative">
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="relative h-10 w-10 rounded-full bg-[#0071E3] border border-[#0b7ff2] flex items-center justify-center text-sm font-semibold text-white shrink-0 select-none hover:bg-[#0b7ff2] transition-colors"
                title={userName}
              >
                <span className="-translate-y-[2px]">{getInitials(userName)}</span>
                <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[30%] rounded-full px-1.5 py-[1px] text-[9px] font-semibold leading-none text-white border ${billingStatus.isExpired ? "bg-rose-600 border-rose-400 shadow-[0_2px_6px_rgba(225,29,72,0.5)]" : "bg-[#0071E3] border-[#5da9f4] shadow-[0_2px_6px_rgba(0,113,227,0.45)]"}`}>
                  {daysBadgeLabel}
                </span>
              </button>
            </div>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-white/20 dark:border-white/10 bg-white/95 dark:bg-black/85 backdrop-blur-xl shadow-xl overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-white/20 dark:border-white/10">
                  <p className="text-xs text-zinc-500">Cuenta</p>
                  <p className="text-sm text-gray-900 dark:text-white truncate">{userEmail || userName}</p>
                  <p className="text-[10px] font-medium text-slate-400 mt-1">{planSummary}</p>
                  {showBillingCta && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        navigateWithTransition(billingUrl);
                      }}
                      className={billingCtaClass}
                    >
                      {billingCtaLabel}
                    </button>
                  )}
                </div>
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-white/20 dark:border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                      {dark ? <Moon className="w-4 h-4 text-violet-500" /> : <Sun className="w-4 h-4 text-amber-500" />}
                      {dark ? "Modo oscuro" : "Modo claro"}
                    </div>
                    <button
                      type="button"
                      onClick={toggleDark}
                      className={`relative w-10 h-5 rounded-full transition-colors ${dark ? "bg-violet-600" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${dark ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/20 dark:border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                      <Gauge className={`w-4 h-4 ${performanceMode ? "text-emerald-500" : "text-zinc-400"}`} />
                      {performanceMode ? "Animaciones desactivadas" : "Desactivar animaciones"}
                    </div>
                    <button
                      type="button"
                      onClick={togglePerformanceMode}
                      className={`relative w-10 h-5 rounded-full transition-colors ${performanceMode ? "bg-emerald-600" : "bg-gray-300"}`}
                      title="Atajo: tecla L"
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${performanceMode ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/20 dark:border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                      {soundMuted ? <VolumeX className="w-4 h-4 text-zinc-400" /> : <Volume2 className="w-4 h-4 text-sky-500" />}
                      {soundMuted ? "Sonido/vibracion desactivados" : "Sonido/vibracion activos"}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextMuted = !soundMuted;
                        setMuted(nextMuted);
                        setSoundMuted(nextMuted);
                      }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${soundMuted ? "bg-gray-300" : "bg-sky-600"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${soundMuted ? "translate-x-0" : "translate-x-5"}`} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigateWithTransition(`${dashboardBasePath}/features`);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl border border-white/20 dark:border-white/10 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
                    Funcionalidades del local
                  </button>

                  <button
                    type="button"
                    onClick={handleLogoutClick}
                    disabled={logoutPending}
                    className="block w-full text-left px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-60"
                  >
                    {logoutPending ? "Cerrando sesion..." : "Cerrar Sesion"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <DashboardMobileSidebar
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        userName={userName}
        onLogout={() => {
          setMobileOpen(false);
          void onLogout();
        }}
      />

      <style jsx global>{`
        #search-input-klip::-webkit-search-decoration,
        #search-input-klip::-webkit-search-cancel-button,
        #search-input-klip::-webkit-search-results-button,
        #search-input-klip::-webkit-search-results-decoration {
          -webkit-appearance: none;
          appearance: none;
          display: none;
        }
      `}</style>
    </>
  );
}
