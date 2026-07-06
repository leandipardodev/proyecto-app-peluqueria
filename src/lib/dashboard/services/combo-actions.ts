"use server";

import { createServiceRoleClient, requireOwnerShopId, requireShopId } from "@/lib/dashboard/auth/server";
import { revalidateDashboardSegments } from "@/lib/dashboard/shared/revalidate-dashboard";
import type { ActionResult } from "@/lib/types";
import "server-only";
import { createAdminClient } from "../appointments/shared";

type ComboService = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
};

type ComboRow = {
  id: string;
  shop_id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
  services: ComboService[];
  total_duration: number;
};

export async function fetchCombos(shopIdOverride?: string): Promise<ActionResult<ComboRow[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();

    const { data: combos, error } = await admin
      .from("combos")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const comboIds = combos.map((c) => c.id);
    const serviceMap = new Map<string, ComboService[]>();

    if (comboIds.length > 0) {
      const { data: links } = await admin
        .from("combo_services")
        .select("combo_id, service_id")
        .in("combo_id", comboIds);

      const allServiceIds = [...new Set((links || []).map((l) => l.service_id))];

      if (allServiceIds.length > 0) {
        const { data: servicesData } = await admin
          .from("services")
          .select("id, name, duration_minutes, price")
          .in("id", allServiceIds);

        const svcById = new Map((servicesData || []).map((s) => [s.id, s as ComboService]));

        for (const link of links || []) {
          const existing = serviceMap.get(link.combo_id) || [];
          const svc = svcById.get(link.service_id);
          if (svc) existing.push(svc);
          serviceMap.set(link.combo_id, existing);
        }
      }
    }

    const result: ComboRow[] = combos.map((combo) => {
      const services = serviceMap.get(combo.id) || [];
      const total_duration = services.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
      return {
        id: combo.id,
        shop_id: combo.shop_id,
        name: combo.name,
        description: combo.description,
        price: Number(combo.price) || 0,
        duration_minutes: combo.duration_minutes ?? null,
        active: combo.active,
        created_at: combo.created_at,
        updated_at: combo.updated_at,
        services,
        total_duration,
      };
    });

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener combos" };
  }
}

export async function createCombo(
  formData: FormData,
  shopIdOverride?: string
): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const price = parseFloat(formData.get("price") as string);
    const durationRaw = formData.get("duration_minutes") as string;
    const duration_minutes = durationRaw ? parseInt(durationRaw, 10) : null;
    const serviceIdsRaw = formData.get("service_ids") as string;
    const serviceIds = serviceIdsRaw
      ? serviceIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    if (!name || isNaN(price) || serviceIds.length === 0) {
      return { success: false, error: "Nombre, precio y al menos un servicio son obligatorios" };
    }

    if (price < 0) {
      return { success: false, error: "El precio no puede ser negativo" };
    }

    const admin = await createAdminClient();

    const { data: combo, error: comboError } = await admin
      .from("combos")
      .insert({ shop_id: shopId, name, description: description || null, price, duration_minutes: duration_minutes || null })
      .select("id")
      .single();

    if (comboError) return { success: false, error: comboError.message };

    const links = serviceIds.map((sid) => ({ combo_id: combo.id, service_id: sid }));
    const { error: linkError } = await admin.from("combo_services").insert(links);
    if (linkError) return { success: false, error: linkError.message };

    await revalidateDashboardSegments(shopId, ["/services"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear combo" };
  }
}

export async function updateCombo(
  id: string,
  formData: FormData,
  shopIdOverride?: string
): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const price = parseFloat(formData.get("price") as string);
    const durationRaw = formData.get("duration_minutes") as string;
    const duration_minutes = durationRaw ? parseInt(durationRaw, 10) : null;
    const serviceIdsRaw = formData.get("service_ids") as string;
    const serviceIds = serviceIdsRaw
      ? serviceIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    if (!name || isNaN(price) || serviceIds.length === 0) {
      return { success: false, error: "Nombre, precio y al menos un servicio son obligatorios" };
    }

    const admin = await createAdminClient();

    const { error: updateError } = await admin
      .from("combos")
      .update({
        name,
        description: description || null,
        price,
        duration_minutes: duration_minutes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("shop_id", shopId);

    if (updateError) return { success: false, error: updateError.message };

    await admin.from("combo_services").delete().eq("combo_id", id);

    if (serviceIds.length > 0) {
      const links = serviceIds.map((sid) => ({ combo_id: id, service_id: sid }));
      const { error: linkError } = await admin.from("combo_services").insert(links);
      if (linkError) return { success: false, error: linkError.message };
    }

    await revalidateDashboardSegments(shopId, ["/services"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar combo" };
  }
}

export async function deleteCombo(id: string, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();
    const { error } = await admin.from("combos").delete().eq("id", id).eq("shop_id", shopId);
    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/services"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar combo" };
  }
}

export async function toggleComboActive(id: string, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();

    const { data: combo } = await admin
      .from("combos")
      .select("active")
      .eq("id", id)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (!combo) return { success: false, error: "Combo no encontrado" };

    const { error } = await admin
      .from("combos")
      .update({ active: !combo.active, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/services"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cambiar estado del combo" };
  }
}
