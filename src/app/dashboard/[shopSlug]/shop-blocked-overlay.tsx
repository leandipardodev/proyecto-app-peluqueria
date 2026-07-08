"use client";

import Link from "next/link";
import { AlertTriangle, CreditCard, ArrowRight } from "lucide-react";

export default function ShopBlockedOverlay({ shopSlug }: { shopSlug: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 mx-4 w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-red-200/40 dark:border-red-800/40 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 mb-5">
          <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Plan vencido
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Tu suscripción ha vencido. Renová tu plan para seguir usando todas las herramientas.
        </p>
        <div className="space-y-3">
          <Link
            href={`/billing-required?shop_id=${shopSlug}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-500 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:from-red-700 hover:to-red-600 transition-all"
          >
            <CreditCard className="h-4 w-4" />
            Pagar suscripción
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 dark:border-zinc-700 px-5 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all"
          >
            Cambiar de tienda
          </Link>
        </div>
      </div>
    </div>
  );
}
