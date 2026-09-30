/**
 * Sanea un path de redireccion interno.
 *
 * `startsWith("/")` NO alcanza: `new URL("//evil.com", "https://klip.com.ar")`
 * resuelve a `https://evil.com/` porque `//` es un protocolo-relativo. Con eso,
 * un link `/login?redirect=//evil.com` llevaba al login con Google y el callback
 * terminaba en un 302 post-autenticacion hacia un dominio arbitrario.
 *
 * Reglas: una sola barra inicial, sin barras invertidas, sin caracteres de
 * control, y confirmamos con el parser de URL que el origen no cambia.
 */
export function safeInternalPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.startsWith("/\\")) return fallback;
  if (/[\x00-\x1f\x7f]/.test(value)) return fallback;

  try {
    const base = "https://internal.invalid";
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return fallback;
    // La URL normalizada debe seguir siendo relativa al host.
    if (!parsed.pathname.startsWith("/")) return fallback;
  } catch {
    return fallback;
  }

  return value;
}
