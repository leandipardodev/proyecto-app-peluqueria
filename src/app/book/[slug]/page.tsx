import { createServerClient as createSsrClient } from "@supabase/ssr";
import BookingClient from "./booking-client";

function createAdminClient() {
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll() { return []; }, setAll() {} },
    }
  );
}

interface BookPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("id, name, description, address, phone, instagram_url, business_hours, slug")
    .eq("slug", slug)
    .single();

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

  const [servicesRes, staffRes] = await Promise.all([
    admin
      .from("services")
      .select("id, name, price, duration_minutes")
      .eq("shop_id", shop.id)
      .order("name", { ascending: true }),
    admin
      .from("user_profiles")
      .select("user_id, name")
      .eq("shop_id", shop.id)
      .in("role", ["owner", "staff"])
      .order("name", { ascending: true }),
  ]);

  const services = servicesRes.data || [];
  const staffMembers = (staffRes.data || []).map((s) => ({
    id: s.user_id,
    name: s.name || "Sin nombre",
  }));

  return (
    <BookingClient
      shop={{
        id: shop.id,
        name: shop.name,
        description: shop.description || "",
        address: shop.address || "",
        phone: shop.phone || "",
        instagramUrl: shop.instagram_url || "",
        slug: shop.slug || "",
      }}
      services={services}
      staffMembers={staffMembers}
    />
  );
}
