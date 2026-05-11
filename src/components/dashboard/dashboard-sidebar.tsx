"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  Home,
  CalendarDays,
  Clock,
  Scissors,
  Package,
  Settings,
  Users,
  LogOut,
  Wallet,
} from "lucide-react";

const navItems = [
  { label: "Inicio", href: "/dashboard", icon: Home },
  { label: "Calendario", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Turnos", href: "/dashboard/appointments", icon: Clock },
  { label: "Servicios", href: "/dashboard/services", icon: Scissors },
  { label: "Finanzas", href: "/dashboard/finances", icon: Wallet },
  { label: "Inventario", href: "/dashboard/inventory", icon: Package },
  { label: "Personal", href: "/dashboard/staff", icon: Users },
  { label: "Configuración", href: "/dashboard/settings", icon: Settings },
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
}

export default function DashboardSidebar({
  userName,
  onLogout,
  className = "",
  notifications,
}: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.aside
        key="desktop-sidebar"
        className={`flex flex-col bg-white/10 dark:bg-black/10 backdrop-blur-3xl border-r border-white/20 dark:border-white/10 border-t border-l border-white/40 dark:border-t-white/20 dark:border-l-white/20 h-full transition-colors ${className}`}
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -300, opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
      >
      <div className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-bold text-violet-700 dark:text-white tracking-tight">Klip</h1>
      </div>

      <LayoutGroup>
        <motion.nav
          className="flex-1 px-3 space-y-1"
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          {navItems.map(({ label, href, icon: Icon }) => {
            const isActive =
              pathname === href ||
              (href !== "/dashboard" && pathname.startsWith(href));

            const showAlert =
              (href === "/dashboard/appointments" && notifications?.urgentAppointments) ||
              (href === "/dashboard/inventory" && notifications?.lowStock);

            return (
              <motion.div
                key={href}
                variants={itemVariants}
                whileHover={{ x: 5 }}
                whileTap={{ scale: 0.97 }}
              >
                <Link
                  href={href}
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
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
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
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 relative z-10" title={href === "/dashboard/appointments" ? "Turnos próximos urgentes" : "Stock bajo"} />
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
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <button
              onClick={onLogout}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-white/60 dark:hover:bg-white/5 transition-all cursor-pointer"
              title="Cerrar Sesión"
            >
              <LogOut className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </motion.div>
        </div>
      </div>
    </motion.aside>
    </AnimatePresence>
  );
}
