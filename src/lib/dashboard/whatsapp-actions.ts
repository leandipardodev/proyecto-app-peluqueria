"use server";

import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import type { ActionResult } from "@/lib/types";
import "server-only";
import { DEFAULT_WHATSAPP_TEMPLATE } from "./whatsapp-constants";

async function createAdminClient() {
  return createServiceRoleClient();
}

export async function fetchWhatsappTemplate(shopIdOverride?: string): Promise<ActionResult<string>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: true, data: DEFAULT_WHATSAPP_TEMPLATE };
    }
    const admin = await createAdminClient();

    const { data, error } = await admin
      .from("shops")
      .select("whatsapp_template")
      .eq("id", shopId)
      .single();

    if (error || !data?.whatsapp_template) {
      return { success: true, data: DEFAULT_WHATSAPP_TEMPLATE };
    }

    return { success: true, data: data.whatsapp_template as string };
  } catch {
    return { success: true, data: DEFAULT_WHATSAPP_TEMPLATE };
  }
}

export async function updateWhatsappTemplate(template: string): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const { error } = await admin
      .from("shops")
      .update({ whatsapp_template: template })
      .eq("id", shopId);

    if (error) {
      if (error.message?.includes("column") || error.code === "42703") {
        return { success: false, error: "La columna 'whatsapp_template' no existe en la tabla 'shops'. Ejecutá la migración primero." };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar plantilla" };
  }
}
