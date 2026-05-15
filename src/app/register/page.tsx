"use client";

import { registerShop } from "@/lib/dashboard/auth-actions";
import { supabase } from "@/lib/supabase";
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
  const [shopName, setShopName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
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
      setError(`Espera ${cooldownSeconds}s antes de volver a solicitar el correo de confirmacion.`);
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
          addToast("Local creado. Redirigiendo al dashboard...", "success");
          setTimeout(() => router.push("/dashboard"), 800);
          return;
        }

        addToast(payload?.message || "Cuenta creada con exito. Revisa tu email para confirmar.", "success");
        setRegistrationSuccess(true);
      }
    });
  }

  async function handleGoogleOwnerSignup() {
    setError(null);
    const trimmedShopName = shopName.trim();
    if (!trimmedShopName) {
      setError("Debes indicar el nombre del local antes de continuar con Google.");
      return;
    }
    if (!termsAccepted) {
      setError("Debes aceptar los Terminos y Condiciones para continuar.");
      return;
    }

    const state = encodeURIComponent(JSON.stringify({ shopName: trimmedShopName }));
    const redirectTo = `${window.location.origin}/auth/callback?flow=owner_signup&next=/dashboard&state=${state}`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (oauthError) {
      setError(`Error de Google OAuth: ${oauthError.message}`);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-violet-700 tracking-tight">Klip</h1>
          <p className="mt-2 text-gray-600">Crea tu cuenta y publica tu local en minutos</p>
        </div>

        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          {registrationSuccess ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-6 text-center">
              <p className="text-sm font-medium text-blue-900">
                Listo. Te enviamos un correo de confirmacion para activar tu acceso.
              </p>
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="mt-5 inline-flex rounded-xl bg-[#0071E3] px-4 py-2 text-sm font-medium text-white hover:bg-[#005bb8] transition-colors"
              >
                Ir a iniciar sesion
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="shop_name" className="block text-sm font-medium text-gray-700 mb-1">Nombre del Local</label>
                <input type="text" id="shop_name" name="shop_name" required value={shopName} onChange={(e) => setShopName(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent" placeholder="Ej: Klip Barber" />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" id="email" name="email" required className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent" placeholder="tu@email.com" />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Contrasena</label>
                <input type="password" id="password" name="password" required minLength={6} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent" placeholder="Minimo 6 caracteres" />
              </div>

              <div className="rounded-xl border border-gray-200 bg-white/60 px-3 py-2.5">
                <label className="flex items-start gap-2.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name="terms_accepted"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span>
                    Acepto los Terminos y Condiciones y las Politicas de Privacidad de Klip. {" "}
                    <button
                      type="button"
                      onClick={() => setTermsOpen(true)}
                      className="font-medium text-violet-700 hover:text-violet-800 underline"
                    >
                      Leer Terminos y Condiciones
                    </button>
                  </span>
                </label>
              </div>

              <button type="submit" disabled={pending || cooldownSeconds > 0 || !termsAccepted} className="w-full bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer select-none">
                {pending ? "Creando cuenta..." : cooldownSeconds > 0 ? `Reintenta en ${cooldownSeconds}s` : "Crear cuenta y local"}
              </button>

              <button
                type="button"
                onClick={handleGoogleOwnerSignup}
                disabled={pending || !termsAccepted}
                className="w-full bg-white text-gray-900 py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer select-none"
              >
                Continuar con Google (crear local)
              </button>
            </form>
          )}
        </div>

        {!registrationSuccess && (
          <p className="mt-6 text-center text-sm text-gray-600">
            Ya tenes cuenta? <Link href="/login" className="font-medium text-violet-600 hover:text-violet-700">Inicia sesion</Link>
          </p>
        )}
      </div>

      {termsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[88dvh] overflow-y-auto rounded-3xl border border-white/20 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-gray-900">Terminos y Condiciones de Uso - Klip</h2>
              <button
                type="button"
                onClick={() => setTermsOpen(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm text-gray-700 leading-6">
              <p>
                Al crear una cuenta en Klip, aceptas expresamente los siguientes terminos:
              </p>
              <p>
                <strong>Naturaleza del Servicio:</strong> Klip es una plataforma SaaS de gestion de turnos. El Proveedor no presta servicios de peluqueria ni estetica; la relacion comercial es exclusivamente entre el local y sus clientes finales.
              </p>
              <p>
                <strong>Exencion de Responsabilidad:</strong> El Proveedor no se hace responsable por perdidas economicas, lucro cesante o perdida de turnos derivados de caidas del sistema, fallas en la base de datos o errores en el envio de notificaciones (Resend/Amazon). El software se entrega "tal cual es".
              </p>
              <p>
                <strong>Responsabilidad del Comercio:</strong> El local es el unico responsable de los precios, horarios y servicios publicados, asi como del cumplimiento de la Ley de Proteccion de Datos Personales respecto a sus clientes.
              </p>
              <p>
                <strong>Limitacion de Indemnidad:</strong> Ante cualquier eventual reclamo judicial, la responsabilidad maxima del Proveedor no superara el equivalente a un (1) mes del abono pagado por el Cliente.
              </p>
              <p>
                <strong>Jurisdiccion:</strong> Para cualquier controversia, las partes se someten a los Tribunales Ordinarios de la Ciudad de La Plata, renunciando a cualquier otro fuero.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
