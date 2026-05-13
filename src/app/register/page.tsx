"use client";

import { registerShop } from "@/lib/dashboard/auth-actions";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

const REGISTER_COOLDOWN_MS = 60_000;
const REGISTER_COOLDOWN_KEY = "klip_register_cooldown_until";

function isRateLimitError(message: string | null | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("too many requests") || normalized.includes("too many");
}

export default function RegisterPage() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(REGISTER_COOLDOWN_KEY) || "0");
    if (stored > Date.now()) setCooldownUntil(stored);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (cooldownSeconds > 0) {
      setError(`Esperá ${cooldownSeconds}s antes de volver a solicitar el correo de confirmación.`);
      return;
    }
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await registerShop(formData);
      if (!result.success) {
        if (isRateLimitError(result.error)) {
          const until = Date.now() + REGISTER_COOLDOWN_MS;
          setCooldownUntil(until);
          window.localStorage.setItem(REGISTER_COOLDOWN_KEY, String(until));
        }
        setError(result.error);
      } else {
        const payload = result.data as { redirectToDashboard?: boolean; requiresEmailConfirmation?: boolean; message?: string } | undefined;
        if (payload?.redirectToDashboard) {
          addToast("Negocio inicializado. Redirigiendo al dashboard...", "success");
          setTimeout(() => router.push("/dashboard"), 800);
          return;
        }

        addToast(payload?.message || "Cuenta creada con éxito. Revisá tu email para confirmar.", "success");
        setRegistrationSuccess(true);
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

          {registrationSuccess ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-6 text-center">
              <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-2xl" style={{ color: "#0071E3" }}>
                ✉️
              </div>
              <p className="text-sm font-medium text-blue-900">
                ¡Casi listo! Te enviamos un correo de confirmación. Por favor, revisá tu bandeja de entrada (y la carpeta de spam) para activar tu cuenta de Klip.
              </p>
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="mt-5 inline-flex rounded-xl bg-[#0071E3] px-4 py-2 text-sm font-medium text-white hover:bg-[#005bb8] transition-colors"
              >
                Ir a iniciar sesión
              </button>
            </div>
          ) : (
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
                  placeholder="Ej: Mi Peluquería"
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
                disabled={pending || cooldownSeconds > 0}
                 className="w-full bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
              >
                {pending ? "Creando cuenta..." : cooldownSeconds > 0 ? `Reintentá en ${cooldownSeconds}s` : "Crear Cuenta"}
              </button>
            </form>
          )}

          <p className="text-xs text-gray-500 text-center">
            Al registrarte aceptás nuestros términos y comenzás un trial de 30
            días.
          </p>
        </div>

        {!registrationSuccess && (
          <p className="mt-6 text-center text-sm text-gray-600">
            ¿Ya tenés cuenta?{" "}
            <Link
              href="/login"
              className="font-medium text-violet-600 hover:text-violet-700"
            >
              Iniciá sesión
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
