/**
 * Resolucion de URLs publicas.
 *
 * Hay dos necesidades distintas y NO deben mezclarse:
 *
 * 1. `getPublicBaseUrl()` — para linkear desde el navegador. Caer a
 *    window.location.origin esta bien: es el host que el usuario esta viendo.
 *
 * 2. `resolveNotificationBaseUrl()` — para las URLs que Mercado Pago va a
 *    llamar (notification_url) y para los back_urls del comprador. Ahi el
 *    fallback NO puede ser window.location ni el header Origin de la peticion,
 *    porque los dos los controla el cliente. Tres rutas de Klip armaban la
 *    notification_url con el header Origin, y un POST con
 *    `Origin: https://evil.com` mandaba la notificacion del pago a un servidor
 *    ajeno: Klip no confirmaba el turno y el atacante recibia el payload.
 *    Mercado Pago tambien penaliza eso en el control de calidad (0/100).
 *
 * Cuando la URL publica no se puede determinar, `resolveNotificationBaseUrl`
 * falla en vez de adivinar: una notification_url equivocada es peor que no cobrar.
 */

const VERCEL_URL_KEYS = ["VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;

/**
 * URL publica de la app para uso en el cliente. Tolera el entorno de dev.
 */
export function getPublicBaseUrl(): string {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (envBase && /^https?:\/\//i.test(envBase)) return stripTrailingSlashes(envBase);
  if (typeof window !== "undefined") return stripTrailingSlashes(window.location.origin);
  return "http://localhost:3000";
}

/**
 * URL publica de la app,Resolvable solo desde variables de servidor.
 *
 * Pensada para notification_url y back_urls de Mercado Pago: no consulta ni el
 * request ni el navegador, asi que ningun cliente puede desviar los pagos.
 */
export function resolveNotificationBaseUrl(): string {
  const candidates: string[] = [process.env.NEXT_PUBLIC_SITE_URL ?? "", process.env.NEXT_PUBLIC_BASE_URL ?? ""];
  for (const key of VERCEL_URL_KEYS) {
    const value = process.env[key];
    if (value) candidates.push(value.startsWith("http") ? value : `https://${value}`);
  }

  for (const raw of candidates) {
    const value = raw.trim();
    if (!value) continue;

    const normalized = stripTrailingSlashes(value);
    const problem = validateNotificationUrl(normalized);
    if (problem) {
      // Un valor mal configurado no debe caer en silencio al siguiente
      // candidato: si SITE_URL esta corrupto es mejor fallar que notificar a
      // otro sitio.
      throw new Error(`URL publica de la aplicacion invalida: ${problem} (${normalized})`);
    }

    return normalized;
  }

  throw new Error(
    "Falta NEXT_PUBLIC_SITE_URL: no se puede determinar la URL publica para las notificaciones de Mercado Pago",
  );
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function validateNotificationUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "no es una URL absoluta";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return `protocolo no soportado (${parsed.protocol})`;
  }

  if (parsed.protocol === "http:" && process.env.NODE_ENV === "production") {
    // Mercado Pago exige https en produccion para notificar.
    return "en produccion tiene que ser https";
  }

  if (!parsed.hostname) return "sin hostname";

  return null;
}

/**
 * URL publica de la app con fallback tolerante, para linkear en el server.
 * No usar para notification_url: no valida y no falla.
 */
export function resolvePublicSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://klip.com.ar";
  return stripTrailingSlashes(raw);
}
