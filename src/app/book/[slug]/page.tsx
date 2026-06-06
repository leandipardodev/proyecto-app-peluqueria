import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import BookingClient from "./booking-client";
import { absoluteUrl } from "@/lib/seo";
import { DEFAULT_BOOKING_TEMPLATE, type BookingTemplateId } from "@/lib/booking/theme-presets";
import { resolveIndustry } from "@/lib/industry/resolve";

async function createAdminClient() {
  return createServiceRoleClient();
}

interface BookPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params;
  const admin = await createAdminClient();

  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("id, nombre, description, address, phone, instagram_url, business_hours, slug, mp_public_key, industry, pay_at_shop")
    .eq("slug", slug)
    .maybeSingle();

  if (shopError || !shop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-100 to-white dark:from-zinc-950 dark:to-black">
        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 p-10 text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Peluquería no encontrada
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            El enlace que seguiste no es válido.
          </p>
        </div>
      </div>
    );
  }

  const [servicesRes, membershipsRes] = await Promise.all([
    admin
      .from("services")
      .select("id, name, price, duration_minutes, category, pay_at_shop")
      .eq("shop_id", shop.id)
      .order("name", { ascending: true }),
    admin
      .from("shop_memberships")
      .select("user_id, role")
      .eq("shop_id", shop.id)
      .eq("is_active", true)
      .in("role", ["owner", "staff"])
      .order("created_at", { ascending: true }),
  ]);

  const memberIds = (membershipsRes.data || []).map((m) => m.user_id).filter(Boolean);
  const staffProfilesRes = memberIds.length
    ? await admin
        .from("user_profiles")
        .select("user_id, name")
        .in("user_id", memberIds)
    : { data: [], error: null };

  const profileMap = new Map((staffProfilesRes.data || []).map((p) => [p.user_id, p.name || "Sin nombre"]));

  const services = servicesRes.data || [];
  const staffMembers = memberIds
    .map((id) => ({ id, name: profileMap.get(id) || "Sin nombre" }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const localBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "HairSalon",
    name: shop.nombre,
    description: shop.description || `Reserva de turnos online en ${shop.nombre}`,
    url: absoluteUrl(`/book/${shop.slug}`),
    image: absoluteUrl("/hero.png"),
    telephone: shop.phone || undefined,
    address: shop.address
      ? {
          "@type": "PostalAddress",
          streetAddress: shop.address,
          addressCountry: "AR",
        }
      : undefined,
    sameAs: shop.instagram_url ? [shop.instagram_url] : undefined,
    makesOffer: services.map((service) => ({
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: service.name,
      },
      price: service.price,
      priceCurrency: "ARS",
    })),
  };

  const { data: bookingTheme } = await admin
    .from("shop_booking_theme")
    .select("template_id, section_order, section_service_order, logo_url, hero_title, hero_subtitle, about_title, about_text")
    .eq("shop_id", shop.id)
    .maybeSingle();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd).replace(/</g, "\\u003C") }}
      />
      <BookingClient
        shop={{
          id: shop.id,
          name: shop.nombre,
          description: shop.description || "",
          address: shop.address || "",
          phone: shop.phone || "",
          instagramUrl: shop.instagram_url || "",
          slug: shop.slug || "",
          industry: resolveIndustry((shop as { industry?: string | null }).industry || null),
          mpPublicKey: shop.mp_public_key || "",
          payAtShop: shop.pay_at_shop ?? false,
          logoUrl: (bookingTheme?.logo_url as string | null) || "",
          heroTitle: (bookingTheme?.hero_title as string | null) || "",
          heroSubtitle: (bookingTheme?.hero_subtitle as string | null) || "",
          aboutTitle: (bookingTheme?.about_title as string | null) || "",
          aboutText: (bookingTheme?.about_text as string | null) || "",
          sectionOrder: Array.isArray((bookingTheme as { section_order?: string[] } | null)?.section_order)
            ? (((bookingTheme as { section_order?: string[] }).section_order || [])
                .map((item) => String(item || "").trim())
                .filter(Boolean))
            : [],
          sectionServiceOrder: Array.isArray((bookingTheme as { section_service_order?: string[] } | null)?.section_service_order)
            ? (((bookingTheme as { section_service_order?: string[] }).section_service_order || [])
                .map((item) => String(item || "").trim())
                .filter(Boolean))
            : [],
          templateId: (["classic-dark", "minimal-glass", "editorial-luxury", "street-bold"].includes(String(bookingTheme?.template_id))
            ? bookingTheme?.template_id
            : DEFAULT_BOOKING_TEMPLATE) as BookingTemplateId,
        }}
        services={services}
        staffMembers={staffMembers}
      />
    </>
  );
}
