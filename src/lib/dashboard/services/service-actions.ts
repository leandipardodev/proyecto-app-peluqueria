"use server";

import { createServiceRoleClient, requireOwnerShopId, requireShopId } from "@/lib/dashboard/auth/server";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { revalidateDashboardSegments } from "@/lib/dashboard/shared/revalidate-dashboard";
import type { ActionResult } from "@/lib/types";
import "server-only";
import { createAdminClient } from "../appointments/shared";

type ServiceRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  duration_minutes: number | null;
  pay_at_shop: boolean;
  created_at: string | null;
  updated_at: string | null;
  shop_id: string;
};

function normalizeCategoryKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toDisplayCategory(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

async function resolveCanonicalCategory(admin: Awaited<ReturnType<typeof createAdminClient>>, shopId: string, rawCategory: string): Promise<string> {
  const candidate = toDisplayCategory(rawCategory || "General") || "General";
  const candidateKey = normalizeCategoryKey(candidate);
  const { data } = await admin.from("services").select("category").eq("shop_id", shopId).limit(500);
  const existing = Array.from(new Set((data || []).map((row) => String(row.category || "General").trim()).filter(Boolean)));

  for (const current of existing) {
    if (normalizeCategoryKey(current) === candidateKey) return current;
  }

  return candidate;
}

export async function fetchServices(shopIdOverride?: string): Promise<ActionResult<ServiceRow[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();

    const { data, error } = await admin
      .from("services")
      .select("id, name, description, category, price, duration_minutes, pay_at_shop, created_at, updated_at, shop_id")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[fetchServices] Supabase error:", error);
      return { success: false, error: error.message };
    }
    return { success: true, data: data || [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener servicios" };
  }
}

function parseStaffIds(formData: FormData): string[] {
  const raw = formData.get("staff_ids") as string;
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function createService(formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const name = formData.get("name") as string;
    const rawCategory = String(formData.get("category") || "General");
    const price = parseFloat(formData.get("price") as string);
    const durationMinutes = parseInt(formData.get("duration_minutes") as string);
    const payAtShop = formData.get("pay_at_shop") === "on";

    if (!name || isNaN(price) || isNaN(durationMinutes)) {
      return { success: false, error: "Todos los campos son obligatorios" };
    }

    if (price < 0) {
      return { success: false, error: "El precio no puede ser negativo" };
    }

    const admin = await createAdminClient();

    const category = await resolveCanonicalCategory(admin, shopId, rawCategory);

    const description = String(formData.get("description") ?? "");

    const { data: newService, error } = await admin.from("services").insert({
      shop_id: shopId,
      name,
      description,
      category,
      price,
      duration_minutes: durationMinutes,
      pay_at_shop: payAtShop,
    }).select("id").single();

    if (error) {
      console.error("[createService] Supabase error:", error);
      return { success: false, error: error.message };
    }

    if (formData.has("has_staff_ids") && newService) {
      const staffIds = parseStaffIds(formData);
      if (staffIds.length > 0) {
        const { error: relError } = await admin.from("staff_services").insert(
          staffIds.map((staff_id) => ({ staff_id, service_id: newService.id }))
        );
        if (relError) console.error("[createService] staff_services error:", relError);
      }
    }

    await trackProductEvent(shopId, "first_service_published");

    await revalidateDashboardSegments(shopId, ["/services"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear servicio" };
  }
}

export async function updateService(id: string, formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const name = formData.get("name") as string;
    const rawCategory = String(formData.get("category") || "General");
    const price = parseFloat(formData.get("price") as string);
    const durationMinutes = parseInt(formData.get("duration_minutes") as string);
    const payAtShop = formData.get("pay_at_shop") === "on";

    if (!name || isNaN(price) || isNaN(durationMinutes)) {
      return { success: false, error: "Todos los campos son obligatorios" };
    }

    const admin = await createAdminClient();

    const category = await resolveCanonicalCategory(admin, shopId, rawCategory);

    const description = String(formData.get("description") ?? "");

    const { error } = await admin
      .from("services")
      .update({ name, description, category, price, duration_minutes: durationMinutes, pay_at_shop: payAtShop, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) {
      console.error("[updateService] Supabase error:", error);
      return { success: false, error: error.message };
    }

    if (formData.has("has_staff_ids")) {
      const staffIds = parseStaffIds(formData);
      await admin.from("staff_services").delete().eq("service_id", id);
      if (staffIds.length > 0) {
        const { error: relError } = await admin.from("staff_services").insert(
          staffIds.map((staff_id) => ({ staff_id, service_id: id }))
        );
        if (relError) console.error("[updateService] staff_services error:", relError);
      }
    }

    await revalidateDashboardSegments(shopId, ["/services"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar servicio" };
  }
}

export async function bulkUpdateServiceCategories(
  updates: Array<{ id: string; category: string }>,
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

    const admin = await createAdminClient();
    for (const item of updates) {
      const category = await resolveCanonicalCategory(admin, shopId, item.category);
      const { error } = await admin
        .from("services")
        .update({ category, updated_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("shop_id", shopId);

      if (error) return { success: false, error: error.message };
    }

    await revalidateDashboardSegments(shopId, ["/business", "/services"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar categorias" };
  }
}

export async function deleteService(id: string, shopIdOverride?: string): Promise<ActionResult> {
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
      .from("services")
      .delete()
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) {
      console.error("[deleteService] Supabase error:", error);
      return { success: false, error: error.message };
    }

    await revalidateDashboardSegments(shopId, ["/services"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar servicio" };
  }
}

export async function fetchServiceStaffMap(shopId: string): Promise<ActionResult<Record<string, string[]>>> {
  try {
    const admin = await createAdminClient();
    const { data: svcIds } = await admin
      .from("services")
      .select("id")
      .eq("shop_id", shopId);
    const ids = (svcIds || []).map((s) => s.id);
    if (ids.length === 0) return { success: true, data: {} };

    const { data: rows, error } = await admin
      .from("staff_services")
      .select("service_id, staff_id")
      .in("service_id", ids);

    if (error) {
      console.error("[fetchServiceStaffMap] Supabase error:", error);
      return { success: false, error: error.message };
    }

    const map: Record<string, string[]> = {};
    for (const r of rows || []) {
      if (!map[r.service_id]) map[r.service_id] = [];
      map[r.service_id].push(r.staff_id);
    }
    return { success: true, data: map };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener mapa de profesionales" };
  }
}
