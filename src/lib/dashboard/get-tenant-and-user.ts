import { createServerClient } from "@/lib/supabase/server";

export async function getTenantAndUser() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  if (!user) {
    return { shopName: "Mi Peluquería", userName: "Usuario" };
  }

  const { data: userProfile, error: profileError } = await supabase
    .from("user_profiles")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .single();

  if (profileError || !userProfile) {
    return { shopName: "Mi Peluquería", userName: user.email || "Usuario" };
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("name")
    .eq("id", userProfile.shop_id)
    .single();

  return {
    shopName: shop?.name || "Mi Peluquería",
    userName: user.email || "Usuario",
  };
}
