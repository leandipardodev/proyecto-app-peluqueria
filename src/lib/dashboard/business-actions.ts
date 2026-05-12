"use server";

import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import { revalidatePath } from "next/cache";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import type { ActionResult } from "@/lib/types";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`[withRetry] intento ${i + 1} falló, reintentando...`);
    }
  }
  throw new Error("unreachable");
}

export type BusinessData = {
  nombre: string;
  description: string | null;
  address: string | null;
  localidad: string | null;
  phone: string | null;
  instagram_url: string | null;
  mp_public_key: string;
  mp_access_token: string;
  whatsapp_template: string;
};

export async function fetchBusinessData(): Promise<ActionResult<BusinessData>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const { data, error } = await withRetry(async () => {
      const admin = await createAdminClient();
      return admin
        .from("shops")
        .select("nombre, description, address, localidad, phone, instagram_url, mp_public_key, mp_access_token, whatsapp_template")
        .eq("id", shopId)
        .single();
    });

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: {
        nombre: data.nombre,
        description: data.description || null,
        address: data.address || null,
        localidad: data.localidad || null,
        phone: data.phone || null,
        instagram_url: data.instagram_url || null,
        mp_public_key: (data.mp_public_key as string) || "",
        mp_access_token: (data.mp_access_token as string) || "",
        whatsapp_template: (data.whatsapp_template as string) || DEFAULT_WHATSAPP_TEMPLATE,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar datos del negocio" };
  }
}

export async function updateBusinessInfo(formData: FormData): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const nombre = formData.get("nombre") as string;
    const description = formData.get("description") as string || null;
    const address = formData.get("address") as string || null;
    const localidad = formData.get("localidad") as string || null;
    const phone = formData.get("phone") as string || null;
    const instagram_url = formData.get("instagram_url") as string || null;

    const { error } = await admin
      .from("shops")
      .update({ nombre, description, address, localidad, phone, instagram_url, updated_at: new Date().toISOString() })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/business");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar negocio" };
  }
}

export async function updateMercadoPagoKeysAction(publicKey: string, accessToken: string): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const { error } = await admin
      .from("shops")
      .update({ mp_public_key: publicKey, mp_access_token: accessToken })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/business");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar claves de Mercado Pago" };
  }
}

export type DayHours = {
  open: boolean;
  start: string;
  end: string;
};

export type BusinessHoursData = Record<string, DayHours>;

const DEFAULT_BUSINESS_HOURS: BusinessHoursData = {
  monday:    { open: true,  start: "09:00", end: "20:00" },
  tuesday:   { open: true,  start: "09:00", end: "20:00" },
  wednesday: { open: true,  start: "09:00", end: "20:00" },
  thursday:  { open: true,  start: "09:00", end: "20:00" },
  friday:    { open: true,  start: "09:00", end: "20:00" },
  saturday:  { open: true,  start: "09:00", end: "20:00" },
  sunday:    { open: false, start: "09:00", end: "20:00" },
};

export async function fetchBusinessHours(): Promise<ActionResult<BusinessHoursData>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const { data, error } = await withRetry(async () => {
      const admin = await createAdminClient();
      return admin
        .from("shops")
        .select("business_hours")
        .eq("id", shopId)
        .single();
    });

    if (error) return { success: false, error: error.message };

    const raw = data.business_hours as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return { success: true, data: { ...DEFAULT_BUSINESS_HOURS } };

    // Normalizar claves del JSONB a minúsculas
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v === "object") {
        normalized[k.toLowerCase()] = v;
      }
    }

    const merged: BusinessHoursData = {};
    for (const [day, def] of Object.entries(DEFAULT_BUSINESS_HOURS)) {
      const entry = normalized[day] as Record<string, unknown> | null;
      if (entry && typeof entry === "object" && typeof entry.open === "boolean") {
        merged[day] = {
          open: entry.open as boolean,
          start: typeof entry.start === "string" ? entry.start : def.start,
          end: typeof entry.end === "string" ? entry.end : def.end,
        };
      } else {
        merged[day] = { ...def };
      }
    }
    return { success: true, data: merged };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar horarios" };
  }
}

export async function updateBusinessHours(hours: BusinessHoursData): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    // Blindaje: si llegó como string (JSON.stringify), lo parseamos
    let clean: Record<string, unknown> =
      typeof hours === "string" ? JSON.parse(hours as unknown as string) : { ...hours };

    // Normalizar claves a minúsculas
    const normalized: Record<string, { open: boolean; start: string; end: string }> = {};
    for (const [k, v] of Object.entries(clean)) {
      const entry = v as Record<string, unknown>;
      if (entry && typeof entry === "object") {
        normalized[k.toLowerCase()] = {
          open: entry.open === true,
          start: typeof entry.start === "string" ? entry.start : "09:00",
          end: typeof entry.end === "string" ? entry.end : "20:00",
        };
      }
    }

    const startMinutes = (v: string) => { const [h, m] = v.split(":").map(Number); return h * 60 + m; };

    for (const day of Object.keys(normalized)) {
      const d = normalized[day];
      if (d.open && startMinutes(d.end) <= startMinutes(d.start)) {
        return { success: false, error: `La hora de cierre debe ser posterior a la apertura (${day})` };
      }
    }

    const { error } = await admin
      .from("shops")
      .update({ business_hours: normalized })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/business");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar horarios" };
  }
}

export async function updateWhatsappTemplateAction(template: string): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const { error } = await admin
      .from("shops")
      .update({ whatsapp_template: template })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/business");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar plantilla de WhatsApp" };
  }
}
