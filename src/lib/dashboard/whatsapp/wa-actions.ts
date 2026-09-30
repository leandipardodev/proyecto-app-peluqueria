"use server";

import "server-only";
import { requireOwnerShopId, requireShopId, createServiceRoleClient, resolveAuthorizedShopId } from "@/lib/dashboard/auth/server";
import crypto from "crypto";
import type { ActionResult } from "@/lib/types";
import { revalidateDashboardSegments } from "@/lib/dashboard/shared/revalidate-dashboard";
import { getWhatsAppToken, deleteWhatsAppToken } from "./wa-vault";
import { createWhatsAppTemplate, listWhatsAppTemplates } from "./wa-graph";
import { deliverWaTemplateMessage, normalizePhoneToE164 } from "./wa-send";
import {
  WA_MESSAGE_TYPES,
  WA_TEMPLATES,
  WA_TEMPLATE_BODIES,
  WA_ESTIMATED_PRICE_ARS,
  missingWhatsAppEnvVars,
  type WaMessageType,
} from "./wa-constants";

function stateSecret(): string {
  return (
    process.env.META_WA_STATE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

export type WhatsAppAutomationOverview = {
  connected: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  connectedAt: string | null;
  remindEnabled: boolean;
  feedbackEnabled: boolean;
  birthdayEnabled: boolean;
  remindHoursBefore: number;
  envKnownMissing: string[];
  messages: { type: WaMessageType; count: number; estimatedArs: number }[];
  templateStatus: Partial<Record<WaMessageType, "approved" | "pending" | "rejected" | "missing">>;
};

export async function getWhatsAppAutomationOverview(): Promise<ActionResult<WhatsAppAutomationOverview>> {
  const shopIdResult = await requireShopId();
  if (!shopIdResult.success) return shopIdResult;
  if (!shopIdResult.data) return { success: false, error: "LOCAL_INVALIDO" };
  return buildWhatsAppAutomationOverview(shopIdResult.data);
}

export async function getWhatsAppAutomationOverviewForShop(shopId: string): Promise<ActionResult<WhatsAppAutomationOverview>> {
  if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
  // Verifica membresia: sin esto, este action (expuesto por "use server")
  // devolvia los ids de WhatsApp de cualquier local a cualquiera.
  const access = await resolveAuthorizedShopId(shopId, "member");
  if (!access.success) return { success: false, error: access.error };
  return buildWhatsAppAutomationOverview(access.data);
}

async function buildWhatsAppAutomationOverview(shopId: string): Promise<ActionResult<WhatsAppAutomationOverview>> {
  try {
    const admin = await createServiceRoleClient();
    const { data: shop, error: shopError } = await admin
      .from("shops")
      .select("wa_waba_id, wa_phone_number_id, wa_connected_at, wa_remind_enabled, wa_feedback_enabled, wa_birthday_enabled, wa_remind_hours_before")
      .eq("id", shopId)
      .maybeSingle();
    if (shopError) return { success: false, error: shopError.message };
    if (!shop) return { success: false, error: "Local no encontrado" };

    const connected = Boolean(shop.wa_phone_number_id && shop.wa_waba_id);
    const token = connected ? await getWhatsAppToken(shopId) : null;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: messageRows } = await admin
      .from("whatsapp_messages")
      .select("message_type, status")
      .eq("shop_id", shopId)
      .gte("created_at", thirtyDaysAgo);

    const messages = WA_MESSAGE_TYPES.map((type) => {
      const matching = (messageRows || []).filter(
        (m) => m.message_type === type && m.status !== "failed" && m.status !== "rejected"
      );
      return {
        type,
        count: matching.length,
        estimatedArs:
          Math.round(matching.length * WA_ESTIMATED_PRICE_ARS[type] * 100) / 100,
      };
    });

    const templateStatus: WhatsAppAutomationOverview["templateStatus"] = {};
    if (connected && token && shop.wa_waba_id) {
      const existing = await listWhatsAppTemplates(shop.wa_waba_id, token).catch(() => []);
      const byName = new Map(existing.map((t) => [t.name, t.status] as const));
      for (const type of WA_MESSAGE_TYPES) {
        const status = byName.get(WA_TEMPLATES[type].name)?.toLowerCase();
        templateStatus[type] =
          status === "approved" ? "approved" : status === "pending" || status === "in_appeal" ? "pending" : status === "rejected" ? "rejected" : "missing";
      }
    }

    return {
      success: true,
      data: {
        connected,
        wabaId: shop?.wa_waba_id || null,
        phoneNumberId: shop?.wa_phone_number_id || null,
        connectedAt: shop?.wa_connected_at || null,
        remindEnabled: shop?.wa_remind_enabled === true,
        feedbackEnabled: shop?.wa_feedback_enabled === true,
        birthdayEnabled: shop?.wa_birthday_enabled === true,
        remindHoursBefore: Number(shop?.wa_remind_hours_before || 3),
        envKnownMissing: missingWhatsAppEnvVars(),
        messages,
        templateStatus,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al leer el estado de WhatsApp" };
  }
}

// Firma el state (shopId + ts) que el SDK de Meta devuelve al terminar el Embedded Signup.
export async function getEmbeddedSignupConfig(): Promise<ActionResult<{ appId: string; state: string }>> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const appId = process.env.NEXT_PUBLIC_META_WA_APP_ID || process.env.META_WA_APP_ID;
    const secret = stateSecret();
    if (!appId) return { success: false, error: "Configura NEXT_PUBLIC_META_WA_APP_ID en el panel de Klip (admin)." };
    if (!secret) return { success: false, error: "Configura META_WA_STATE_SECRET." };

    const payload = Buffer.from(JSON.stringify({ shopId, ts: Date.now() })).toString("base64url");
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    return { success: true, data: { appId, state: `${payload}.${sig}` } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al preparar la conexion de WhatsApp" };
  }
}

// Crea las plantillas oficiales (recordatorio/post-visita/cumpleanos) en la WABA del local.
// Cada local edita estas plantillas luego en el Admin de WhatsApp de Meta si quiere cambiarlas.
export async function prepareWhatsAppTemplatesAction(): Promise<ActionResult<Record<WaMessageType, string>>> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const admin = await createServiceRoleClient();
    const { data: shop } = await admin
      .from("shops")
      .select("wa_waba_id")
      .eq("id", shopId)
      .maybeSingle();
    if (!shop?.wa_waba_id) return { success: false, error: "Primero conecta tu numero de WhatsApp" };

    const token = await getWhatsAppToken(shopId);
    if (!token) return { success: false, error: "No se encontro el token de WhatsApp. Reconecta el numero." };

    const existing = await listWhatsAppTemplates(shop.wa_waba_id, token).catch(() => []);
    const existingNames = new Set(existing.map((t) => t.name));

    const result: Record<WaMessageType, string> = {
      reminder: "",
      feedback: "",
      birthday: "",
    };

    for (const type of WA_MESSAGE_TYPES) {
      const template = WA_TEMPLATES[type];
      const body = WA_TEMPLATE_BODIES[type];
      if (existingNames.has(template.name)) {
        result[type] = "existente";
        continue;
      }
      try {
        await createWhatsAppTemplate(shop.wa_waba_id, token, {
          name: template.name,
          category: template.category,
          language: template.language,
          components: [{ type: "body", text: body.body }],
        });
        result[type] = "creada";
      } catch (e) {
        result[type] = e instanceof Error ? e.message.slice(0, 200) : "error";
      }
    }

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al preparar plantillas" };
  }
}

