"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Moon, Sun } from "lucide-react";
import { useDarkMode } from "@/lib/use-dark-mode";
import { Button } from "@/components/ui/button";
import { isMuted, setMuted, playPop } from "@/lib/sound";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<{
    plan_expiry: string;
    active: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const { dark, toggle: toggleDark } = useDarkMode();

  useEffect(() => {
    setSoundEnabled(!isMuted());
  }, []);

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .select("shop_id")
        .eq("user_id", user.id)
        .single();

      if (error || !data?.shop_id) {
        setLoading(false);
        return;
      }

      const { data: shopData } = await supabase
        .from("shops")
        .select("plan_expiry, active")
        .eq("id", data.shop_id)
        .single();

      if (shopData) {
        setProfile(shopData as { plan_expiry: string; active: boolean });
      }
      setLoading(false);
    }
    loadProfile();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <div className="p-6">Cargando...</div>;

  const expiryDate = profile?.plan_expiry
    ? new Date(profile.plan_expiry).toLocaleDateString("es-AR")
    : "—";

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Configuración</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Preferencias de cuenta y aplicación</p>
      </div>

      {/* Plan y Facturación */}
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 transition-colors">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 tracking-tight">Plan y Facturación</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Estado</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {profile?.active ? (
                <span className="text-green-600">Activo</span>
              ) : (
                <span className="text-red-600">Inactivo</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Vencimiento del Plan</dt>
            <dd suppressHydrationWarning className="mt-1 text-sm text-gray-900 dark:text-gray-100">{expiryDate}</dd>
          </div>
        </dl>
      </div>

      {/* Apariencia */}
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 transition-colors">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 tracking-tight">Apariencia</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {dark ? (
              <Moon className="w-5 h-5 text-violet-600" />
            ) : (
              <Sun className="w-5 h-5 text-amber-500" />
            )}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {dark ? "Modo oscuro" : "Modo claro"}
            </span>
          </div>
          <button
            onClick={toggleDark}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer select-none ${
              dark ? "bg-violet-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                dark ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Notificaciones Sonoras */}
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 transition-colors">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 tracking-tight">Notificaciones Sonoras</h2>
        <p className="text-sm text-gray-500 mb-4">
          Sonido sutil al crear un turno o cuando un turno programado entra en la ventana de 1 hora.
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {soundEnabled ? (
              <Bell className="w-5 h-5 text-violet-600" />
            ) : (
              <BellOff className="w-5 h-5 text-gray-400" />
            )}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {soundEnabled ? "Sonido activado" : "Sonido silenciado"}
            </span>
          </div>
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              setMuted(!next);
              if (next) playPop();
            }}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer select-none ${
              soundEnabled ? "bg-violet-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                soundEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Cuenta */}
      <div className="bg-white/20 dark:bg-black/20 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 dark:border-white/5 border-t border-l border-t-white/60 border-l-white/60 dark:border-t-white/20 dark:border-l-white/20 shadow-2xl shadow-black/[0.03] p-8 transition-colors">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 tracking-tight">Cuenta</h2>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="text-red-600 border-red-300 hover:bg-red-50"
        >
          Cerrar Sesión
        </Button>
      </div>
    </div>
  );
}
