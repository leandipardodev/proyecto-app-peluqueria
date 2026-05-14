export const SITE_NAME = "Klip";
export const SITE_TITLE = "Klip | Sistema de gestion para peluquerias";
export const SITE_DESCRIPTION =
  "Software para peluquerias y barberias: turnos online, clientes, inventario, finanzas, recordatorios y cobros en un solo lugar.";

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function absoluteUrl(path = "/"): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${getSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