export type WhatsAppSettingsInput = {
  remindEnabled: boolean;
  feedbackEnabled: boolean;
  birthdayEnabled: boolean;
  remindHoursBefore: number;
};

export async function updateWhatsAppAutomationSettingsAction(settings: WhatsAppSettingsInput): Promise<ActionResult> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const safeHours = Math.max(1, Math.min(48, Math.floor(Number(settings.remindHoursBefore) || 3)));

    const admin = await createServiceRoleClient();
    const { error } = await admin
      .from("shops")
      .update({
        wa_remind_enabled: settings.remindEnabled === true,
        wa_feedback_enabled: settings.feedbackEnabled === true,
        wa_birthday_enabled: settings.birthdayEnabled === true,
        wa_remind_hours_before: safeHours,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/business"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar la configuracion" };
  }
}

export async function disconnectWhatsAppAction(): Promise<ActionResult> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const admin = await createServiceRoleClient();
    const { error } = await admin
      .from("shops")
      .update({
        wa_waba_id: null,
        wa_phone_number_id: null,
        wa_connected_at: null,
        wa_remind_enabled: false,
        wa_feedback_enabled: false,
        wa_birthday_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shopId);
    if (error) return { success: false, error: error.message };

    await deleteWhatsAppToken(shopId);
    await revalidateDashboardSegments(shopId, ["/business"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al desconectar WhatsApp" };
  }
}

// Envia el recordatorio de prueba al telefono del local para validar la conexion y la plantilla.
export async function sendWhatsAppTestReminderAction(): Promise<ActionResult> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };

    const admin = await createServiceRoleClient();
    const { data: shop, error } = await admin
      .from("shops")
      .select("wa_waba_id, wa_phone_number_id, nombre, address, phone")
      .eq("id", shopId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    if (!shop?.wa_phone_number_id || !shop.wa_waba_id) {
      return { success: false, error: "Primero conecta tu numero de WhatsApp" };
    }

    const token = await getWhatsAppToken(shopId);
    if (!token) return { success: false, error: "No se encontro el token. Reconecta el numero." };

    const to = normalizePhoneToE164(shop.phone);
    if (!to) {
      return { success: false, error: "Configura el telefono del local (Mi Negocio) para recibir el mensaje de prueba" };
    }

    const result = await deliverWaTemplateMessage({
      ctx: {
        shopId,
        wabaId: shop.wa_waba_id,
        phoneNumberId: shop.wa_phone_number_id,
        token,
        shopName: shop.nombre,
        shopAddress: shop.address || null,
      },
      customerId: null,
      messageType: "reminder",
      to,
      bodyParameters: ["Prueba", shop.nombre, "hoy", "14:30", "turno de prueba", shop.address || ""],
    });

    if (!result.ok) {
      return {
        success: false,
        error:
          result.error?.includes("pending") || result.error?.toLowerCase().includes("405")
            ? "La plantilla aun esta en revision de Meta. Volve a intentar cuando este aprobada."
            : result.error || "No se pudo enviar el mensaje de prueba",
      };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo enviar el mensaje de prueba" };
  }
}