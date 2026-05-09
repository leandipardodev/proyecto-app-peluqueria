"use server";

import { createServerClient as createSsrClient } from "@supabase/ssr";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import { revalidatePath } from "next/cache";
import "server-only";

function createAdminClient() {
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
    }
  );
}

export async function updateShopInfo(data: {
  name: string;
  description: string;
  address: string;
  phone: string;
  instagram_url: string;
}) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);
  const admin = createAdminClient();

  const { error } = await admin
    .from("shops")
    .update({
      name: data.name,
      description: data.description || null,
      address: data.address || null,
      phone: data.phone || null,
      instagram_url: data.instagram_url || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shopId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings");
  return { success: true };
}
