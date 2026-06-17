"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export function StaffSetupForm({ token, name: defaultName }: { token: string; name: string }) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { setupStaffAccount } = await import("@/lib/dashboard/staff-actions");

    const result = await setupStaffAccount(token, password, name);
    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }
    if (!result.data) {
      setError("Error al configurar la cuenta");
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: result.data.email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.refresh();
  }, [token, password, name, router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-violet-700 tracking-tight">Klip</h1>
          <p className="mt-2 text-gray-600">Te invitaron a unirte a un equipo</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 space-y-5"
        >
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="Tu nombre"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="Minimo 6 caracteres"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-600 text-white py-2.5 px-4 rounded-2xl text-sm font-medium shadow-sm hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer select-none"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Configurando..." : "Crear acceso y unirme"}
          </button>
        </form>
      </div>
    </div>
  );
}
