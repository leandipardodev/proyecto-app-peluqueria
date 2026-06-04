"use server";

import { createServiceRoleClient, requireOwnerShopId, requireShopId } from "@/lib/dashboard/auth-server";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/dashboard/whatsapp-constants";
import type { ActionResult } from "@/lib/types";
import { revalidateDashboardSegments } from "@/lib/dashboard/revalidate-dashboard";
import { withRetry } from "@/lib/retry";
import crypto from "crypto";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
}

export type BusinessData = {
  id: string;
  nombre: string;
  description: string | null;
  address: string | null;
  localidad: string | null;
  phone: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  mp_public_key: string;
  mp_access_token: string;
  whatsapp_template: string;
  loyalty_enabled: boolean;
  loyalty_cuts_required: number;
  loyalty_discount_percent: number;
  booking_deposit_enabled: boolean;
  booking_deposit_amount: number;
  pay_at_shop: boolean;
  mp_oauth_connected: boolean;
};

export async function fetchBusinessData(shopIdOverride?: string): Promise<ActionResult<BusinessData>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const { data, error } = await withRetry(async () => {
      const admin = await createAdminClient();
      return admin
        .from("shops")
        .select("id, nombre, description, address, localidad, phone, instagram_url, facebook_url, tiktok_url, mp_public_key, mp_access_token, whatsapp_template, loyalty_enabled, loyalty_cuts_required, loyalty_discount_percent, booking_deposit_enabled, booking_deposit_amount, pay_at_shop")
        .eq("id", shopId)
        .single();
    });

    if (error) return { success: false, error: error.message };

    return {
      success: true,
        data: {
        id: data.id,
        nombre: data.nombre,
        description: data.description || null,
        address: data.address || null,
        localidad: data.localidad || null,
        phone: data.phone || null,
        instagram_url: data.instagram_url || null,
        facebook_url: (data as { facebook_url?: string | null }).facebook_url || null,
        tiktok_url: (data as { tiktok_url?: string | null }).tiktok_url || null,
        mp_public_key: (data.mp_public_key as string) || "",
        mp_access_token: (data.mp_access_token as string) || "",
        whatsapp_template: (data.whatsapp_template as string) || DEFAULT_WHATSAPP_TEMPLATE,
        loyalty_enabled: data.loyalty_enabled !== false,
        loyalty_cuts_required: Number(data.loyalty_cuts_required || 10),
        loyalty_discount_percent: Number(data.loyalty_discount_percent || 10),
        booking_deposit_enabled: data.booking_deposit_enabled !== false,
        booking_deposit_amount: Number(data.booking_deposit_amount || 0),
        pay_at_shop: data.pay_at_shop === true,
        mp_oauth_connected: Boolean(data.mp_access_token),
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
    const facebook_url = formData.get("facebook_url") as string || null;
    const tiktok_url = formData.get("tiktok_url") as string || null;

    const { error } = await admin
      .from("shops")
      .update({ nombre, description, address, localidad, phone, instagram_url, facebook_url, tiktok_url, updated_at: new Date().toISOString() })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/business"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar negocio" };
  }
}

export async function updateMercadoPagoKeysAction(publicKey: string, accessToken: string): Promise<ActionResult> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const { error } = await admin
      .from("shops")
      .update({ mp_public_key: publicKey, mp_access_token: accessToken })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/business"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar claves de Mercado Pago" };
  }
}

export async function getMercadoPagoOauthUrlAction(): Promise<ActionResult<{ url: string }>> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return { success: false, error: shopIdResult.error };
    const shopId = shopIdResult.data;

    const clientId = process.env.MP_OAUTH_CLIENT_ID || process.env.NEXT_PUBLIC_MP_OAUTH_CLIENT_ID;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://klip.com.ar";
    const redirectUri = `${siteUrl.replace(/\/$/, "")}/api/payments/mercadopago-oauth/callback`;

    if (!clientId) return { success: false, error: "Falta MP_OAUTH_CLIENT_ID" };

    const stateSecret = process.env.MP_OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!stateSecret) return { success: false, error: "Falta MP_OAUTH_STATE_SECRET" };

    const payload = Buffer.from(JSON.stringify({ shopId, ts: Date.now() })).toString("base64url");
    const sig = crypto.createHmac("sha256", stateSecret).update(payload).digest("base64url");
    const statePayload = `${payload}.${sig}`;
    const authUrl = new URL("https://auth.mercadopago.com/authorization");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("platform_id", "mp");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", statePayload);

    return { success: true, data: { url: authUrl.toString() } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al generar URL de conexion" };
  }
}

export async function disconnectMercadoPagoOauthAction(): Promise<ActionResult> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return { success: false, error: shopIdResult.error };
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const { error } = await admin
      .from("shops")
      .update({ mp_access_token: "", mp_public_key: "", updated_at: new Date().toISOString() })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/business"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al desconectar Mercado Pago" };
  }
}

