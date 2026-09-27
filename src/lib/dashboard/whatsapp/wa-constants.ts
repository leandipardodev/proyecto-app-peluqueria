export const WA_GRAPH_VERSION = "v21.0";

export const WA_MESSAGE_TYPES = ["reminder", "feedback", "birthday"] as const;
export type WaMessageType = (typeof WA_MESSAGE_TYPES)[number];

export const WA_MESSAGE_LABELS: Record<WaMessageType, string> = {
  reminder: "Recordatorio de turno",
  feedback: "Post-visita / calificacion",
  birthday: "Cumpleanos / marketing",
};

export const WA_TEMPLATES: Record<WaMessageType, { name: string; category: "UTILITY" | "MARKETING"; language: string }> = {
  reminder: { name: "klip_recordatorio_turno", category: "UTILITY", language: "es_AR" },
  feedback: { name: "klip_post_visita", category: "UTILITY", language: "es_AR" },
  birthday: { name: "klip_cumpleanos", category: "MARKETING", language: "es_AR" },
};

// Valores de referencia del 2026 (por mensaje, Modelo by Country, ARS, sin IVA).
// Meta actualiza estos precios; se muestran como estimativos en el panel de costos.
export const WA_ESTIMATED_PRICE_ARS: Record<WaMessageType, number> = {
  reminder: 37.68,
  feedback: 37.68,
  birthday: 89.56,
};

export const WA_REMINDER_HOURS_OPTIONS = [1, 2, 3, 6, 12, 24] as const;

// Cuerpos de las plantillas meta. Cada {{n}} se reemplaza con valores reales al enviar.
// El orden de los componentes del mensaje debe seguir el orden de los {{n}} aqui abajo.
export const WA_TEMPLATE_BODIES: Record<
  WaMessageType,
  { body: string; components: string[] }
> = {
  reminder: {
    body: "Hola {{1}}! Te recordamos tu turno en {{2}}.\n*Dia:* {{3}}\n*Horario:* {{4}}\n*Servicio:* {{5}}\n*Direccion:* {{6}}\n\n¡Te esperamos!",
    components: ["customer_name", "shop_name", "date", "time", "service_name", "address"],
  },
  feedback: {
    body: "Hola {{1}}! Esperamos que hayas disfrutado tu {{2}} en {{3}}.\nNos encantaria saber tu opinion para seguir mejorando.",
    components: ["customer_name", "service_name", "shop_name"],
  },
  birthday: {
    body: "¡Feliz cumpleanos {{1}}! 🎉\nEn {{2}} queremos celebrarlo con vos. Te esperamos con un regalo especial.",
    components: ["customer_name", "shop_name"],
  },
};

export function missingWhatsAppEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.META_WA_APP_ID && !process.env.NEXT_PUBLIC_META_WA_APP_ID) missing.push("META_WA_APP_ID");
  if (!process.env.META_WA_APP_SECRET) missing.push("META_WA_APP_SECRET");
  if (!process.env.META_WA_STATE_SECRET) missing.push("META_WA_STATE_SECRET");
  if (!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) missing.push("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  return missing;
}