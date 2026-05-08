import { createServerClient } from "@supabase/ssr";
import { createServerClient as createCookieClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, MapPin, Phone, Clock } from "lucide-react";

function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll() { return []; }, setAll() {} },
    }
  );
}

interface BookPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ staffId?: string; serviceId?: string; error?: string }>;
}

export const dynamic = "force-dynamic";

export default async function BookPage({ params, searchParams }: BookPageProps) {
  const { slug } = await params;
  const { staffId: preselectedStaffId, serviceId: preselectedServiceId, error } = await searchParams;

  console.log("[BookPage] slug param:", slug);

  const supabase = createAdminClient();
  const authClient = await createCookieClient();

  // Fetch shop by slug first
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id, name, address, phone, opening_hours, google_maps_url, slug")
    .eq("slug", slug)
    .single();

  if (shopError || !shop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Peluquería no encontrada
          </h1>
          <p className="text-gray-600">
            El enlace que seguiste no es válido.
          </p>
        </div>
      </div>
    );
  }

  // If user is already logged in, redirect to the client booking flow directly
  const session = await authClient.auth.getSession();
  if (session?.data?.session?.user) {
    const sp = new URLSearchParams();
    if (preselectedServiceId) sp.set("serviceId", preselectedServiceId);
    if (preselectedStaffId) sp.set("staffId", preselectedStaffId);
    const qs = sp.toString();
    redirect(qs ? `/client/book?${qs}` : "/client/book");
  }

  // Fetch active services
  const { data: services } = await supabase
    .from("services")
    .select("id, name, price, duration_minutes")
    .eq("shop_id", shop.id)
    .order("name", { ascending: true });

  // Fetch staff members
  const { data: staffMembers } = await supabase
    .from("user_profiles")
    .select("user_id, name")
    .eq("shop_id", shop.id)
    .in("role", ["owner", "staff"])
    .order("name", { ascending: true });

  // Parse opening hours
  let openingHours: Record<string, string> | null = null;
  if (shop.opening_hours) {
    try {
      openingHours = typeof shop.opening_hours === "string"
        ? JSON.parse(shop.opening_hours)
        : shop.opening_hours;
    } catch {
      openingHours = null;
    }
  }

  const dayNames: Record<string, string> = {
    mon: "Lunes",
    tue: "Martes",
    wed: "Miércoles",
    thu: "Jueves",
    fri: "Viernes",
    sat: "Sábado",
    sun: "Domingo",
  };

  function getGoogleAuthUrl(serviceId?: string, staffId?: string) {
    const state = encodeURIComponent(
      JSON.stringify({
        shopSlug: slug,
        serviceId,
        staffId,
      })
    );
    return `/book/${slug}/auth?state=${state}`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">{shop.name}</h1>
          <p className="mt-1 text-gray-600">Reservá tu turno online</p>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Services */}
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Nuestros Servicios
            </h2>

            {!services || services.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-500">
                  No hay servicios disponibles en este momento.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:border-violet-300 transition-colors"
                  >
                    <h3 className="font-semibold text-gray-900">
                      {service.name}
                    </h3>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        {service.duration_minutes} min
                      </span>
                      <span className="text-lg font-bold text-violet-600">
                        ${service.price.toFixed(2)}
                      </span>
                    </div>
                    <a
                      href={getGoogleAuthUrl(service.id)}
                      className="mt-3 block w-full text-center px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
                    >
                      Reservar con Google
                    </a>
                    
                    {/* Debug info - remove later */}
                    <details className="mt-2 text-xs text-gray-500">
                      <summary>Debug: URL de auth</summary>
                      <code className="break-all">{getGoogleAuthUrl(service.id)}</code>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column - Info */}
          <div className="space-y-6">
            {/* Contact Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Información</h3>
              <div className="space-y-3">
                {shop.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                    <span className="text-sm text-gray-600">{shop.address}</span>
                  </div>
                )}
                {shop.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-600">{shop.phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Opening Hours */}
            {openingHours && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-gray-400" />
                  Horarios
                </h3>
                <div className="space-y-2">
                  {Object.entries(dayNames).map(([key, label]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-gray-600">{label}</span>
                      <span className="text-gray-900 font-medium">
                        {openingHours![key] || "Cerrado"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Google Maps */}
            {shop.google_maps_url && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Ubicación</h3>
                <div className="aspect-video rounded-lg overflow-hidden">
                  <iframe
                    src={shop.google_maps_url}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Ubicación de la peluquería"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-gray-500">
          Powered by <span className="font-semibold text-violet-600">Klip</span>
        </div>
      </footer>
    </div>
  );
}
