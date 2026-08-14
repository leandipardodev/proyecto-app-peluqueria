"use server";

import { createServiceRoleClient, requireOwnerShopId, requireShopId } from "@/lib/dashboard/auth/server";
import type { ActionResult } from "@/lib/types";
import { createServerClient } from "@/lib/supabase/server";
import { revalidateDashboardSegments } from "@/lib/dashboard/shared/revalidate-dashboard";
import type { Json } from "@/lib/supabase/database.types";
import "server-only";
import { createAdminClient } from "../appointments/shared";

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
      .eq("id", shopId!);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/profile"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar" };
  }
}

export async function deleteCurrentShop(shopSlug?: string): Promise<ActionResult> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const admin = await createAdminClient();

    let shopId: string | null = null;

    if (shopSlug) {
      const { data: shop } = await admin
        .from("shops")
        .select("id")
        .eq("slug", shopSlug)
        .maybeSingle();

      if (!shop) return { success: false, error: "LOCAL_INVALIDO" };
      shopId = shop.id;

      const { data: membership } = await supabase
        .from("shop_memberships")
        .select("role, is_active")
        .eq("user_id", user?.id ?? "")
        .eq("shop_id", shopId!)
        .maybeSingle();

      if (!membership?.is_active || membership.role !== "owner") {
        return { success: false, error: "Solo el owner del local puede realizar esta accion" };
      }
    } else {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data ?? null;
    }

    await admin.from("shop_billing_events").insert({
      shop_id: shopId!,
      actor_user_id: user?.id || null,
      event_type: "shop_deletion_requested",
      payload: {} as Json,
    });

    const { error } = await admin
      .from("shops")
      .delete()
      .eq("id", shopId!);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/business", "/settings"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al borrar local" };
  }
}

export async function toggleAutoComplete(enabled: boolean): Promise<ActionResult> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const { error } = await admin
      .from("shops")
      .update({ auto_complete_enabled: enabled, updated_at: new Date().toISOString() })
      .eq("id", shopId!);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar autocompletado" };
  }
}
