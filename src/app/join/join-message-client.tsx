"use client";

import Link from "next/link";
import { clientLogout } from "@/lib/dashboard/auth/client-logout";

export default function JoinMessageClient({ title, text }: { title: string; text: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2rem] border border-white/10 dark:border-white/5 p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{text}</p>
        <div className="mt-5 flex flex-col gap-3">
          <Link href="/login" className="inline-flex items-center justify-center rounded-xl bg-violet-600 text-white px-4 py-2 text-sm">
            Ir a login
          </Link>
          <button
            type="button"
            onClick={() => { void clientLogout(); }}
            className="w-full inline-flex items-center justify-center rounded-xl border border-zinc-300 text-zinc-700 px-4 py-2 text-sm hover:bg-zinc-50 cursor-pointer"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
