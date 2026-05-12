import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export async function getAuthSession(): Promise<{ user: { id: string } } | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { user };
}

export async function getShopId(session: { user: { id: string } }): Promise<string | null> {
  const supabase = await createServerClient();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("shop_id")
    .eq("user_id", session.user.id)
    .single();
  if (!profile) return null;
  return profile.shop_id;
}

export async function requireShopId(): Promise<ActionResult<string>> {
  const session = await getAuthSession();
  if (!session) return { success: false, error: "SESION_EXPIRADA" };
  const shopId = await getShopId(session);
  if (!shopId) return { success: false, error: "SESION_EXPIRADA" };
  return { success: true, data: shopId };
}
