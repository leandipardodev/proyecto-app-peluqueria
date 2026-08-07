"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, memo } from "react";
import { LayoutGroup, animate, motion, useMotionValue, useSpring } from "framer-motion";
import {
  Home,
  CalendarDays,
  Package,
  UserRound,
  Wallet,
  Store,
  Gift,
  ArrowLeftRight,
  Clock,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import { haptic } from "@/lib/haptic";
import { APP_VERSION } from "@/lib/app-version";
import { usePerformanceMode } from "@/lib/use-performance-mode";
import { triggerDashboardNavTransition } from "@/lib/dashboard/shared/nav-transition";
import { useAuth } from "@/lib/auth-context";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";
import { getDashboardBasePath } from "@/lib/dashboard/shared/dashboard-base";
import { useNotifications } from "@/lib/dashboard/use-notifications";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  tab?: "products" | "orders";
  query?: string;
};

const navItems: NavItem[] = [
  { label: "Inicio", href: "/dashboard", icon: Home },
  { label: "Calendario", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Caja", href: "/dashboard/finances", icon: Wallet },
  { label: "Productos", href: "/dashboard/inventory", icon: Package, tab: "products" },
  { label: "Pedidos", href: "/dashboard/inventory", icon: ShoppingBag, tab: "orders", query: "?tab=orders" },
  { label: "Marketing", href: "/dashboard/fidelizacion", icon: Gift },
  { label: "Transferencias", href: "/dashboard/bank-transfers", icon: ArrowLeftRight },
  { label: "__CUSTOMERS_LABEL__", href: "/dashboard/customers", icon: UserRound },
  { label: "Mi Negocio", href: "/dashboard/business", icon: Store },
];

const staffOnlyItems: NavItem[] = [
  { label: "Mi Horario", href: "/dashboard/my-schedule", icon: Clock },
];

const containerVariants = {
  hidden: {},
  show: {
    transition: { delayChildren: 0.15, staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { x: -20, opacity: 0 },
  show: { x: 0, opacity: 1, transition: { type: "spring" as const, damping: 25, stiffness: 200 } },
};

interface DashboardSidebarProps {
  userName: string;
  className?: string;
  notifications?: { urgentAppointments?: boolean; lowStock?: boolean };
  showBrand?: boolean;
  onNavigate?: () => void;
}

const DashboardSidebar = memo(function DashboardSidebar({
  userName,
  className = "",
  notifications,
  showBrand = true,
  onNavigate,
}: DashboardSidebarProps) {
  const { shop, user } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerPlural = INDUSTRY_CONFIG[industry].labels.customerPlural;
  const liveNotifications = useNotifications();
  const resolvedNavItems = [
    ...navItems.filter(
      (item) =>
        (item.href !== "/dashboard/bank-transfers" || shop?.bankTransferEnabled) &&
        (item.label !== "Pedidos" || liveNotifications.storeEnabled)
    ),
    ...(user?.role === "staff" ? staffOnlyItems : []),
  ].map((item) => (item.label === "__CUSTOMERS_LABEL__" ? { ...item, label: customerPlural } : item));
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dashboardBasePath = getDashboardBasePath(pathname);
  const { playClick } = useKlipSounds();
  const { performanceMode } = usePerformanceMode();
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    const slug = shop?.slug;
    if (!slug) { setNeedsSetup(false); return; }
    const key = `klip-business-onboarding-v1:${slug}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        if (raw === "1") { setNeedsSetup(false); return; }
        const parsed = JSON.parse(raw);
        if (parsed?.doneAt || parsed?.active === false) setNeedsSetup(false);
        else setNeedsSetup(true);
      } else {
        setNeedsSetup(true);
      }
    } catch { setNeedsSetup(true); }
  }, [shop?.slug, pathname]);

  useEffect(() => {
    const targets = resolvedNavItems
      .map(({ href }) => (href === "/dashboard" ? dashboardBasePath : `${dashboardBasePath}${href.replace("/dashboard", "")}`))
      .filter((href) => href !== pathname);

    const runPrefetch = () => {
      for (const href of targets) router.prefetch(href);
    };

    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) {
      const id = idle(runPrefetch, { timeout: 1200 });
      return () => window.cancelIdleCallback?.(id);
    }

    const timeoutId = window.setTimeout(runPrefetch, 250);
    return () => window.clearTimeout(timeoutId);
  }, [dashboardBasePath, pathname, resolvedNavItems, router]);

  const navContainerVariants = performanceMode
    ? { hidden: {}, show: {} }
    : containerVariants;
  const navItemVariants = performanceMode
    ? { hidden: { opacity: 1, x: 0 }, show: { opacity: 1, x: 0 } }
    : itemVariants;

  function startNavTransition() {
    triggerDashboardNavTransition();
  }

  return (
      <motion.aside
        initial={false}
        animate={{ x: 0, opacity: 1 }}
        className={`flex flex-col bg-white/30 dark:bg-black/30 backdrop-blur-3xl shadow-sm border-r border-white/10 dark:border-white/5 border-t border-l border-white/30 dark:border-t-white/15 dark:border-l-white/15 h-full ${className}`}
      >
      {showBrand && (
        <div className="px-6 pt-9 pb-7">
          <KlipLogo performanceMode={performanceMode} />
          <div className="mt-5 h-px bg-black/5 dark:bg-white/10" />
        </div>
      )}

      <LayoutGroup>
        <motion.nav
          className="flex-1 px-3 space-y-1"
          variants={navContainerVariants}
          initial={false}
          animate="show"
        >
          {resolvedNavItems.map(({ label, href, icon: Icon, tab, query }) => {
            const targetHref = href === "/dashboard" ? dashboardBasePath : `${dashboardBasePath}${href.replace("/dashboard", "")}`;
            const linkHref = query ? `${targetHref}${query}` : targetHref;
            const isInventoryNav = href === "/dashboard/inventory";
            const currentTab = searchParams.get("tab") ?? "products";
            const isActive =
              (href === "/dashboard" ? pathname === targetHref : pathname.startsWith(targetHref)) &&
              (!isInventoryNav || currentTab === (tab ?? "products"));

            const isBusiness = href === "/dashboard/business";
            const showLowStockAlert = isInventoryNav && tab !== "orders" && liveNotifications.lowStock;
            const showPendingOrdersAlert = isInventoryNav && liveNotifications.pendingOrders > 0;
            const showUrgentAppointmentsAlert = href === "/dashboard/calendar" && liveNotifications.urgentAppointments;
            const showTransferBadge = href === "/dashboard/bank-transfers" && liveNotifications.pendingTransfers > 0;

            return (
              <motion.div
                key={tab ? `${href}?tab=${tab}` : href}
                variants={navItemVariants}
                whileHover={performanceMode ? undefined : { x: 5 }}
                whileTap={performanceMode ? undefined : { scale: 0.97 }}
              >
                  <Link
                    href={linkHref}
                    prefetch={true}
                    draggable={false}
                    onMouseDown={() => {
                      playClick();
                      haptic(6);
                      startNavTransition();
                      requestAnimationFrame(() => onNavigate?.());
                    }}
                    className={`relative flex items-center gap-3 px-3 py-3 rounded-2xl text-sm font-medium transition-colors cursor-pointer select-none ${
                    isActive
                      ? "text-violet-700 dark:text-white"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-white/5 hover:text-zinc-700 dark:hover:text-white"
                  }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                  {isActive && (
                    <motion.div
                      layoutId="active-pill"
                      className="absolute inset-0 rounded-2xl bg-white/30 dark:bg-white/10 border border-white/20 dark:border-white/10 shadow-sm"
                      transition={performanceMode ? { duration: 0.1 } : { type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon
                    className={`w-5 h-5 shrink-0 relative z-10 ${
                      isActive ? "text-violet-600 dark:text-violet-400" : "text-zinc-400 dark:text-zinc-500"
                    }`}
                    strokeWidth={1.5}
                  />
                  <span className={`flex-1 relative z-10 ${isBusiness && needsSetup ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}`}>{label}</span>
                  {showPendingOrdersAlert && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 relative z-10 animate-pulse" title="Pedidos nuevos de tienda" />
                  )}
                  {showLowStockAlert && (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 relative z-10" title="Stock bajo" />
                  )}
                  {showUrgentAppointmentsAlert && (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 relative z-10" title="Turnos pr├│ximos urgentes" />
                  )}
                  {showTransferBadge && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold shrink-0 relative z-10">
                      {liveNotifications.pendingTransfers}
                    </span>
                  )}
                  {isBusiness && needsSetup && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 relative z-10 animate-pulse" title="Configuraci├│n pendiente" />
                  )}
                </Link>
              </motion.div>
            );
          })}
        </motion.nav>
      </LayoutGroup>

      <div className="px-4 py-5">
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 truncate block">
          {userName}
        </span>
      </div>
    </motion.aside>
  );
});

