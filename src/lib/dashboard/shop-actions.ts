"use server";

import { createServerClient as createSsrClient } from "@supabase/ssr";
import { requireShopId } from "@/lib/dashboard/auth-server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/types";
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
}): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
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

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar" };
  }
}
