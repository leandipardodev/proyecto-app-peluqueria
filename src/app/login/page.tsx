"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";

const RESET_COOLDOWN_MS = 60_000;
const RESET_COOLDOWN_KEY = "klip_reset_cooldown_until";

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

    console.log("Intentando login con:", email);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("ERROR DE SUPABASE:", error.message);
      alert("Error de Login: " + error.message);
      setError(error.message);
      setLoading(false);
      return;
    }

    console.log("LOGIN EXITOSO:", data);
    router.push("/dashboard");
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
              ¿No tenés cuenta?{" "}
              <Link href="/register" className="font-medium text-violet-600 hover:text-violet-700">
                Registrate
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
