"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createServerClient as createSsrClient } from "@supabase/ssr";
import { requireShopId } from "@/lib/dashboard/auth-server";
import type { ActionResult } from "@/lib/types";
import "server-only";
import { DEFAULT_WHATSAPP_TEMPLATE } from "./whatsapp-constants";

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

export async function fetchWhatsappTemplate(): Promise<ActionResult<string>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("shops")
      .select("whatsapp_template")
      .eq("id", shopId)
      .single();

    if (error || !data?.whatsapp_template) {
      return { success: true, data: DEFAULT_WHATSAPP_TEMPLATE };
    }

    return { success: true, data: data.whatsapp_template as string };
  } catch (e) {
    return { success: true, data: DEFAULT_WHATSAPP_TEMPLATE };
  }
}

export async function updateWhatsappTemplate(template: string): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = createAdminClient();

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
