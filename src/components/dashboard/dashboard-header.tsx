"use client";

import { Menu, X, Search, Moon, Sun, Gauge, Repeat2, Check, Volume2, VolumeX } from "lucide-react";
import { useState, useRef, useEffect, useTransition, useMemo, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DashboardSidebar from "./dashboard-sidebar";
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
import { useFeatures } from "@/lib/industry/use-features";
import { isMuted, setMuted } from "@/lib/sound";

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

type CommandNav = { id: string; kind: "nav"; label: string; hint: string; to: string; keywords: string[] };
type CommandAction = { id: string; kind: "action"; label: string; hint: string; action: "toggleTheme" | "togglePerformance" | "logout"; keywords: string[] };
type CommandData = { id: string; kind: "data"; value: OmniSearchResult };
type CommandItem = CommandNav | CommandAction | CommandData;

const NAV_COMMANDS: CommandNav[] = [
  { id: "nav-home", kind: "nav", label: "Ir a Inicio", hint: "Resumen del negocio", to: "/dashboard", keywords: ["inicio", "home", "panel", "dashboard", "resumen", "principal", "portada", "tablero", "estadisticas", "metricas", "metrcas"] },
  { id: "nav-calendar", kind: "nav", label: "Ir a Calendario", hint: "Agenda de turnos", to: "/dashboard/calendar", keywords: ["calendario", "agenda", "turnos", "citas", "reservas", "horarios", "proximos", "proximo", "agendar", "agendaa", "calendaario"] },
  { id: "nav-cash", kind: "nav", label: "Ir a Caja", hint: "Ingresos, egresos y liquidaciones", to: "/dashboard/finances", keywords: ["caja", "finanzas", "plata", "dinero", "cobros", "gastos", "ingresos", "egresos", "movimientos", "arqueo", "cierres", "liquidaciones", "comisiones", "balance", "contabilidad", "tesoreria"] },
  { id: "nav-stock", kind: "nav", label: "Ir a Stock", hint: "Inventario y productos", to: "/dashboard/inventory", keywords: ["stock", "inventario", "productos", "insumos", "deposito", "existencias", "reposicion", "bajo stock", "almacen", "almacen", "materiales", "inventrio"] },
  { id: "nav-marketing", kind: "nav", label: "Ir a Marketing", hint: "Fidelizacion, canjes y vouchers", to: "/dashboard/fidelizacion", keywords: ["marketing", "fidelizacion", "fidelidad", "puntos", "canjes", "voucher", "vouchers", "descuentos", "promos", "cupones", "campanas", "campanias", "cumpleanos", "retencion"] },
  { id: "nav-customers", kind: "nav", label: "Ir a __CUSTOMERS_LABEL__", hint: "Base de clientes", to: "/dashboard/customers", keywords: ["clientes", "clientela", "contactos", "whatsapp", "telefonos", "historial", "ficha cliente", "pacientes", "paciente", "usuario", "usuarios", "clientse", "clietnes"] },
  { id: "nav-business", kind: "nav", label: "Ir a Mi Negocio", hint: "Datos, horarios y cobros", to: "/dashboard/business", keywords: ["mi negocio", "negocio", "local", "empresa", "perfil negocio", "datos publicos", "horarios", "mercado pago", "cobro", "seña", "sena", "whatsapp template", "configuracion", "personalizacion", "branding", "book"] },
  { id: "nav-services", kind: "nav", label: "Ir a __SERVICES_LABEL__", hint: "Catalogo y duraciones", to: "/dashboard/services", keywords: ["servicios", "catalogo", "precios", "duracion", "duraciones", "barba", "corte", "tratamientos", "sesiones", "menu", "prestaciones", "servicois"] },
  { id: "nav-staff", kind: "nav", label: "Ir a __STAFF_LABEL__", hint: "Equipo y roles", to: "/dashboard/staff", keywords: ["staff", "equipo", "empleados", "barberos", "roles", "personal", "terapeutas", "profesionales", "colaboradores", "agenda staff", "staf", "empleado"] },
  { id: "nav-billing", kind: "nav", label: "Ir a Pagos", hint: "Pagar mensualidad", to: "/billing-required", keywords: ["pago", "pagos", "mensualidad", "membresia", "suscripcion", "renovar", "plan", "vencimiento", "factura", "abono", "precio", "cobro plan"] },
];

const DASHBOARD_LEGACY_SEGMENTS = new Set([
  "appointments",
  "business",
  "calendar",
  "customers",
  "finances",
  "fidelizacion",
  "inventory",
  "profile",
  "services",
  "settings",
  "staff",
  "vouchers",
]);

function getDashboardBasePath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const slug = parts[1];
  if (parts[0] === "dashboard" && slug && !DASHBOARD_LEGACY_SEGMENTS.has(slug)) {
    return `/dashboard/${slug}`;
  }
  return "/dashboard";
}

