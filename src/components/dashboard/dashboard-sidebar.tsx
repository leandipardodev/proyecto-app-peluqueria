"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

interface DashboardSidebarProps {
  userName: string;
  onLogout: () => void;
  className?: string;
}

export default function DashboardSidebar({
  userName,
  onLogout,
  className = "",
}: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-full transition-colors ${className}`}
    >
      <div className="p-6">
        <h1 className="text-2xl font-bold text-violet-700">Klip</h1>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
            {userName}
          </span>
          <button
            onClick={onLogout}
            className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            title="Cerrar Sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
