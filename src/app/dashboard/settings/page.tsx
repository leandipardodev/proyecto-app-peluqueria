"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { updateShopName } from "@/lib/dashboard/auth-actions";
import { Bell, BellOff, Moon, Sun } from "lucide-react";
import { useDarkMode } from "@/lib/use-dark-mode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isMuted, setMuted, playPop } from "@/lib/sound";
import { fetchWhatsappTemplate, updateWhatsappTemplate } from "@/lib/dashboard/whatsapp-actions";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import { fetchMercadoPagoKeys, updateMercadoPagoKeys } from "@/lib/payments/mercadopago-actions";
import { updateShopInfo } from "@/lib/dashboard/shop-actions";

interface ShopProfile {
  id: string;
  name: string;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  instagram_url?: string | null;
  plan_expiry: string;
  active: boolean;
  mp_public_key?: string;
  mp_access_token?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const { dark, toggle: toggleDark } = useDarkMode();
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [mpPublicKey, setMpPublicKey] = useState("");
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [mpSaving, setMpSaving] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSoundEnabled(!isMuted());
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    fetchWhatsappTemplate().then(setWhatsappTemplate);
    fetchMercadoPagoKeys().then((keys) => {
      setMpPublicKey(keys.mp_public_key);
      setMpAccessToken(keys.mp_access_token);
    });
  }, [profile?.id]);
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
        setDescription(shopData.description || "");
        setShopAddress(shopData.address || "");
        setShopPhone(shopData.phone || "");
        setInstagramUrl(shopData.instagram_url || "");
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
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Configuración</h1>

      {message && (
        <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950 p-6 mb-6 transition-colors">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Información de la Peluquería</h2>
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

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950 p-6 mb-6 transition-colors">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Información del Local</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Estos datos se muestran en la página pública de reservas.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="shop-name">Nombre del Local</Label>
            <Input
              id="shop-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="shop-description">Descripción</Label>
            <textarea
              id="shop-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-3 py-2 text-sm dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
              placeholder="Contanos brevemente sobre tu local..."
            />
          </div>
          <div>
            <Label htmlFor="shop-address">Dirección</Label>
            <Input
              id="shop-address"
              value={shopAddress}
              onChange={(e) => setShopAddress(e.target.value)}
              className="mt-1"
              placeholder="Ej: Av. Siempre Viva 123"
            />
          </div>
          <div>
            <Label htmlFor="shop-phone">Teléfono</Label>
            <Input
              id="shop-phone"
              value={shopPhone}
              onChange={(e) => setShopPhone(e.target.value)}
              className="mt-1"
              placeholder="Ej: 11 1234-5678"
            />
          </div>
          <div>
            <Label htmlFor="shop-instagram">Instagram</Label>
            <Input
              id="shop-instagram"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              className="mt-1"
              placeholder="https://instagram.com/tu-local"
            />
          </div>
          <Button
            onClick={async () => {
              setMessage(null);
              const result = await updateShopInfo({
                name,
                description,
                address: shopAddress,
                phone: shopPhone,
                instagram_url: instagramUrl,
              });
              if (result.error) {
                setMessage({ type: "error", text: result.error });
              } else {
                setMessage({ type: "success", text: "Información guardada exitosamente" });
              }
            }}
            disabled={pending}
          >
            Guardar Cambios
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950 p-6 mb-6 transition-colors">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Plan y Facturación</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Estado</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {profile.active ? (
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

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950 p-6 mb-6 transition-colors">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Apariencia</h2>
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

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950 p-6 mb-6 transition-colors">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Notificaciones Sonoras</h2>
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

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950 p-6 mb-6 transition-colors">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Pagos y Cobros</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Configurá tus claves de Mercado Pago para generar links de pago desde los turnos.
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="mp_public_key">MP_PUBLIC_KEY</Label>
            <Input
              id="mp_public_key"
              value={mpPublicKey}
              onChange={(e) => setMpPublicKey(e.target.value)}
              className="mt-1 font-mono text-sm"
              placeholder="APP_USR-xxxx-xxxxxxx"
            />
          </div>
          <div>
            <Label htmlFor="mp_access_token">MP_ACCESS_TOKEN</Label>
            <Input
              id="mp_access_token"
              value={mpAccessToken}
              onChange={(e) => setMpAccessToken(e.target.value)}
              className="mt-1 font-mono text-sm"
              type="password"
              placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxx"
            />
          </div>
          <Button
            onClick={async () => {
              setMpSaving(true);
              setMessage(null);
              const result = await updateMercadoPagoKeys(mpPublicKey, mpAccessToken);
              if (result.error) {
                setMessage({ type: "error", text: result.error });
              } else {
                setMessage({ type: "success", text: "Claves de Mercado Pago guardadas" });
              }
              setMpSaving(false);
            }}
            disabled={mpSaving}
          >
            {mpSaving ? "Guardando..." : "Guardar Claves"}
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950 p-6 mb-6 transition-colors">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Mensaje de WhatsApp</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Personalizá el texto que se envía desde el botón WhatsApp en la tabla de turnos.
          Usá <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">{'{Nombre}'}</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">{'{Peluqueria}'}</code> y <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">{'{Hora}'}</code> como placeholders.
        </p>
        <div className="space-y-3">
          <textarea
            value={whatsappTemplate}
            onChange={(e) => setWhatsappTemplate(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {whatsappTemplate.includes("{Hora}") ? (
                <span className="text-green-600">✓ Contiene {`{Hora}`}</span>
              ) : (
                <span className="text-amber-600">⚠ No contiene {`{Hora}`} — el horario no se va a mostrar</span>
              )}
            </p>
            <Button
              onClick={async () => {
                setTemplateSaving(true);
                setMessage(null);
                const result = await updateWhatsappTemplate(whatsappTemplate);
                if (result.error) {
                  setMessage({ type: 'error', text: result.error });
                } else {
                  setMessage({ type: 'success', text: "Plantilla de WhatsApp guardada" });
                }
                setTemplateSaving(false);
              }}
              disabled={templateSaving}
              size="sm"
            >
              {templateSaving ? "Guardando..." : "Guardar Plantilla"}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950 p-6 transition-colors">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Cuenta</h2>
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