function withDashboardBase(basePath: string, to: string): string {
  if (!to.startsWith("/dashboard")) return to;
  if (to === "/dashboard") return basePath;
  return `${basePath}${to.replace("/dashboard", "")}`;
}

const ACTION_COMMANDS: CommandAction[] = [
  { id: "act-theme", kind: "action", label: "Cambiar tema", hint: "oscuro o claro", action: "toggleTheme", keywords: ["tema", "oscuro", "claro", "dark", "light", "colores", "apariencia", "modo noche", "modo dia", "paleta", "contraste"] },
  { id: "act-performance", kind: "action", label: "Desactivar animaciones", hint: "interfaz estatica", action: "togglePerformance", keywords: ["rendimiento", "performance", "lag", "animaciones", "fluidez", "rapido", "optimizar", "modo liviano", "bateria", "andar lento", "traba", "sin animaciones", "estatico", "estática"] },
  { id: "act-logout", kind: "action", label: "Cerrar sesion", hint: "salir", action: "logout", keywords: ["cerrar", "salir", "logout", "desconectar", "terminar sesion", "salirme", "desloguear"] },
];

const SEARCH_COLLAPSED_WIDTH = 280;
const SEARCH_EXPANDED_WIDTH = 640;

function getIndustrySearchKeywords(industry: ReturnType<typeof resolveIndustry>) {
  const byIndustry: Record<string, Partial<Record<CommandNav["id"], string[]>>> = {
    peluqueria: {
      "nav-services": ["corte", "cortes", "brushing", "tintura", "alisado", "peinado"],
      "nav-staff": ["peluquero", "peluquera", "colorista"],
      "nav-customers": ["clienta", "clientas"],
    },
    barberia: {
      "nav-services": ["fade", "degrade", "barba", "perfilado", "navaja"],
      "nav-staff": ["barbero", "barbera"],
      "nav-customers": ["caballeros"],
    },
    estetica: {
      "nav-services": ["limpieza facial", "facial", "depilacion", "cejas", "pestañas", "pestanas"],
      "nav-staff": ["cosmiatra", "esteticista"],
      "nav-customers": ["paciente estetica"],
    },
    unas: {
      "nav-services": ["manicuria", "manicura", "pedicuria", "pedicura", "semipermanente", "kapping", "esculpidas"],
      "nav-staff": ["manicura", "nail artist"],
      "nav-customers": ["turno uñas", "turno unas"],
    },
    masajes: {
      "nav-services": ["masaje", "descontracturante", "relajante", "drenaje", "piedras calientes"],
      "nav-staff": ["masajista", "terapeuta corporal"],
      "nav-customers": ["paciente", "consultante"],
    },
    tattoo: {
      "nav-services": ["tatuaje", "tattoo", "flash", "sesion", "sesión", "retoque"],
      "nav-staff": ["tatuador", "tattoo artist"],
      "nav-customers": ["cliente tattoo"],
    },
    piercing: {
      "nav-services": ["piercing", "perforacion", "perforación", "labret", "septum", "helix"],
      "nav-staff": ["perforador", "piercer"],
      "nav-customers": ["curacion", "curación"],
    },
  };

  return byIndustry[industry] || {};
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

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function getAllowedDistance(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length);
  if (minLen <= 4) return 1;
  if (minLen <= 8) return 2;
  return 3;
}

