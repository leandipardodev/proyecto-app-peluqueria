import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function getAuthSession(): Promise<{ user: { id: string } }> {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { user };
}

export async function getShopId(session: { user: { id: string } }) {
  const supabase = await createServerClient();

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("shop_id")
    .eq("user_id", session.user.id)
    .single();

  if (error || !profile) {
    throw new Error("No se pudo obtener la peluquería asociada");
  }

  return profile.shop_id;
}
