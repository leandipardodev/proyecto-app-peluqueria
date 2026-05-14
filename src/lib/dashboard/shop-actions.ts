"use server";

import { createServiceRoleClient, requireOwnerShopId, requireShopId } from "@/lib/dashboard/auth-server";
import type { ActionResult } from "@/lib/types";
import { createServerClient } from "@/lib/supabase/server";
import { revalidateDashboardSegments } from "@/lib/dashboard/revalidate-dashboard";
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

    await revalidateDashboardSegments(shopId, ["/profile"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar" };
  }
}

export async function deleteCurrentShop(): Promise<ActionResult> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    await admin.from("shop_billing_events").insert({
      shop_id: shopId,
      actor_user_id: user?.id || null,
      event_type: "shop_deletion_requested",
      payload: {},
    });

    const { error } = await admin
      .from("shops")
      .delete()
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/business", "/settings"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al borrar local" };
  }
}
