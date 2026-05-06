"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";

export async function fetchStockItems() {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("stock")
    .select("*")
    .eq("shop_id", shopId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

export async function addProduct(formData: FormData) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const name = formData.get("name") as string;
  const quantity = parseInt(formData.get("quantity") as string);
  const unitCost = parseFloat(formData.get("unit_cost") as string);

  if (!name || isNaN(quantity) || isNaN(unitCost)) {
    return { error: "Todos los campos son obligatorios" };
  }

  if (unitCost < 0 || quantity < 0) {
    return { error: "Los valores no pueden ser negativos" };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await supabase.from("stock").insert({
    shop_id: shopId,
    name,
    quantity,
    unit_cost: unitCost,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/inventory");
  return { success: true };
}

export async function updateStock(id: string, delta: number) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: existing, error: fetchError } = await supabase
    .from("stock")
    .select("quantity")
    .eq("id", id)
    .eq("shop_id", shopId)
    .single();

  if (fetchError || !existing) {
    return { error: "Producto no encontrado" };
  }

  const newQuantity = existing.quantity + delta;
  if (newQuantity < 0) {
    return { error: "La cantidad no puede ser negativa" };
  }

  const { error } = await supabase
    .from("stock")
    .update({ quantity: newQuantity })
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/inventory");
  return { success: true };
}

export async function deleteProduct(id: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await supabase
    .from("stock")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/inventory");
  return { success: true };
}
