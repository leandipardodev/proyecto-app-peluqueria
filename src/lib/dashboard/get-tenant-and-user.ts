import { createServerClient } from "@/lib/supabase/server";
import { getShopId } from "@/lib/dashboard/auth-server";

export async function getTenantAndUser() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  if (!user) {
    return { shopName: "Mi Peluquería", userName: "Usuario" };
  }

  const shopId = await getShopId({ user: { id: user.id } });

  if (!shopId) {
    return { shopName: "Mi Peluquería", userName: user.email || "Usuario" };
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("nombre")
    .eq("id", shopId)
    .maybeSingle();

  return {
    shopName: shop?.nombre || "Mi Peluquería",
    userName: user.email || "Usuario",
  };
}
