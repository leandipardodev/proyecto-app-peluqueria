import "server-only";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { sendWhatsAppTemplate, WhatsAppGraphError } from "./wa-graph";
import { getWhatsAppToken } from "./wa-vault";
import { WA_TEMPLATES, type WaMessageType } from "./wa-constants";

export function normalizePhoneToE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d]/g, "").replace(/^00/, "");
  if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length < 10) return null;
  return `54${digits}`;
}

export type WaDeliveryContext = {
  shopId: string;
  wabaId: string;
  phoneNumberId: string;
  token: string;
  shopName: string;
  shopAddress: string | null;
};

export async function loadWaDeliveryContext(shopId: string): Promise<WaDeliveryContext | null> {
  const admin = await createServiceRoleClient();
  const { data: shop } = await admin
    .from("shops")
    .select("id, wa_waba_id, wa_phone_number_id, nombre, address")
    .eq("id", shopId)
    .maybeSingle();

  if (!shop || !shop.wa_phone_number_id || !shop.wa_waba_id) return null;

  const token = await getWhatsAppToken(shopId);
  if (!token) return null;

  return {
    shopId: shop.id,
    wabaId: shop.wa_waba_id,
    phoneNumberId: shop.wa_phone_number_id,
    token,
    shopName: shop.nombre,
    shopAddress: shop.address || null,
  };
}

export async function deliverWaTemplateMessage(params: {
  ctx: WaDeliveryContext;
  customerId: string | null;
  appointmentId?: string | null;
  messageType: WaMessageType;
  to: string;
  bodyParameters: string[];
}): Promise<{ ok: boolean; error?: string; metaMessageId?: string }> {
  const { ctx, customerId, messageType, to, bodyParameters } = params;
  const template = WA_TEMPLATES[messageType];

  try {
    const result = await sendWhatsAppTemplate({
      phoneNumberId: ctx.phoneNumberId,
      token: ctx.token,
      to,
      templateName: template.name,
      language: template.language,
      bodyParameters,
    });
    const metaMessageId = result.messages?.[0]?.id || null;

    await recordWaMessage({
      shopId: ctx.shopId,
      customerId,
      appointmentId: params.appointmentId ?? null,
      messageType,
      templateName: template.name,
      category: template.category,
      to,
      status: "sent",
      metaMessageId,
    });

    return { ok: true, metaMessageId: metaMessageId || undefined };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Error al enviar mensaje de WhatsApp";
    const isRejected =
      e instanceof WhatsAppGraphError &&
      (e.code === 132000 || e.code === 132012 || e.code === 131030 || (e.fbMessage || "").includes("pending"));

    const status = isRejected ? "rejected" : "failed";
    const errorDetail = e instanceof WhatsAppGraphError ? (e.fbMessage || e.message) : error;

    await recordWaMessage({
      shopId: ctx.shopId,
      customerId,
      appointmentId: params.appointmentId ?? null,
      messageType,
      templateName: template.name,
      category: template.category,
      to,
      status,
      error: errorDetail.slice(0, 500),
    });

    return { ok: false, error: errorDetail };
  }
}

export async function recordWaMessage(input: {
  shopId: string;
  customerId: string | null;
  appointmentId?: string | null;
  messageType: WaMessageType;
  templateName: string;
  category: string;
  to: string;
  status: string;
  metaMessageId?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    const admin = await createServiceRoleClient();
    await admin.from("whatsapp_messages").insert({
      shop_id: input.shopId,
      customer_id: input.customerId,
      appointment_id: input.appointmentId ?? null,
      message_type: input.messageType,
      template_name: input.templateName,
      category: input.category,
      to_phone: input.to,
      status: input.status,
      meta_message_id: input.metaMessageId || null,
      error: input.error || null,
    });
  } catch {
    // el registro de auditoria no debe romper el envio
  }
}