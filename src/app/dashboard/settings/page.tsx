"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { updateShopName } from "@/lib/dashboard/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ShopProfile {
  id: string;
  name: string;
  plan_expiry: string;
  active: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const supabase = createClient();

  // Load shop profile
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

      const { data: shopData, error: shopError } = await supabase
        .from("shops")
        .select("*")
        .eq("id", data.shop_id)
        .single();

      if (!shopError && shopData) {
        setProfile(shopData as unknown as ShopProfile);
        setName(shopData.name);
      }
      setLoading(false);
    }
    loadProfile();
  }, []);

  const handleSave = () => {
    if (!profile) return;

    const formData = new FormData();
    formData.set("shop_id", profile.id);
    formData.set("name", name);

    startTransition(async () => {
      setMessage(null);
      const result = await updateShopName(formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: "Configuración guardada exitosamente" });
        setProfile({ ...profile, name });
      }
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) return <div className="p-6">Cargando...</div>;

  if (!profile) return <div className="p-6 text-red-600">Error al cargar el perfil</div>;

  const expiryDate = new Date(profile.plan_expiry).toLocaleDateString("es-AR");

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Configuración</h1>

      {message && (
        <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Información de la Peluquería</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="shop-name">Nombre</Label>
            <Input
              id="shop-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Plan y Facturación</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Estado</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {profile.active ? (
                <span className="text-green-600">Activo</span>
              ) : (
                <span className="text-red-600">Inactivo</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Vencimiento del Plan</dt>
            <dd className="mt-1 text-sm text-gray-900">{expiryDate}</dd>
          </div>
        </dl>

      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Cuenta</h2>
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
