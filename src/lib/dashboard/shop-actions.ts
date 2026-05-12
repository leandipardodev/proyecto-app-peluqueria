"use server";

import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/types";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
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
    const admin = await createAdminClient();

    const { error } = await admin
      .from("shops")
      .update({
        nombre: data.name,
        description: data.description || null,
        address: data.address || null,
        phone: data.phone || null,
        instagram_url: data.instagram_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/profile");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar" };
  }
}
