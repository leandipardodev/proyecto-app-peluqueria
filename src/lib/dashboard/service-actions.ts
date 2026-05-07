"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import "server-only";

export async function fetchServices() {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  if (error) throw error;
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

  const supabase = await createServerClient();

  const { error } = await supabase.from("services").insert({
    shop_id: shopId,
    name,
    price,
    duration_minutes: durationMinutes,
  });

  if (error) return { error: error.message };

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

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("services")
    .update({ name, price, duration_minutes: durationMinutes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/services");
  return { success: true };
}

export async function deleteService(id: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/services");
  return { success: true };
}
