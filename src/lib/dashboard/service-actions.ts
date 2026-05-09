"use server";

import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
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

export async function fetchServices() {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("services")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchServices] Supabase error:", error);
    throw error;
  }
  return data;
}

export async function createService(formData: FormData) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const name = formData.get("name") as string;
  const price = parseFloat(formData.get("price") as string);
  const durationMinutes = parseInt(formData.get("duration_minutes") as string);

  if (!name || isNaN(price) || isNaN(durationMinutes)) {
    return { error: "Todos los campos son obligatorios" };
  }

  if (price < 0) {
    return { error: "El precio no puede ser negativo" };
  }

  const admin = createAdminClient();

  const { error } = await admin.from("services").insert({
    shop_id: shopId,
    name,
    price,
    duration_minutes: durationMinutes,
  });

  if (error) {
    console.error("[createService] Supabase error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/services");
  return { success: true };
}

export async function updateService(id: string, formData: FormData) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const name = formData.get("name") as string;
  const price = parseFloat(formData.get("price") as string);
  const durationMinutes = parseInt(formData.get("duration_minutes") as string);

  if (!name || isNaN(price) || isNaN(durationMinutes)) {
    return { error: "Todos los campos son obligatorios" };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("services")
    .update({ name, price, duration_minutes: durationMinutes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) {
    console.error("[updateService] Supabase error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/services");
  return { success: true };
}

export async function deleteService(id: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const admin = createAdminClient();

  const { error } = await admin
    .from("services")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) {
    console.error("[deleteService] Supabase error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/services");
  return { success: true };
}
