import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { fetchPublicCombos } from "@/lib/dashboard/booking/public-booking-actions";
import { fetchPublicStoreProducts, type PublicStoreProduct } from "@/lib/dashboard/store/public-store-actions";
import BookingClient from "./booking-client";
import { absoluteUrl } from "@/lib/seo";
import { DEFAULT_BOOKING_TEMPLATE, BOOKING_TEMPLATE_PRESETS, type BookingTemplateId } from "@/lib/booking/theme-presets";
import { resolveIndustry } from "@/lib/industry/resolve";
import { getShopFeatures } from "@/lib/industry/features";

async function createAdminClient() {
  return createServiceRoleClient();
}

interface BookPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; order?: string; step?: string }>;
}

export const dynamic = "force-dynamic";

export default async function BookPage({ params, searchParams }: BookPageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const admin = await createAdminClient();

  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("id, nombre, description, address, localidad, phone, instagram_url, business_hours, slug, mp_public_key, industry, pay_at_shop, bank_transfer_enabled, booking_deposit_enabled, booking_deposit_amount, bank_cvu_cbu, bank_alias, bank_name")
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

  const combosPromise = fetchPublicCombos(shop.id);
  const [servicesRes, membershipsRes, combosRes] = await Promise.all([
    admin
      .from("services")
      .select("id, name, description, price, duration_minutes, category, pay_at_shop")
      .eq("shop_id", shop.id)
      .order("name", { ascending: true }),
    admin
      .from("shop_memberships")
      .select("user_id, role")
      .eq("shop_id", shop.id)
      .eq("is_active", true)
      .in("role", ["owner", "staff"])
      .order("created_at", { ascending: true }),
    combosPromise,
  ]);

  const memberIds = (membershipsRes.data || []).map((m) => m.user_id).filter(Boolean);
  const [staffProfilesRes, staffServicesRes, staffExtraRes] = memberIds.length
    ? await Promise.all([
        admin.from("user_profiles").select("user_id, name").in("user_id", memberIds),
        admin.from("staff_services").select("staff_id, service_id").in("staff_id", memberIds),
        admin.from("staff_profiles").select("user_id, description, photo_url, instagram, whatsapp").in("user_id", memberIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

  const profileMap = new Map((staffProfilesRes.data || []).map((p) => [p.user_id, p.name || "Sin nombre"]));
  const profileExtraMap = new Map((staffExtraRes.data || []).map((p) => [p.user_id, p]));

  const services = servicesRes.data || [];
  const servicesError: string | null = servicesRes.error?.message ?? null;
  const combos = combosRes.success ? (combosRes.data ?? []) : [];
  const combosError: string | null = combosRes.success ? null : (combosRes.error ?? "Error al cargar combos");
  const staffMembers = memberIds
    .map((id) => {
      const extra = profileExtraMap.get(id);
      return {
        id,
        name: profileMap.get(id) || "Sin nombre",
        photo_url: extra?.photo_url ?? null,
        description: extra?.description ?? null,
        instagram: extra?.instagram ?? null,
        whatsapp: extra?.whatsapp ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const staffServicesMap: Record<string, string[]> = {};
  for (const row of (staffServicesRes.data || [])) {
    if (!staffServicesMap[row.staff_id]) staffServicesMap[row.staff_id] = [];
    staffServicesMap[row.staff_id].push(row.service_id);
  }

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
    .select("template_id, section_order, section_service_order, logo_url, hero_title")
    .eq("shop_id", shop.id)
    .maybeSingle();

  const features = await getShopFeatures(shop.id);

  let products: PublicStoreProduct[] = [];
  let productsError: string | null = null;
  if (features.store) {
    const productsResult = await fetchPublicStoreProducts(shop.id);
    if (productsResult.success) {
      products = productsResult.data ?? [];
    } else {
      productsError = productsResult.error ?? "Error al cargar la tienda";
    }
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd).replace(/</g, "\\u003C") }}
      />
      <BookingClient
        services={services.map((s) => ({ ...s, duration_minutes: s.duration_minutes ?? 0 }))}
        shop={{
          id: shop.id,
          name: shop.nombre,
          description: shop.description || "",
          address: shop.address || "",
          city: shop.localidad || "",
          phone: shop.phone || "",
          instagramUrl: shop.instagram_url || "",
          slug: shop.slug || "",
          industry: resolveIndustry((shop as { industry?: string | null }).industry || null),
          mpPublicKey: shop.mp_public_key || "",
          payAtShop: shop.pay_at_shop ?? false,
          bankTransferEnabled: shop.bank_transfer_enabled === true,
          bookingDepositEnabled: shop.booking_deposit_enabled !== false,
          bookingDepositAmount: Math.max(0, Number(shop.booking_deposit_amount ?? 0)),
          bankCvuCb: shop.bank_cvu_cbu || "",
          bankAlias: shop.bank_alias || "",
          bankName: shop.bank_name || "",
          logoUrl: (bookingTheme?.logo_url as string | null) || "",
          heroTitle: (bookingTheme?.hero_title as string | null) || "",
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
          templateId: (bookingTheme?.template_id && (BOOKING_TEMPLATE_PRESETS as readonly { id: string }[]).some((p) => p.id === bookingTheme.template_id)
            ? bookingTheme.template_id
            : DEFAULT_BOOKING_TEMPLATE) as BookingTemplateId,
        }}
        servicesError={servicesError}
        combos={combos}
        combosError={combosError}
        staffMembers={staffMembers}
        staffServicesMap={staffServicesMap}
        storeEnabled={features.store}
        storeProducts={products}
        storeError={productsError}
        status={sp.status ?? null}
        orderId={sp.order ?? null}
        initialStep={!sp.status && !sp.order && sp.step === "tienda" ? "tienda" : null}
      />
    </>
  );
}
