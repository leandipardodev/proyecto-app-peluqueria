"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, requireOwnerShopId, requireShopId } from "@/lib/dashboard/auth/server";
import { createAdminClient } from "@/lib/dashboard/appointments/shared";
import { revalidateDashboardSegments } from "@/lib/dashboard/shared/revalidate-dashboard";
import { processProductImage, productImageStoragePath } from "@/lib/dashboard/store/image-upload";
import type { ActionResult } from "@/lib/types";
import "server-only";

export type StockItem = {
  id: string;
  nombre_producto: string;
  quantity: number;
  unit_cost: number | null;
  for_sale: boolean;
  price: number;
  description: string | null;
  image_url: string | null;
  category: string | null;
  visible: boolean;
  created_at: string | null;
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
      .select("id, nombre_producto, quantity, unit_cost, for_sale, price, description, image_url, category, visible, created_at, updated_at, shop_id")
      .eq("shop_id", shopId)
      .order("nombre_producto", { ascending: true });

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: (data || []).map((item) => ({
        ...item,
        quantity: item.quantity ?? 0,
        for_sale: item.for_sale,
        price: Number(item.price) || 0,
        visible: item.visible,
      })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener stock" };
  }
}

export async function addProduct(formData: FormData, shopIdOverride?: string): Promise<ActionResult<{ id: string }>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const nombreProducto = (formData.get("nombre_producto") as string) || (formData.get("name") as string);
    const quantity = parseInt(formData.get("quantity") as string);
    const unitCost = parseFloat(formData.get("unit_cost") as string);
    const forSale = formData.get("for_sale") === "true";
    const price = forSale ? parseFloat(formData.get("price") as string) : 0;
    const category = forSale ? ((formData.get("category") as string) || "").trim() || null : null;
    const description = forSale ? ((formData.get("description") as string) || "").trim() || null : null;
    const imageFile = (formData.get("image") as File | null) || null;

    if (!nombreProducto || isNaN(quantity) || isNaN(unitCost)) {
      return { success: false, error: "Todos los campos son obligatorios" };
    }

    if (unitCost < 0 || quantity < 0) {
      return { success: false, error: "Los valores no pueden ser negativos" };
    }

    if (forSale && isNaN(price)) {
      return { success: false, error: "Ingresa un precio de venta valido" };
    }

    const supabase = await createServerClient();
    const { data: inserted, error } = await supabase.from("stock").insert({
      shop_id: shopId,
      nombre_producto: nombreProducto,
      quantity,
      unit_cost: unitCost,
      for_sale: forSale,
      price: price || 0,
      category,
      description,
    }).select("id").single();

    if (error) return { success: false, error: error.message };

    const productId = inserted?.id;
    let imageUrl: string | null = null;

    if (forSale && productId && imageFile && imageFile.size > 0) {
      const admin = await createAdminClient();
      const processed = await processProductImage(imageFile);
      if (!processed.ok) return { success: false, error: processed.error };
      const storagePath = productImageStoragePath(shopId, productId);
      const uploadRes = await admin.storage.from("booking-assets").upload(storagePath, new Blob([Uint8Array.from(processed.data.buffer)], { type: processed.data.contentType }), {
        upsert: true,
        contentType: processed.data.contentType,
      });
      if (uploadRes.error) return { success: false, error: uploadRes.error.message };
      const { data: publicData } = admin.storage.from("booking-assets").getPublicUrl(storagePath);
      imageUrl = publicData.publicUrl;
      const { error: imageError } = await admin
        .from("stock")
        .update({ image_url: imageUrl })
        .eq("id", productId)
        .eq("shop_id", shopId);
      if (imageError) return { success: false, error: imageError.message };
    }

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true, data: { id: productId ?? "" } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al agregar producto" };
  }
}

