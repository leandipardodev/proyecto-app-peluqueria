export const SITE_NAME = "Klip";
export const SITE_TITLE = "Klip | Software para peluquerias y barberias";
export const SITE_DESCRIPTION =
  "Software para dueños de peluquerias y barberias: agenda de turnos, señas online, clientes, inventario y finanzas en una sola plataforma.";

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://klip.com.ar";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function absoluteUrl(path = "/"): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${getSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
