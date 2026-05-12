import { DEFAULT_WHATSAPP_TEMPLATE } from "./whatsapp-constants";

export function buildWhatsAppUrl(params: {
  phone: string | null;
  customerName: string;
  serviceName?: string | null;
  date?: string;
  time?: string;
  template?: string;
  shopName?: string;
}): string | null {
  if (!params.phone) return null;
  const cleanPhone = params.phone.replace(/[^\d]/g, "").replace(/^00/, "");
  if (!cleanPhone) return null;

  const text = (params.template || DEFAULT_WHATSAPP_TEMPLATE)
    .replace(/\{Nombre\}/g, params.customerName)
    .replace(/\{Cliente\}/g, params.customerName)
    .replace(/\{Servicio\}/g, params.serviceName ?? "")
    .replace(/\{Fecha\}/g, params.date ?? "")
    .replace(/\{Hora\}/g, params.time ?? "")
    .replace(/\{Peluqueria\}/g, params.shopName ?? "");

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}
