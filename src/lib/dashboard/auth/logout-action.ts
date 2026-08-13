"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function logout() {
  const supabase = await createServerClient();

  await supabase.auth.signOut();

  const cookieStore = await cookies();
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith("sb-")) cookieStore.delete(c.name);
  }
  cookieStore.delete("klip_active_shop_id");
  cookieStore.delete("klip_active_shop_slug");
  cookieStore.delete("klip_oauth_flow");
  cookieStore.delete("klip_oauth_next");
  cookieStore.delete("klip_oauth_state");

  redirect("/login");
}
