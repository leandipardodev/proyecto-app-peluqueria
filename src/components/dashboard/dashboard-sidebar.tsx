"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, memo } from "react";
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

const navItems = [
  { label: "Inicio", href: "/dashboard", icon: Home },
  { label: "Calendario", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Caja", href: "/dashboard/finances", icon: Wallet },
  { label: "Productos", href: "/dashboard/inventory", icon: Package },
  { label: "Marketing", href: "/dashboard/fidelizacion", icon: Gift },
  { label: "Transferencias", href: "/dashboard/bank-transfers", icon: ArrowLeftRight },
  { label: "__CUSTOMERS_LABEL__", href: "/dashboard/customers", icon: UserRound },
  { label: "Mi Negocio", href: "/dashboard/business", icon: Store },
];

const staffOnlyItems = [
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
  showUser?: boolean;
  onNavigate?: () => void;
}

/**
 * `router.prefetch` acepta `onInvalidate` en runtime, pero el tipo de Next lo
 * declara con `kind` obligatorio y `PrefetchKind` no se exporta desde
 * `next/navigation`, asi que se tipa el metodo por su cuenta en vez de importar
 * tipos internos del paquete. El runtime resuelve `kind` por su cuenta
 * (`options?.kind ?? PrefetchKind.AUTO`).
 */
type PrefetchWithInvalidate = (href: string, options?: { onInvalidate?: () => void }) => void;

function makePrefetcher(router: ReturnType<typeof useRouter>): PrefetchWithInvalidate {
  return (href, options) => (router.prefetch as PrefetchWithInvalidate)(href, options);
}

const DashboardSidebar = memo(function DashboardSidebar({
  userName,
  className = "",
  notifications,
  showBrand = true,
  showUser = true,
  onNavigate,
}: DashboardSidebarProps) {
  const { shop, user } = useAuth();
  const industry = resolveIndustry(shop?.industry);
  const customerPlural = INDUSTRY_CONFIG[industry].labels.customerPlural;
  const isStaff = user?.role === "staff";
  const bankTransferEnabled = Boolean(shop?.bankTransferEnabled);
  // Sin memo, el array cambia de identidad en cada render y el efecto de
  // prefetch de abajo se vuelve a disparar: 8 renders RSC de paginas
  // force-dynamic por cada render del sidebar.
  const resolvedNavItems = useMemo(
    () =>
      [
        ...navItems.filter((item) => item.href !== "/dashboard/bank-transfers" || bankTransferEnabled),
        ...(isStaff ? staffOnlyItems : []),
      ].map((item) => (item.label === "__CUSTOMERS_LABEL__" ? { ...item, label: customerPlural } : item)),
    [bankTransferEnabled, isStaff, customerPlural]
  );
  const pathname = usePathname();
  const router = useRouter();
  const dashboardBasePath = getDashboardBasePath(pathname);
  const { playClick } = useKlipSounds();
  const { performanceMode } = usePerformanceMode();
  const [needsSetup, setNeedsSetup] = useState(false);
  const liveNotifications = useNotifications(shop?.id);

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

  // Los targets no dependen de la ruta actual: antes se re-prefetcheaban las 8
  // paginas en cada navegacion (y antes de eso, en cada render del sidebar).
  // Cada prefetch de una pagina force-dynamic es un render RSC completo, o sea
  // ~10 queries contra Supabase por destino.
  const prefetchTargets = useMemo(
    () =>
      resolvedNavItems.map(({ href }) =>
        href === "/dashboard" ? dashboardBasePath : `${dashboardBasePath}${href.replace("/dashboard", "")}`
      ),
    [resolvedNavItems, dashboardBasePath]
  );

  useEffect(() => {
    // `onInvalidate` es el mecanismo de Next para esto: se dispara cuando la
    // entrada prefetchada de esta URL queda obsoleta y hay que volver a pedirla.
    // Hace falta porque `router.refresh()` (y cualquier otra invalidacion) sube
    // la version GLOBAL del Client Cache, sin mirar la ruta: borra el prefetch de
    // las 8 secciones y de todas las tiendas de la pestana. Antes solo se
    // re-prefetcheaba con `pingVisibleLinks`, que solo cubre links visibles, y en
    // mobile el sidebar esta desmontado con el menu cerrado, asi que no habia
    // quien los recuperara.
    const prefetchWithInvalidate = makePrefetcher(router);

    const runPrefetch = () => {
      for (const href of prefetchTargets) {
        const rePrefetch = () => prefetchWithInvalidate(href, { onInvalidate: rePrefetch });
        prefetchWithInvalidate(href, { onInvalidate: rePrefetch });
      }
    };

    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) {
      const id = idle(runPrefetch, { timeout: 1200 });
      return () => window.cancelIdleCallback?.(id);
    }

    const timeoutId = window.setTimeout(runPrefetch, 250);
    return () => window.clearTimeout(timeoutId);
  }, [prefetchTargets, router]);

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
          {resolvedNavItems.map(({ label, href, icon: Icon }) => {
            const targetHref = href === "/dashboard" ? dashboardBasePath : `${dashboardBasePath}${href.replace("/dashboard", "")}`;
            const isActive =
              pathname === targetHref ||
              (href !== "/dashboard" && pathname.startsWith(targetHref));

            const isBusiness = href === "/dashboard/business";
            const showLowStockAlert = href === "/dashboard/inventory" && liveNotifications.lowStock;
            const showPendingOrdersAlert = href === "/dashboard/inventory" && liveNotifications.pendingOrders > 0;
            const showUrgentAppointmentsAlert = href === "/dashboard/calendar" && liveNotifications.urgentAppointments;
            const showTransferBadge = href === "/dashboard/bank-transfers" && liveNotifications.pendingTransfers > 0;

            return (
              <motion.div
                key={href}
                variants={navItemVariants}
                whileHover={performanceMode ? undefined : { x: 5 }}
                whileTap={{ scale: 0.96 }}
              >
                  <Link
                    href={targetHref}
                    prefetch={true}
                    draggable={false}
                    onMouseDown={() => {
                      playClick();
                      haptic(6);
                      startNavTransition();
                      requestAnimationFrame(() => onNavigate?.());
                    }}
                    // `active:` es el feedback real en touch. Va por CSS, no por
                    // JS: dispara en touchstart, sin pasar por React ni framer,
                    // que es justo lo que hace falta cuando el dispositivo
                    // entra en performanceMode. Antes ese estado estaba
                    // apagado ahi y el menu no confirmaba nada el toque (y en
                    // iOS no hay navigator.vibrate, asi que el silencio era
                    // total). `group` para que el icono reaccione tambien:
                    // `:active` matchea al elemento y sus ancestros, no a los
                    // descendientes.
                    className={`group relative flex items-center gap-3 px-3 py-3 rounded-2xl text-sm font-medium transition-colors duration-75 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70 ${
                    isActive
                      ? "text-violet-700 dark:text-white"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-white/5 hover:text-zinc-700 dark:hover:text-white active:bg-violet-500/15 dark:active:bg-violet-400/15 active:text-violet-700 dark:active:text-violet-200"
                  }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                  {isActive && (
                    <motion.div
                      layoutId="active-pill"
                      // El pill va encima del fondo del link, asi que para la
                      // seccion activa el flash del pressed tiene que ser el
                      // suyo. Sin esto, tocar la seccion en la que ya estas -
                      // que es el unico caso donde no navega nada - era
                      // justamente el que no daba ninguna señal.
                      className="absolute inset-0 rounded-2xl bg-white/30 dark:bg-white/10 border border-white/20 dark:border-white/10 shadow-sm group-active:bg-violet-500/20 dark:group-active:bg-violet-400/20"
                      transition={performanceMode ? { duration: 0.1 } : { type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon
                    className={`w-5 h-5 shrink-0 relative z-10 transition-transform duration-75 group-active:scale-110 ${
                      isActive
                        ? "text-violet-600 dark:text-violet-400"
                        : "text-zinc-400 dark:text-zinc-400 group-active:text-violet-600 dark:group-active:text-violet-300"
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

      {showUser && (
        <div className="px-4 py-5">
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 truncate block">
            {userName}
          </span>
        </div>
      )}
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