function scoreTokenMatch(token: string, termToken: string): number {
  if (!token || !termToken) return 0;
  if (termToken === token) return 140;
  if (termToken.startsWith(token)) return 120;
  if (termToken.includes(token)) return 95;
  if (token.startsWith(termToken) && termToken.length >= 3) return 84;
  const dist = levenshteinDistance(token, termToken);
  const allowed = getAllowedDistance(token, termToken);
  if (dist <= allowed) return Math.max(55, 86 - dist * 12);
  return 0;
}

function scoreQueryAgainstTerms(query: string, terms: string[]): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 1;
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (queryTokens.length === 0) return 1;

  let best = 0;
  for (const rawTerm of terms) {
    const term = normalizeSearchText(rawTerm);
    if (!term) continue;
    if (term.includes(normalizedQuery)) best = Math.max(best, 130);
    const termTokens = term.split(" ").filter(Boolean);
    if (termTokens.length === 0) continue;
    let score = 0;
    let matchedTokens = 0;
    for (const token of queryTokens) {
      let tokenBest = 0;
      for (const t of termTokens) {
        tokenBest = Math.max(tokenBest, scoreTokenMatch(token, t));
        if (tokenBest >= 140) break;
      }
      if (tokenBest > 0) {
        score += tokenBest;
        matchedTokens += 1;
      }
    }
    if (matchedTokens === queryTokens.length) {
      score += 18 + matchedTokens * 2;
      best = Math.max(best, score);
    }
  }
  return best;
}

function formatDataLabel(item: OmniSearchResult) {
  if (item.type === "stock") return item.nombre_producto;
  if (item.type === "service") return item.name;
  if (item.type === "customer") return item.nombre || item.telefono || "Persona";
  return item.name || item.email || "Miembro";
}

function formatDataHint(item: OmniSearchResult) {
  if (item.type === "stock") return `Cantidad disponible: ${item.quantity}`;
  if (item.type === "service") return `Duracion: ${item.duration_minutes} min`;
  if (item.type === "customer") return `Telefono: ${item.telefono || "Sin telefono"}`;
  return `${item.role === "owner" ? "Administrador" : "Miembro"} - ${item.email || "Sin email"}`;
}

export default function DashboardHeader({ shopName, userName, userEmail, onLogout, activeShopSlug, managedShops, billingStatus }: DashboardHeaderProps) {
  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerPlural = INDUSTRY_CONFIG[industry].labels.customerPlural;
  const servicePlural = INDUSTRY_CONFIG[industry].labels.servicePlural;
  const staffPlural = INDUSTRY_CONFIG[industry].labels.staffPlural;
  const features = useFeatures();
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
    if (parts[0] === "dashboard" && slug && !DASHBOARD_LEGACY_SEGMENTS.has(slug)) return slug;
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
        return { ...c, to: withDashboardBase(dashboardBasePath, c.to) };
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
        navigateWithTransition(`${withDashboardBase(dashboardBasePath, "/dashboard/customers")}?q=${encodeURIComponent(result.nombre || result.telefono || "")}&customerId=${result.id}`);
        return;
      }
      if (result.type === "stock") {
        if (!features.inventory) return;
        navigateWithTransition(withDashboardBase(dashboardBasePath, "/dashboard/inventory"));
        return;
      }
      if (result.type === "service") {
        navigateWithTransition(withDashboardBase(dashboardBasePath, "/dashboard/services"));
        return;
      }
      navigateWithTransition(withDashboardBase(dashboardBasePath, "/dashboard/staff"));
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

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="fixed inset-0 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="fixed inset-y-0 left-0 w-64 shadow-xl dark:shadow-black/40"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300, transition: { duration: 0.2, ease: "easeIn" } }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <div className="flex items-center justify-between px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] border-b border-white/20 dark:border-white/10 bg-white/30 dark:bg-black/30 backdrop-blur-3xl">
                <div className="inline-flex items-center gap-2">
                  <span className="text-xl font-bold tracking-tight text-[#0071E3]">Klip</span>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-all cursor-pointer select-none"
                >
                  <X className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>
              <DashboardSidebar
                userName={userName}
                showBrand={false}
                onLogout={() => {
                  setMobileOpen(false);
                  void onLogout();
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