export type DayHours = {
  open: boolean;
  start: string;
  end: string;
  break_start?: string | null;
  break_end?: string | null;
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

export async function fetchBusinessHours(shopIdOverride?: string): Promise<ActionResult<BusinessHoursData>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

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
          break_start: typeof entry.break_start === "string" ? entry.break_start : null,
          break_end: typeof entry.break_end === "string" ? entry.break_end : null,
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
    const clean: Record<string, unknown> =
      typeof hours === "string" ? JSON.parse(hours as unknown as string) : { ...hours };

    // Normalizar claves a minúsculas
    const normalized: Record<string, { open: boolean; start: string; end: string; break_start?: string | null; break_end?: string | null }> = {};
    for (const [k, v] of Object.entries(clean)) {
      const entry = v as Record<string, unknown>;
      if (entry && typeof entry === "object") {
        normalized[k.toLowerCase()] = {
          open: entry.open === true,
          start: typeof entry.start === "string" ? entry.start : "09:00",
          end: typeof entry.end === "string" ? entry.end : "20:00",
          break_start: typeof entry.break_start === "string" ? entry.break_start : null,
          break_end: typeof entry.break_end === "string" ? entry.break_end : null,
        };
      }
    }

    const startMinutes = (v: string) => { const [h, m] = v.split(":").map(Number); return h * 60 + m; };

    for (const day of Object.keys(normalized)) {
      const d = normalized[day];
      if (d.open && startMinutes(d.end) <= startMinutes(d.start)) {
        return { success: false, error: `La hora de cierre debe ser posterior a la apertura (${day})` };
      }
      const hasBreakStart = Boolean(d.break_start);
      const hasBreakEnd = Boolean(d.break_end);
      if (hasBreakStart !== hasBreakEnd) {
        return { success: false, error: `Debes completar inicio y fin del corte horario (${day})` };
      }
      if (d.open && d.break_start && d.break_end) {
        const bs = startMinutes(d.break_start);
        const be = startMinutes(d.break_end);
        const st = startMinutes(d.start);
        const en = startMinutes(d.end);
        if (!(st < bs && bs < be && be < en)) {
          return { success: false, error: `El corte horario debe quedar entre apertura y cierre (${day})` };
        }
      }
    }

    const { error } = await admin
      .from("shops")
      .update({ business_hours: normalized })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/business"]);
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

    const { data: shopData, error: shopError } = await admin
      .from("shops")
      .select("address, nombre")
      .eq("id", shopId)
      .single();

    if (shopError) return { success: false, error: shopError.message };

    const place = String(shopData?.address || shopData?.nombre || "").trim();
    if (!place) {
      return { success: false, error: "La ubicación es indispensable para el cliente" };
    }

    const hasHour = template.includes("{Hora}");
    const hasLocation = template.includes("{ubicacion}") || template.includes("{Lugar}");
    if (!hasHour || !hasLocation) {
      return { success: false, error: "La plantilla debe incluir {Hora} y {ubicacion} (o {Lugar})." };
    }

    const { error } = await admin
      .from("shops")
      .update({ whatsapp_template: template })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/business"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar plantilla de WhatsApp" };
  }
}

export async function updateLoyaltyProgramAction(enabled: boolean, cutsRequired: number, discountPercent: number): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const safeCutsRequired = Math.max(1, Math.floor(Number(cutsRequired) || 1));
    const safeDiscountPercent = Math.max(0, Math.min(100, Math.floor(Number(discountPercent) || 0)));

    const { error } = await admin
      .from("shops")
      .update({
        loyalty_enabled: Boolean(enabled),
        loyalty_cuts_required: safeCutsRequired,
        loyalty_discount_percent: safeDiscountPercent,
      })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/business", "/customers"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar fidelizacion" };
  }
}

export type LoyaltyRaffleWinner = {
  id: string;
  nombre: string;
};

export type LoyaltyRaffleResult = {
  prizeName: string;
  participants: number;
  winner: LoyaltyRaffleWinner;
  candidateNames: string[];
};

export async function runLoyaltyRaffleAction(prizeName: string, winnersCount: number): Promise<ActionResult<LoyaltyRaffleResult>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const safePrizeName = (prizeName || "Sorteo de fidelizacion").trim().slice(0, 80);
    const safeWinnersCount = Math.max(1, Math.min(20, Math.floor(Number(winnersCount) || 1)));

    const { data, error } = await admin
      .from("customers")
      .select("id, nombre")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };

    const participants = (data ?? [])
      .map((row) => ({ id: String(row.id), nombre: String(row.nombre || "").trim() }))
      .filter((row) => row.id && row.nombre.length > 0);

    if (participants.length === 0) {
      return { success: false, error: "No hay clientes disponibles para sortear." };
    }

    const pool = [...participants];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    const winners = pool.slice(0, Math.min(safeWinnersCount, pool.length));
    const winner = winners[0];
    if (!winner) {
      return { success: false, error: "No se pudo definir un ganador." };
    }

    return {
      success: true,
      data: {
        prizeName: safePrizeName,
        participants: participants.length,
        winner,
        candidateNames: participants.map((p) => p.nombre),
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al ejecutar el sorteo" };
  }
}

export async function updateBookingDepositPolicyAction(enabled: boolean, depositAmount: number, forcePayAtShop?: boolean): Promise<ActionResult> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return { success: false, error: shopIdResult.error };
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const safeAmount = Math.max(0, Number(depositAmount || 0));

    const updateData: Record<string, unknown> = {
      booking_deposit_enabled: Boolean(enabled),
      booking_deposit_amount: safeAmount,
    };
    if (forcePayAtShop !== undefined) {
      updateData.pay_at_shop = Boolean(forcePayAtShop);
    }

    const { error } = await admin
      .from("shops")
      .update(updateData)
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/business", "/book"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar politica de cobro" };
  }
}