export async function addProducts(
  products: Array<{
    nombre_producto: string;
    quantity: number;
    unit_cost: number;
    for_sale?: boolean;
    price?: number;
    description?: string;
    image?: File | null;
  }>,
  shopIdOverride?: string,
): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const validProducts = products.filter((p) => p.nombre_producto?.trim());
    if (validProducts.length === 0) {
      return { success: false, error: "Debe completar al menos un producto" };
    }

    for (const p of validProducts) {
      if (p.quantity < 0 || p.unit_cost < 0) {
        return { success: false, error: `"${p.nombre_producto}": los valores no pueden ser negativos` };
      }
      if (p.for_sale && (p.price === undefined || p.price === null || isNaN(p.price) || p.price < 0)) {
        return { success: false, error: `"${p.nombre_producto}": ingresá un precio de venta válido` };
      }
      if (p.for_sale && p.image && p.image.size > 0) {
        if (!p.image.type.startsWith("image/")) {
          return { success: false, error: `"${p.nombre_producto}": el archivo debe ser una imagen` };
        }
        if (p.image.size > 2 * 1024 * 1024) {
          return { success: false, error: `"${p.nombre_producto}": la imagen supera 2MB` };
        }
      }
    }

    const supabase = await createServerClient();
    const { data: inserted, error } = await supabase
      .from("stock")
      .insert(
        validProducts.map((p) => ({
          shop_id: shopId,
          nombre_producto: p.nombre_producto.trim(),
          quantity: p.quantity,
          unit_cost: p.unit_cost,
          for_sale: p.for_sale ?? false,
          price: p.for_sale ? (p.price ?? 0) : 0,
          description: p.for_sale ? (p.description?.trim() || null) : null,
        }))
      )
      .select("id, nombre_producto");

    if (error) return { success: false, error: error.message };

    const rows = inserted || [];
    const pendingImages = validProducts
      .map((p, i) => ({ product: p, row: rows[i] }))
      .filter(({ product, row }) => row && product.for_sale && product.image && product.image.size > 0);

    if (pendingImages.length > 0) {
      const admin = await createAdminClient();
      for (const { product, row } of pendingImages) {
        const processed = await processProductImage(product.image as File);
        if (!processed.ok) continue;
        const storagePath = productImageStoragePath(shopId, row.id);
        const uploadRes = await admin.storage.from("booking-assets").upload(
          storagePath,
          new Blob([Uint8Array.from(processed.data.buffer)], { type: processed.data.contentType }),
          { upsert: true, contentType: processed.data.contentType }
        );
        if (uploadRes.error) continue;
        const { data: publicData } = admin.storage.from("booking-assets").getPublicUrl(storagePath);
        await admin
          .from("stock")
          .update({ image_url: publicData.publicUrl })
          .eq("id", row.id)
          .eq("shop_id", shopId);
      }
    }

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al agregar productos" };
  }
}

export async function setShopStoreEnabled(enabled: boolean, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const roleResult = await getCurrentUserRole(shopId);
    if (!roleResult.success) return { success: false, error: roleResult.error || "SIN_ACCESO" };
    if (roleResult.data?.role === "staff") {
      return { success: false, error: "Solo el owner o admin del local puede realizar esta accion" };
    }

    const admin = await createAdminClient();
    const { data: shop } = await admin
      .from("shops")
      .select("features_override")
      .eq("id", shopId)
      .maybeSingle();

    if (!shop) return { success: false, error: "Local no encontrado" };

    const overrides = (shop.features_override ?? {}) as Record<string, boolean>;
    overrides.store = enabled;

    const { error } = await admin
      .from("shops")
      .update({ features_override: overrides as Record<string, boolean> })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar la tienda online" };
  }
}

export async function toggleForSale(id: string, enabled: boolean, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();
    const { error } = await admin
      .from("stock")
      .update({ for_sale: enabled, visible: enabled, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar modo venta" };
  }
}

export async function updateSaleDetails(id: string, formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const price = parseFloat(formData.get("price") as string);
    const description = ((formData.get("description") as string) || "").trim() || null;
    const visible = formData.get("visible") === "true";
    const imageFile = (formData.get("image") as File | null) || null;

    if (isNaN(price) || price < 0) return { success: false, error: "El precio de venta debe ser un valor positivo" };

    const admin = await createAdminClient();

    const updates: {
      for_sale: boolean;
      price: number;
      description: string | null;
      visible: boolean;
      updated_at: string;
      image_url?: string;
    } = {
      for_sale: true,
      price,
      description,
      visible,
      updated_at: new Date().toISOString(),
    };

    if (imageFile && imageFile.size > 0) {
      const processed = await processProductImage(imageFile);
      if (!processed.ok) return { success: false, error: processed.error };
      const storagePath = productImageStoragePath(shopId, id);
      const uploadRes = await admin.storage.from("booking-assets").upload(storagePath, new Blob([Uint8Array.from(processed.data.buffer)], { type: processed.data.contentType }), {
        upsert: true,
        contentType: processed.data.contentType,
      });
      if (uploadRes.error) return { success: false, error: uploadRes.error.message };
      const { data: publicData } = admin.storage.from("booking-assets").getPublicUrl(storagePath);
      updates.image_url = publicData.publicUrl;
    }

    const { error } = await admin.from("stock").update(updates).eq("id", id).eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al configurar la venta" };
  }
}

export async function updateStock(id: string, delta: number, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
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

    const newQuantity = (existing.quantity ?? 0) + delta;
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
      const shopIdResult = await requireOwnerShopId();
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
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const supabase = await createServerClient();
    const { data: existing } = await supabase
      .from("stock")
      .select("image_url")
      .eq("id", id)
      .eq("shop_id", shopId)
      .maybeSingle();

    const { error } = await supabase
      .from("stock")
      .delete()
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    if (existing?.image_url) {
      const admin = await createAdminClient();
      await admin.storage.from("booking-assets").remove([productImageStoragePath(shopId, id)]);
    }

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar producto" };
  }
}
