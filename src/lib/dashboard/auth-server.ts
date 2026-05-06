import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export async function getAuthSession(): Promise<{ user: { id: string } }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function getShopId(session: { user: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

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
