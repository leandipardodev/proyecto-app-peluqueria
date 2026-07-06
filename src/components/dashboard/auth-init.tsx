import { getCachedUser } from "@/lib/dashboard/auth/server";
import { createServerClient } from "@/lib/supabase/server";
import { resolveIndustry } from "@/lib/industry/resolve";

export default async function AuthInit() {
  const user = await getCachedUser();
  if (!user) return null;

  const supabase = await createServerClient();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("shop_id, name, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const metaName: string | null = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
  const metaAvatar: string | null = typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null;
  const metaPhone: string | null = typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null;

  const userInfo = {
    id: user.id,
    email: user.email ?? null,
    name: profile?.name ?? metaName,
    avatarUrl: metaAvatar,
    phone: metaPhone,
    role: profile?.role ?? null,
  };

  let shopInfo: Record<string, unknown> | null = null;
  if (profile?.shop_id) {
    const { data: shop } = await supabase
      .from("shops")
      .select("id, nombre, slug, industry, active, plan_expiry")
      .eq("id", profile.shop_id)
      .maybeSingle();

    if (shop) {
      shopInfo = {
        id: shop.id,
        name: shop.nombre,
        slug: shop.slug,
        industry: resolveIndustry(shop.industry),
        planExpiry: shop.plan_expiry,
        active: shop.active,
      };
    }
  }

  const json = JSON.stringify({ user: userInfo, shop: shopInfo });

  return (
    <script
      id="__AUTH_INIT__"
      type="application/json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
