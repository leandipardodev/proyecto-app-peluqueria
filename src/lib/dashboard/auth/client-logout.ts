"use client";

import { supabase } from "@/lib/supabase";
import { logout } from "@/lib/dashboard/auth/logout-action";

export async function clientLogout() {
  try { await supabase.auth.signOut(); } catch { /* best effort — server action clears cookies anyway */ }
  await logout();
}
