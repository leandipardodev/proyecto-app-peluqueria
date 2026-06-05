"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useSpring } from "framer-motion";
import {
  Home,
  CalendarDays,
  Package,
  UserRound,
  LogOut,
  Wallet,
  Store,
  Gift,
  Bug,
} from "lucide-react";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import { haptic } from "@/lib/haptic";
import { APP_VERSION } from "@/lib/app-version";
import { usePerformanceMode } from "@/lib/use-performance-mode";
import { triggerDashboardNavTransition } from "@/lib/dashboard/nav-transition";
import { useAuth } from "@/lib/auth-context";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";
import { useShopFeatures } from "@/lib/industry/use-features";
import { getDashboardBasePath } from "@/lib/dashboard/dashboard-base";

const navItems = [
  { label: "Inicio", href: "/dashboard", icon: Home },
  { label: "Calendario", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Caja", href: "/dashboard/finances", icon: Wallet },
  { label: "Stock", href: "/dashboard/inventory", icon: Package },
  { label: "Marketing", href: "/dashboard/fidelizacion", icon: Gift },
  { label: "__CUSTOMERS_LABEL__", href: "/dashboard/customers", icon: UserRound },
  { label: "Mi Negocio", href: "/dashboard/business", icon: Store },
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
  onLogout: () => void;
  className?: string;
  notifications?: { urgentAppointments?: boolean; lowStock?: boolean };
  showBrand?: boolean;
}

export default function DashboardSidebar({
  userName,
  onLogout,
  className = "",
  notifications,
  showBrand = true,
}: DashboardSidebarProps) {
  const { shop } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerPlural = INDUSTRY_CONFIG[industry].labels.customerPlural;
  const features = useShopFeatures();
  const resolvedNavItems = navItems
    .filter((item) => {
      if (item.href === "/dashboard/inventory") return features.inventory;
      if (item.href === "/dashboard/fidelizacion") return features.marketing;
      return true;
    })
    .map((item) => (item.label === "__CUSTOMERS_LABEL__" ? { ...item, label: customerPlural } : item));
  const pathname = usePathname();
  const router = useRouter();
  const dashboardBasePath = getDashboardBasePath(pathname);
  const { playClick } = useKlipSounds();
  const { performanceMode } = usePerformanceMode();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState({
    urgentAppointments: Boolean(notifications?.urgentAppointments),
    lowStock: Boolean(notifications?.lowStock),
  });

  useEffect(() => {
    let isMounted = true;

    const loadNotifications = async () => {
      try {
        const res = await fetch("/api/dashboard/notifications", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { urgentAppointments?: boolean; lowStock?: boolean };
        if (!isMounted) return;
        setLiveNotifications({
          urgentAppointments: Boolean(data.urgentAppointments),
          lowStock: Boolean(data.lowStock),
        });
      } catch {
      }
    };

    loadNotifications();
    const id = window.setInterval(loadNotifications, 45_000);
    return () => {
      isMounted = false;
      window.clearInterval(id);
    };
  }, [pathname]);

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
    <AnimatePresence mode="wait">
      <motion.aside
        key="desktop-sidebar"
        className={`flex flex-col bg-white/10 dark:bg-black/10 backdrop-blur-3xl border-r border-white/20 dark:border-white/10 border-t border-l border-white/40 dark:border-t-white/20 dark:border-l-white/20 h-full transition-colors ${className}`}
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -300, opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
        transition={performanceMode ? { duration: 0.1 } : { type: "spring", damping: 25, stiffness: 200 }}
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
          initial="hidden"
          animate="show"
        >
          {resolvedNavItems.map(({ label, href, icon: Icon }) => {
            const targetHref = href === "/dashboard" ? dashboardBasePath : `${dashboardBasePath}${href.replace("/dashboard", "")}`;
            const isActive =
              pathname === targetHref ||
              (href !== "/dashboard" && pathname.startsWith(targetHref));

            const isBusiness = href === "/dashboard/business";
            const showAlert =
              (href === "/dashboard/calendar" && liveNotifications.urgentAppointments) ||
              (href === "/dashboard/inventory" && liveNotifications.lowStock);

            return (
              <motion.div
                key={href}
                variants={navItemVariants}
                whileHover={performanceMode ? undefined : { x: 5 }}
                whileTap={performanceMode ? undefined : { scale: 0.97 }}
              >
                  <Link
                    href={targetHref}
                    prefetch={true}
                    onMouseDown={() => {
                      playClick();
                      haptic(6);
                      startNavTransition();
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
                  {showAlert && (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 relative z-10" title={href === "/dashboard/calendar" ? "Turnos próximos urgentes" : "Stock bajo"} />
                  )}
                  {isBusiness && needsSetup && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 relative z-10 animate-pulse" title="Configuración pendiente" />
                  )}
                </Link>
              </motion.div>
            );
          })}
        </motion.nav>
      </LayoutGroup>

      <div className="px-4 py-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 truncate">
            {userName}
          </span>
          <motion.div
            whileHover={performanceMode ? undefined : { scale: 1.05 }}
            transition={performanceMode ? { duration: 0.1 } : { type: "spring", stiffness: 400, damping: 15 }}
          >
            <button
              onMouseDown={playClick}
              onClick={onLogout}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-white/60 dark:hover:bg-white/5 transition-all cursor-pointer"
              title="Cerrar Sesión"
            >
              <LogOut className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </motion.div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Version actual: v{APP_VERSION}</p>
          <button
            type="button"
            onMouseDown={playClick}
            onClick={() => window.dispatchEvent(new CustomEvent("dashboard:open-bug-report"))}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-200/80 px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-white/80 hover:text-zinc-700 dark:border-zinc-700/80 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            title="Reportar bug"
          >
            <Bug className="h-3.5 w-3.5" strokeWidth={1.8} />
            Bug
          </button>
        </div>
      </div>
    </motion.aside>
    </AnimatePresence>
  );
}

const letters = "Klip".split("");

function KlipLogo({ performanceMode }: { performanceMode: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [hovered, setHovered] = useState(false);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 200, damping: 20 });
  const springY = useSpring(rotateY, { stiffness: 200, damping: 20 });

  function handleMouseMove(e: React.MouseEvent) {
    if (performanceMode) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    rotateX.set((y - 0.5) * -24);
    rotateY.set((x - 0.5) * 24);
  }

  function handleMouseLeave() {
    if (performanceMode) return;
    setHovered(false);
    rotateX.set(0);
    rotateY.set(0);
  }

  function handleClick() {
    if (performanceMode) return;
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

  if (performanceMode) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="text-2xl font-bold tracking-tight text-[#0071E3]">Klip</span>
      </div>
    );
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
