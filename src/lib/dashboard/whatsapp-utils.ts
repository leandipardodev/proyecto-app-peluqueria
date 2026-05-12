import { DEFAULT_WHATSAPP_TEMPLATE } from "./whatsapp-constants";

export function hasRequiredWhatsAppPlaceholders(template: string): boolean {
  return /\{hora\}/i.test(template) && (/\{lugar\}/i.test(template) || /\{ubicacion\}/i.test(template));
}

export function to24hTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function buildWhatsAppUrl(params: {
  phone: string | null;
  customerName: string;
  serviceName?: string | null;
  date?: string;
  time?: string;
  template?: string;
  shopName?: string;
  place?: string | null;
}): string | null {
  if (!params.phone) return null;
  const cleanPhone = params.phone.replace(/[^\d]/g, "").replace(/^00/, "");
  if (!cleanPhone) return null;

  const template = params.template || DEFAULT_WHATSAPP_TEMPLATE;
  if (!hasRequiredWhatsAppPlaceholders(template)) return null;

  const formattedTime = params.time || "";
  const place = (params.place || params.shopName || "").trim();
  if (!formattedTime || !place) return null;

  const text = template
    .replace(/\{Nombre\}/g, params.customerName)
    .replace(/\{Cliente\}/g, params.customerName)
    .replace(/\{Servicio\}/g, params.serviceName ?? "")
    .replace(/\{Fecha\}/g, params.date ?? "")
    .replace(/\{Hora\}/g, formattedTime)
    .replace(/\{hora\}/g, formattedTime)
    .replace(/\{Lugar\}/g, place)
    .replace(/\{lugar\}/g, place)
    .replace(/\{Ubicacion\}/g, place)
    .replace(/\{ubicacion\}/g, place)
    .replace(/\{Peluqueria\}/g, params.shopName ?? "");

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}
