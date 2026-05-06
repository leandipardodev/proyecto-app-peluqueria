import { createClient } from "@supabase/supabase-js";

export async function getTenantAndUser(session: {
  access_token: string;
  user: { id: string; email?: string };
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    }
  );

  const { data: userProfile, error: profileError } = await supabase
    .from("user_profiles")
    .select("shop_id, role")
    .eq("user_id", session.user.id)
    .single();

  if (profileError || !userProfile) {
    return { shopName: "Mi Peluquería", userName: session.user.email || "Usuario" };
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("name")
    .eq("id", userProfile.shop_id)
    .single();

  return {
    shopName: shop?.name || "Mi Peluquería",
    userName: session.user.email || "Usuario",
  };
}
