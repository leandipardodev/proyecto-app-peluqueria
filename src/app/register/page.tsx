"use client";

import { registerShop } from "@/lib/dashboard/auth-actions";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

export default function RegisterPage() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { addToast } = useToast();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await registerShop(formData);
      if (!result.success) {
        setError(result.error);
      } else {
        const payload = result.data as { redirectToDashboard?: boolean; requiresEmailConfirmation?: boolean; message?: string } | undefined;
        if (payload?.redirectToDashboard) {
          addToast("Negocio inicializado. Redirigiendo al dashboard...", "success");
          setTimeout(() => router.push("/dashboard"), 800);
          return;
        }

        addToast(payload?.message || "Cuenta creada con éxito. Revisá tu email para confirmar.", "success");
        setTimeout(() => router.push("/login?registered=true"), 1500);
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-violet-700 tracking-tight">Klip</h1>
          <p className="mt-2 text-gray-600">
            Creá tu cuenta y empezá a gestionar tu peluquería
          </p>
        </div>

        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="shop_name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Nombre de la Peluquería
              </label>
              <input
                type="text"
                id="shop_name"
                name="shop_name"
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="Ej: Jazba Peluquería"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="tu@email.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Contraseña
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                minLength={6}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
               className="w-full bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
            >
              {pending ? "Creando cuenta..." : "Crear Cuenta"}
            </button>
          </form>

          <p className="text-xs text-gray-500 text-center">
            Al registrarte aceptás nuestros términos y comenzás un trial de 30
            días.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          ¿Ya tenés cuenta?{" "}
          <Link
            href="/login"
            className="font-medium text-violet-600 hover:text-violet-700"
          >
            Iniciá sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
