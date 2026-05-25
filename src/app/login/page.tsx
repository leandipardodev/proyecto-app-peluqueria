"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";

const RESET_COOLDOWN_MS = 60_000;
const RESET_COOLDOWN_KEY = "klip_reset_cooldown_until";

function getPublicBaseUrl(): string {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (envBase && /^https?:\/\//i.test(envBase)) return envBase.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return "http://localhost:3000";
}

function isRateLimitError(message: string | null | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("too many requests") || normalized.includes("too many");
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetCooldownUntil, setResetCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const { addToast } = useToast();
  const [redirectPath, setRedirectPath] = useState("/dashboard");

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(RESET_COOLDOWN_KEY) || "0");
    if (stored > Date.now()) setResetCooldownUntil(stored);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const resetCooldownSeconds = Math.max(0, Math.ceil((resetCooldownUntil - now) / 1000));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setError(decodeURIComponent(err));
    const redirectQuery = params.get("redirect");
    if (redirectQuery && redirectQuery.startsWith("/")) {
      setRedirectPath(redirectQuery);
    }
    if (params.get("registered") === "true") {
      addToast("Cuenta creada con éxito. Revisá tu email para confirmar.", "success");
    }
  }, [addToast]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      addToast(`Error de login: ${error.message}`, "error");
      setError(error.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      const { data: memberships } = await supabase
        .from("shop_memberships")
        .select("shop_id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .in("role", ["owner", "admin", "staff"])
        .limit(1);

      if (!memberships || memberships.length === 0) {
        router.push("/onboarding/create-shop");
        router.refresh();
        return;
      }
    }

    router.push(redirectPath);
    router.refresh();
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (resetCooldownSeconds > 0) {
      setError(`Esperá ${resetCooldownSeconds}s antes de volver a enviar el email.`);
      return;
    }
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      if (isRateLimitError(error.message)) {
        const until = Date.now() + RESET_COOLDOWN_MS;
        setResetCooldownUntil(until);
        window.localStorage.setItem(RESET_COOLDOWN_KEY, String(until));
      }
      setError(error.message);
      setLoading(false);
      return;
    }

    setResetSent(true);
    setLoading(false);
  };

  const handleGoogleOwnerLogin = async () => {
    setError("");
    setLoading(true);
    window.sessionStorage.setItem("klip_oauth_flow", "client");
    window.sessionStorage.setItem("klip_oauth_next", redirectPath);
    window.sessionStorage.removeItem("klip_oauth_state");
    document.cookie = `klip_oauth_flow=client; Path=/; Max-Age=600; SameSite=Lax`;
    document.cookie = `klip_oauth_next=${encodeURIComponent(redirectPath)}; Path=/; Max-Age=600; SameSite=Lax`;
    document.cookie = "klip_oauth_state=; Path=/; Max-Age=0; SameSite=Lax";
    const redirectTo = `${getPublicBaseUrl()}/auth/callback`;
    if (process.env.NODE_ENV !== "production") {
      console.info("[oauth-debug][login]", {
        baseUrl: getPublicBaseUrl(),
        redirectTo,
        redirectPath,
      });
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[oauth-debug][login] signInWithOAuth error", error);
      }
      setError(error.message);
      setLoading(false);
      return;
    }

    if (!data?.url) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[oauth-debug][login] missing oauth url", data);
      }
      setError("No se pudo iniciar Google OAuth. Intenta de nuevo.");
      setLoading(false);
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("[oauth-debug][login] oauth url", data.url);
    }

    try {
      const oauthUrl = new URL(data.url);
      const redirectParam = oauthUrl.searchParams.get("redirect_to");
      const expectedOrigin = getPublicBaseUrl();
      if (redirectParam && !redirectParam.startsWith(expectedOrigin)) {
        setError(
          `OAuth devolvio redirect_to inesperado. Esperado: ${expectedOrigin}. Recibido: ${redirectParam}`
        );
        setLoading(false);
        if (process.env.NODE_ENV !== "production") {
          console.error("[oauth-debug][login] redirect_to mismatch", { expectedOrigin, redirectParam, oauthUrl: data.url });
        }
        return;
      }
    } catch {}

    window.location.assign(data.url);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-violet-700 tracking-tight">Klip</h1>
          <p className="mt-2 text-gray-600">
            {resetMode ? "Restablecer contraseña" : "Iniciá sesión en tu cuenta"}
          </p>
        </div>

        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {resetSent ? (
            <div className="text-center space-y-4">
              <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg">
                Te enviamos un email con las instrucciones para restablecer tu contraseña.
              </div>
              <button
                onClick={() => {
                  setResetMode(false);
                  setResetSent(false);
                  setError("");
                }}
                className="text-sm text-violet-600 hover:text-violet-700 font-medium cursor-pointer select-none"
              >
                Volver al inicio de sesión
              </button>
            </div>
          ) : resetMode ? (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
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

              <button
                type="submit"
                disabled={loading || resetCooldownSeconds > 0}
                className="w-full bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 transition-colors disabled:opacity-50 cursor-pointer select-none"
              >
                {loading ? "Enviando..." : resetCooldownSeconds > 0 ? `Reintentá en ${resetCooldownSeconds}s` : "Enviar instrucciones"}
              </button>

              <button
                type="button"
                onClick={() => setResetMode(false)}
                className="w-full text-sm text-gray-600 hover:text-gray-700 font-medium cursor-pointer select-none"
              >
                Volver al inicio de sesión
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
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
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 transition-colors disabled:opacity-50 cursor-pointer select-none"
              >
                {loading ? "Iniciando..." : "Iniciar Sesión"}
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleOwnerLogin}
                className="w-full bg-white text-gray-900 py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer select-none"
              >
                Continuar con Google (solo duenos)
              </button>
            </form>
          )}
        </div>

        {!resetMode && !resetSent && (
          <>
            <p className="mt-4 text-center">
              <button
                onClick={() => {
                  setResetMode(true);
                  setError("");
                }}
                className="text-sm text-violet-600 hover:text-violet-700 font-medium cursor-pointer select-none"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </p>
            <p className="mt-2 text-center text-sm text-gray-600">
              Acceso administrativo solo por allowlist. Si necesitás acceso, pedí que carguen tu email autorizado.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
