"use client";

import { useState, useTransition } from "react";
import { createAdditionalShop } from "@/lib/dashboard/auth-actions";

export default function CreateShopRecoveryClient({ userEmail }: { userEmail: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-3xl p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Recuperar acceso</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Tu cuenta ({userEmail || "sin email"}) no tiene un local activo. Crea uno nuevo para entrar al dashboard.
        </p>
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          El trial de 15 dias aplica solo a la primera tienda de la cuenta. Las tiendas adicionales ingresan sin trial.
        </p>

        {error && <div className="mt-3 rounded-xl bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Nombre del local</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Klip Barber"
            className="w-full rounded-xl border border-slate-300 dark:border-zinc-700 px-3 py-2 text-sm bg-white dark:bg-zinc-950"
          />
        </div>

        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await createAdditionalShop(name);
              if (!result.success || !result.data?.slug) {
                setError(result.success ? "No se pudo crear el local" : result.error);
                return;
              }
              const target = result.data.isFirstShop
                ? `/dashboard/${result.data.slug}/business`
                : `/dashboard/${result.data.slug}/billing`;
              const oldKey = `klip-business-onboarding-v1:${result.data.slug}`;
              try { window.localStorage.removeItem(oldKey); } catch {}
              window.location.assign(target);
            });
          }}
          className="mt-5 w-full rounded-2xl bg-violet-600 text-white py-2.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
        >
          {pending ? "Creando..." : "Crear local y continuar"}
        </button>
      </div>
    </div>
  );
}
