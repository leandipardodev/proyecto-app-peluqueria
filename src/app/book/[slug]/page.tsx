import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import BookingClient from "./booking-client";
import { absoluteUrl } from "@/lib/seo";

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
    .select("id, nombre, description, address, phone, instagram_url, business_hours, slug, mp_public_key")
    .eq("slug", slug)
    .maybeSingle();

  if (shopError || !shop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-100 to-white dark:from-zinc-950 dark:to-black">
        <div className="bg-white/20 dark:bg-black/20 backdrop-blur-3xl rounded-[2rem] border border-white/20 p-10 text-center max-w-md">
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
      .select("id, name, price, duration_minutes")
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
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
          mpPublicKey: shop.mp_public_key || "",
        }}
        services={services}
        staffMembers={staffMembers}
      />
    </>
  );
}