export default DashboardSidebar;

const letters = "Klip".split("");

function KlipLogo({ performanceMode: _perfMode }: { performanceMode?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [hovered, setHovered] = useState(false);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 200, damping: 20 });
  const springY = useSpring(rotateY, { stiffness: 200, damping: 20 });

  function handleMouseMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    rotateX.set((y - 0.5) * -24);
    rotateY.set((x - 0.5) * 24);
  }

  function handleMouseLeave() {
    setHovered(false);
    rotateX.set(0);
    rotateY.set(0);
  }

  function handleClick() {
    letterRefs.current.forEach((el, i) => {
      if (!el) return;
      const angle = Math.random() * Math.PI * 2;
      const distance = 80 + Math.random() * 120;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      const tr = (Math.random() - 0.5) * 360;

      animate(el,
        { x: tx, y: ty, rotate: tr },
        { duration: 0.25, delay: i * 0.04, ease: "easeOut" },
      ).then(() => {
        animate(el,
          { x: 0, y: 0, rotate: 0 },
          { type: "spring", stiffness: 250, damping: 7, mass: 0.6 },
        );
      });
    });
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      className="inline-flex items-center gap-2 cursor-pointer select-none"
      style={{ perspective: "500px", transformStyle: "preserve-3d" }}
    >
      <motion.span
        className="text-2xl font-bold tracking-tight text-[#0071E3] inline-flex"
        style={{
          rotateX: springX,
          rotateY: springY,
          transformStyle: "preserve-3d",
        }}
      >
        {letters.map((letter, i) => (
          <motion.span
            key={i}
            ref={(el) => { letterRefs.current[i] = el; }}
            className="inline-block"
            animate={hovered ? {
              y: [0, -5, 0],
              color: ["#0071E3", "#4a9eff", "#0071E3"],
              transition: {
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.12,
              },
            } : {
              y: 0,
              color: "#0071E3",
            }}
            whileTap={{ scale: 0.9 }}
            style={{ transformStyle: "preserve-3d" }}
          >
            {letter}
          </motion.span>
        ))}
      </motion.span>
    </div>
  );
}
