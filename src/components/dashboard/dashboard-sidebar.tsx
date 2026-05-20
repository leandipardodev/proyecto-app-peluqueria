"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  Home,
  CalendarDays,
  Package,
  UserRound,
  LogOut,
  Wallet,
  Store,
  Gift,
} from "lucide-react";
import { useKlipSounds } from "@/lib/use-klip-sounds";
import { APP_VERSION } from "@/lib/app-version";
import { usePerformanceMode } from "@/lib/use-performance-mode";

const navItems = [
  { label: "Inicio", href: "/dashboard", icon: Home },
  { label: "Calendario", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Caja", href: "/dashboard/finances", icon: Wallet },
  { label: "Stock", href: "/dashboard/inventory", icon: Package },
  { label: "Marketing", href: "/dashboard/fidelizacion", icon: Gift },
  { label: "Clientes", href: "/dashboard/customers", icon: UserRound },
  { label: "Mi Negocio", href: "/dashboard/business", icon: Store },
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
  const pathname = usePathname();
  const router = useRouter();
  const dashboardBasePath = getDashboardBasePath(pathname);
  const { playClick } = useKlipSounds();
  const { performanceMode } = usePerformanceMode();
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
    const targets = navItems
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
  }, [dashboardBasePath, pathname, router]);

  const navContainerVariants = performanceMode
    ? { hidden: {}, show: {} }
    : containerVariants;
  const navItemVariants = performanceMode
    ? { hidden: { opacity: 1, x: 0 }, show: { opacity: 1, x: 0 } }
    : itemVariants;

  function startNavTransition() {
    window.dispatchEvent(new CustomEvent("dashboard:nav-start"));
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
          <motion.div whileHover={performanceMode ? undefined : { scale: 1.02 }} transition={performanceMode ? { duration: 0.1 } : { type: "spring", stiffness: 360, damping: 22 }} className="inline-flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-[#0071E3]">Klip</span>
          </motion.div>
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
          {navItems.map(({ label, href, icon: Icon }) => {
            const targetHref = href === "/dashboard" ? dashboardBasePath : `${dashboardBasePath}${href.replace("/dashboard", "")}`;
            const isActive =
              pathname === targetHref ||
              (href !== "/dashboard" && pathname.startsWith(targetHref));

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
                      startNavTransition();
                    }}
                    className={`relative flex items-center gap-3 px-3 py-3 rounded-2xl text-sm font-medium transition-colors cursor-pointer select-none ${
                    isActive
                      ? "text-violet-700 dark:text-white"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-white/5 hover:text-zinc-700 dark:hover:text-white"
                  }`}
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
                  <span className="flex-1 relative z-10">{label}</span>
                  {showAlert && (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 relative z-10" title={href === "/dashboard/calendar" ? "Turnos próximos urgentes" : "Stock bajo"} />
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
        <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">Version actual: v{APP_VERSION}</p>
      </div>
    </motion.aside>
    </AnimatePresence>
  );
}
