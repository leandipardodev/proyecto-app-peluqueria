"use server";

import { createServerClient } from "@/lib/supabase/server";
import { requireShopId } from "@/lib/dashboard/auth-server";
import { revalidateDashboardSegments } from "@/lib/dashboard/revalidate-dashboard";
import type { ActionResult } from "@/lib/types";
import "server-only";

type StockItem = {
  id: string;
  nombre_producto: string;
  quantity: number;
  unit_cost: number;
  created_at: string;
  updated_at: string | null;
  shop_id: string;
};

export async function fetchStockItems(shopIdOverride?: string): Promise<ActionResult<StockItem[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("stock")
      .select("id, nombre_producto, quantity, unit_cost, created_at, updated_at, shop_id")
      .eq("shop_id", shopId)
      .order("nombre_producto", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener stock" };
  }
}

export async function addProduct(formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const nombreProducto = (formData.get("nombre_producto") as string) || (formData.get("name") as string);
    const quantity = parseInt(formData.get("quantity") as string);
    const unitCost = parseFloat(formData.get("unit_cost") as string);

    if (!nombreProducto || isNaN(quantity) || isNaN(unitCost)) {
      return { success: false, error: "Todos los campos son obligatorios" };
    }

    if (unitCost < 0 || quantity < 0) {
      return { success: false, error: "Los valores no pueden ser negativos" };
    }

    const supabase = await createServerClient();

    const { error } = await supabase.from("stock").insert({
      shop_id: shopId,
      nombre_producto: nombreProducto,
      quantity,
      unit_cost: unitCost,
    });

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al agregar producto" };
  }
}

export async function updateStock(id: string, delta: number, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

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

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar stock" };
  }
}

export async function applyStockBatchAdjustments(
  adjustments: Array<{ id: string; delta: number }>,
  shopIdOverride?: string,
): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const normalized = adjustments
      .filter((a) => a.id && Number.isFinite(a.delta) && a.delta !== 0)
      .reduce<Record<string, number>>((acc, cur) => {
        acc[cur.id] = (acc[cur.id] || 0) + cur.delta;
        return acc;
      }, {});

    const ids = Object.keys(normalized);
    if (ids.length === 0) return { success: true };

    const supabase = await createServerClient();
    const { data: existing, error: fetchError } = await supabase
      .from("stock")
      .select("id, quantity")
      .eq("shop_id", shopId)
      .in("id", ids);

    if (fetchError) return { success: false, error: fetchError.message };

    const currentById = new Map((existing || []).map((row) => [row.id, Number(row.quantity || 0)]));
    for (const id of ids) {
      if (!currentById.has(id)) return { success: false, error: "Producto no encontrado" };
      const next = (currentById.get(id) || 0) + normalized[id];
      if (next < 0) return { success: false, error: "La cantidad no puede ser negativa" };
    }

    const results = await Promise.all(
      ids.map(async (id) => {
        const next = (currentById.get(id) || 0) + normalized[id];
        return supabase
          .from("stock")
          .update({ quantity: next, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("shop_id", shopId);
      })
    );
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) return { success: false, error: firstError.message };

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al aplicar ajustes" };
  }
}

export async function deleteProduct(id: string, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const supabase = await createServerClient();

    const { error } = await supabase
      .from("stock")
      .delete()
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar producto" };
  }
}
