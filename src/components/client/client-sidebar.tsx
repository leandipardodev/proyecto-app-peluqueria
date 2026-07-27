"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Scissors,
  User,
  LogOut,
} from "lucide-react";
import { clientLogout } from "@/lib/dashboard/auth/client-logout";

const navItems = [
  {
    href: "/client/appointments",
    label: "Mis Turnos",
    icon: CalendarDays,
  },
  {
    href: "/client/book",
    label: "Reservar Turno",
    icon: Scissors,
  },
  {
    href: "/client/profile",
    label: "Mi Perfil",
    icon: User,
  },
];

export default function ClientSidebar({
  userName,
  shopName,
}: {
  userName: string;
  shopName: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full bg-white/30 dark:bg-black/30 backdrop-blur-3xl border-r border-white/20 dark:border-white/10 border-t border-l border-white/50 dark:border-t-white/20 dark:border-l-white/20 text-gray-700 dark:text-zinc-400">
      <div className="p-6 border-b border-white/20 dark:border-white/10">
        <div className="inline-flex items-center">
          <span className="text-lg font-bold tracking-tight text-[#0071E3]">Klip</span>
        </div>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">{shopName}</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all cursor-pointer select-none ${
                isActive
                  ? "bg-white/60 dark:bg-white/10 shadow-sm text-violet-700 dark:text-white"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-white/5 hover:text-zinc-700 dark:hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/20 dark:border-white/10 space-y-3">
        <p className="text-sm text-gray-500 dark:text-zinc-400">{userName}</p>
        <button
          type="button"
          onClick={() => { void clientLogout(); }}
          className="flex items-center gap-2 text-sm text-gray-400 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer select-none"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.5} />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}
