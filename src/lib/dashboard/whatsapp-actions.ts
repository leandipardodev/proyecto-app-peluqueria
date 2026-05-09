"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createServerClient as createSsrClient } from "@supabase/ssr";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
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

export async function fetchWhatsappTemplate(): Promise<string> {
  const session = await getAuthSession();
  const shopId = await getShopId(session);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("shops")
    .select("whatsapp_template")
    .eq("id", shopId)
    .single();

  if (error || !data?.whatsapp_template) {
    return DEFAULT_WHATSAPP_TEMPLATE;
  }

  return data.whatsapp_template as string;
}

export async function updateWhatsappTemplate(template: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);
  const admin = createAdminClient();

  const { error } = await admin
    .from("shops")
    .update({ whatsapp_template: template })
    .eq("id", shopId);

  if (error) {
    if (error.message?.includes("column") || error.code === "42703") {
      return { error: "La columna 'whatsapp_template' no existe en la tabla 'shops'. Ejecutá la migración primero." };
    }
    return { error: error.message };
  }

  return { success: true };
}
