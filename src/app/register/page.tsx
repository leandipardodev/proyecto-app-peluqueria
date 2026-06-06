"use client";

import { registerShop, completeRegistration, resendVerificationCode } from "@/lib/dashboard/auth-actions";
import Link from "next/link";
import { Suspense, useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { resolveIndustry } from "@/lib/industry/resolve";
import type { Industry } from "@/lib/industry/types";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { supabase } from "@/lib/supabase";

function RegisterPageContent({ industry }: { industry: Industry }) {
  const [checkingSession, setCheckingSession] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "code">("form");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingShopName, setPendingShopName] = useState("");
  const [pendingIndustry, setPendingIndustry] = useState("");
  const [shopName, setShopName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pendingPassword, setPendingPassword] = useState("");
  const [resent, setResent] = useState(false);
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!user || error) {
          await supabase.auth.signOut();
          setCheckingSession(false);
          return;
        }
        router.replace("/dashboard");
      } else {
        setCheckingSession(false);
      }
    });
    return () => subscription?.unsubscribe();
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const name = formData.get("shop_name") as string;
    const ind = formData.get("industry") as string;

    startTransition(async () => {
      const result = await registerShop(formData);
      if (!result.success) {
        setError(result.error);
      } else {
        setPendingEmail(email);
        setPendingShopName(name);
        setPendingIndustry(ind);
        setPendingPassword(formData.get("password") as string);
        setStep("code");
        addToast("Te enviamos un código de 6 dígitos", "success");
      }
    });
  }

  function handleVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (code.length !== 6) {
      setError("El código debe tener 6 dígitos");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("email", pendingEmail);
      formData.set("code", code);
      formData.set("shop_name", pendingShopName);
      formData.set("industry", pendingIndustry);
      formData.set("password", pendingPassword);

      const result = await completeRegistration(formData);
      if (!result.success) {
        setError(result.error);
      } else {
        addToast("Local creado. Redirigiendo al dashboard...", "success");
        setTimeout(() => router.push("/dashboard"), 800);
      }
    });
  }

  function handleResendCode() {
    setResent(true);
    setError(null);
    startTransition(async () => {
      const result = await resendVerificationCode(pendingEmail);
      if (result.success) {
        addToast("Código reenviado", "success");
      } else {
        setError(result.error || "No se pudo reenviar el código");
      }
    });
  }

  if (step === "code") {
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-violet-700 tracking-tight">Klip</h1>
            <p className="mt-2 text-gray-600">Verificá tu email</p>
          </div>

          <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 space-y-6">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
            )}

            <p className="text-sm text-gray-600 text-center">
              Te enviamos un código de 6 dígitos a <strong>{pendingEmail}</strong>
            </p>

            <form onSubmit={handleVerifyCode} className="space-y-5">
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">Código de verificación</label>
                <input
                  type="text"
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg text-center text-2xl font-bold tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  placeholder="------"
                  maxLength={6}
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>

              <button
                type="submit"
                disabled={pending || code.length !== 6}
                className="w-full bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer select-none"
              >
                {pending ? "Verificando..." : "Verificar y crear cuenta"}
              </button>
            </form>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={pending || resent}
                className="text-sm text-violet-600 hover:text-violet-700 underline disabled:opacity-50 cursor-pointer select-none"
              >
                {resent ? "Código reenviado" : "Reenviar código"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-violet-700 tracking-tight">Klip</h1>
          <p className="mt-2 text-gray-600">Crea tu cuenta y publica tu local en minutos</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-200/70 bg-gradient-to-r from-violet-50 to-sky-50 px-3 py-1.5 text-xs shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            <span className="font-semibold tracking-wide text-violet-700">{INDUSTRY_CONFIG[industry].displayName.toLowerCase()}</span>
          </div>
        </div>

        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <input type="hidden" name="industry" value={industry} />
            <div>
              <label htmlFor="shop_name" className="block text-sm font-medium text-gray-700 mb-1">Nombre del Local</label>
              <input type="text" id="shop_name" name="shop_name" required value={shopName} onChange={(e) => setShopName(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent" placeholder="Ej: Klip Barber" />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" id="email" name="email" required className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent" placeholder="tu@email.com" />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input type="password" id="reg-password" name="password" required minLength={6} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent" placeholder="Minimo 6 caracteres" />
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

            <button type="submit" disabled={pending || !termsAccepted} className="w-full bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer select-none">
              {pending ? "Creando cuenta..." : "Crear cuenta"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          Ya tenes cuenta? <Link href="/login" className="font-medium text-violet-600 hover:text-violet-700">Inicia sesion</Link>
        </p>
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
                Esta version establece las condiciones de uso de Klip para usuarios en Argentina. Al registrarte, acceder o utilizar la plataforma,
                aceptas integramente estos terminos.
              </p>
              <p>
                <strong>1. Aceptacion de los Terminos:</strong> Al registrarse, acceder o utilizar la plataforma Klip (&quot;El Servicio&quot;), el Usuario
                declara haber leido, comprendido y aceptado la totalidad de estos Terminos y Condiciones. Si no esta de acuerdo, debe abstenerse de
                usar el servicio.
              </p>
              <p>
                <strong>2. Naturaleza del Servicio:</strong> Klip es una herramienta de gestion y agenda digital (SaaS). El Proveedor es un
                facilitador tecnologico y no es parte de la relacion comercial, profesional o de servicios que ocurra entre el Usuario (el Comercio) y
                sus clientes finales.
              </p>
              <p>
                <strong>3. Responsabilidad y Limitaciones:</strong>
              </p>
              <p>
                <strong>Servicio &quot;Tal Cual Es&quot;:</strong> El Servicio se proporciona &quot;tal cual es&quot; y &quot;segun disponibilidad&quot;. El Proveedor no
                garantiza que el servicio este libre de errores, interrupciones o fallos tecnicos imprevistos.
              </p>
              <p>
                <strong>Exencion de Danos:</strong> El Proveedor no sera responsable por lucro cesante, perdida de turnos, falta de ingresos o
                cualquier dano indirecto derivado de caidas del sistema, fallas en la conectividad o errores de terceros (como proveedores de APIs,
                servicios de correo o SMS).
              </p>
              <p>
                <strong>Techo de Responsabilidad:</strong> En caso de responsabilidad legal demostrada contra el Proveedor, el monto maximo de
                indemnizacion no superara el valor del abono pagado por el Usuario durante el ultimo mes de servicio.
              </p>
              <p>
                <strong>4. Obligaciones del Usuario (Comercio):</strong>
              </p>
              <p>
                <strong>Gestion de Contenido:</strong> El Usuario es el unico responsable de la exactitud de los precios, horarios, servicios y
                cualquier informacion publicada en Klip.
              </p>
              <p>
                <strong>Proteccion de Datos:</strong> El Usuario actua como Responsable de la Base de Datos de sus clientes. El Proveedor actua
                exclusivamente como Encargado del Tratamiento. El Usuario garantiza que cuenta con las autorizaciones legales necesarias para recopilar
                y tratar los datos personales de sus clientes conforme a la Ley N 25.326.
              </p>
              <p>
                <strong>Seguridad:</strong> Es responsabilidad del Usuario proteger sus credenciales de acceso. El Proveedor no sera responsable por
                accesos no autorizados derivados de la negligencia del Usuario.
              </p>
              <p>
                <strong>5. Propiedad Intelectual:</strong> Todo el software, codigo, diseno, logo y logotipos de Klip son propiedad exclusiva del
                Proveedor. Queda prohibida la copia, modificacion, ingenieria inversa o uso no autorizado de los mismos.
              </p>
              <p>
                <strong>6. Suspension y Baja del Servicio:</strong> El Proveedor se reserva el derecho de suspender o cancelar el acceso a la cuenta
                del Usuario ante cualquier incumplimiento de estos terminos, falta de pago o actividad fraudulenta, sin previo aviso y sin derecho a
                reclamo. El Usuario es responsable de exportar su informacion antes de la cancelacion definitiva de su cuenta.
              </p>
              <p>
                <strong>7. Pagos y Suscripciones:</strong> Los abonos son prepagos. El acceso al Servicio se renovara automaticamente salvo aviso de
                baja por parte del Usuario. No se realizan reembolsos por periodos no utilizados una vez abonado el mes en curso.
              </p>
              <p>
                <strong>8. Jurisdiccion y Ley Aplicable:</strong> Cualquier controversia derivada de estos terminos sera resuelta ante los Tribunales
                Ordinarios de la Ciudad de La Plata, renunciando las partes a cualquier otro fuero o jurisdiccion.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RegisterPageWithIndustry() {
  const searchParams = useSearchParams();
  const industry = resolveIndustry(searchParams.get("rubro"));
  return <RegisterPageContent industry={industry} />;
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageWithIndustry />
    </Suspense>
  );
}
