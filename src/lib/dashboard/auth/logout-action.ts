"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function logout() {
  const supabase = await createServerClient();

  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete("klip_active_shop_id");
  cookieStore.delete("klip_active_shop_slug");

  redirect("/login");
}
