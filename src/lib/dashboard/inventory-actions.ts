"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireShopId } from "@/lib/dashboard/auth-server";
import type { ActionResult } from "@/lib/types";
import "server-only";

type StockItem = {
  id: string;
  name: string;
  quantity: number;
  unit_cost: number;
  created_at: string;
  updated_at: string | null;
  shop_id: string;
};

export async function fetchStockItems(): Promise<ActionResult<StockItem[]>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("stock")
      .select("*")
      .eq("shop_id", shopId)
      .order("name", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener stock" };
  }
}

export async function addProduct(formData: FormData): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const name = formData.get("name") as string;
    const quantity = parseInt(formData.get("quantity") as string);
    const unitCost = parseFloat(formData.get("unit_cost") as string);

    if (!name || isNaN(quantity) || isNaN(unitCost)) {
      return { success: false, error: "Todos los campos son obligatorios" };
    }

    if (unitCost < 0 || quantity < 0) {
      return { success: false, error: "Los valores no pueden ser negativos" };
    }

    const supabase = await createServerClient();

    const { error } = await supabase.from("stock").insert({
      shop_id: shopId,
      name,
      quantity,
      unit_cost: unitCost,
    });

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al agregar producto" };
  }
}

export async function updateStock(id: string, delta: number): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const supabase = await createServerClient();

    const { data: existing, error: fetchError } = await supabase
      .from("stock")
      .select("quantity")
      .eq("id", id)
      .eq("shop_id", shopId)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Producto no encontrado" };
    }

    const newQuantity = existing.quantity + delta;
    if (newQuantity < 0) {
      return { success: false, error: "La cantidad no puede ser negativa" };
    }

    const { error } = await supabase
      .from("stock")
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar stock" };
  }
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const supabase = await createServerClient();

    const { error } = await supabase
      .from("stock")
      .delete()
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar producto" };
  }
}
