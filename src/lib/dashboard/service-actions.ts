"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import type { ActionResult } from "@/lib/types";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
}

type ServiceRow = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  created_at: string;
  updated_at: string | null;
  shop_id: string;
};

export async function fetchServices(): Promise<ActionResult<ServiceRow[]>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const admin = await createAdminClient();

    const { data, error } = await admin
      .from("services")
      .select("*")
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

export async function createService(formData: FormData): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const name = formData.get("name") as string;
    const price = parseFloat(formData.get("price") as string);
    const durationMinutes = parseInt(formData.get("duration_minutes") as string);

    if (!name || isNaN(price) || isNaN(durationMinutes)) {
      return { success: false, error: "Todos los campos son obligatorios" };
    }

    if (price < 0) {
      return { success: false, error: "El precio no puede ser negativo" };
    }

    const admin = await createAdminClient();

    const { error } = await admin.from("services").insert({
      shop_id: shopId,
      name,
      price,
      duration_minutes: durationMinutes,
    });

    if (error) {
      console.error("[createService] Supabase error:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/dashboard/services");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear servicio" };
  }
}

export async function updateService(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const name = formData.get("name") as string;
    const price = parseFloat(formData.get("price") as string);
    const durationMinutes = parseInt(formData.get("duration_minutes") as string);

    if (!name || isNaN(price) || isNaN(durationMinutes)) {
      return { success: false, error: "Todos los campos son obligatorios" };
    }

    const admin = await createAdminClient();

    const { error } = await admin
      .from("services")
      .update({ name, price, duration_minutes: durationMinutes, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) {
      console.error("[updateService] Supabase error:", error);
      return { success: false, error: error.message };
    }

    revalidatePath("/dashboard/services");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar servicio" };
  }
}

export async function deleteService(id: string): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

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

    revalidatePath("/dashboard/services");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar servicio" };
  }
}
