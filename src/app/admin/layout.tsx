import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin/auth";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireSuperAdmin();

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-zinc-900">
      <header className="border-b border-zinc-200 bg-white/85 backdrop-blur px-6 py-4">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Admin Panel</p>
            <h1 className="text-lg font-semibold">Klip Control Center</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full border border-zinc-300 px-3 py-1 text-zinc-600">{session.email || "super_admin"}</span>
            <Link href="/dashboard" className="rounded-full bg-zinc-900 px-4 py-1.5 text-white">
              Ir al dashboard
            </Link>
          </div>
        </div>
        <nav className="mx-auto mt-3 flex w-full max-w-7xl gap-4 text-sm">
          <Link href="/admin" className="text-zinc-500 hover:text-zinc-900 transition-colors">
            Dashboard
          </Link>
          <Link href="/admin/users" className="text-zinc-500 hover:text-zinc-900 transition-colors">
            Usuarios
          </Link>
          <Link href="/admin/shops" className="text-zinc-500 hover:text-zinc-900 transition-colors">
            Tiendas
          </Link>
          <Link href="/admin/industries" className="text-zinc-500 hover:text-zinc-900 transition-colors">
            Industrias
          </Link>
          <Link href="/admin/referrals" className="text-zinc-500 hover:text-zinc-900 transition-colors">
            Referidos
          </Link>
          <Link href="/admin/settings" className="text-zinc-500 hover:text-zinc-900 transition-colors">
            Configuración
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
