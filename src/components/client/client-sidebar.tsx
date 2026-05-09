"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Scissors,
  User,
  LogOut,
} from "lucide-react";
import { logout } from "@/lib/dashboard/logout-action";

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
    <div className="flex flex-col h-full bg-violet-700 text-white">
      <div className="p-6 border-b border-violet-600">
        <h2 className="text-xl font-bold">Klip</h2>
        <p className="text-sm text-violet-200 mt-1">{shopName}</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer select-none ${
                isActive
                  ? "bg-violet-800 text-white"
                  : "text-violet-100 hover:bg-violet-600"
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-violet-600 space-y-3">
        <p className="text-sm text-violet-200">{userName}</p>
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-2 text-sm text-violet-200 hover:text-white transition-colors cursor-pointer select-none"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </form>
      </div>
    </div>
  );
}
