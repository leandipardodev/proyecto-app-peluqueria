/**
 * Decode a JWT payload without verifying the signature.
 * Used in middleware for local expiry checks — RLS still enforces authorization.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = base64UrlDecode(parts[1]);
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Base64url decode (works in browser and Node runtimes).
 */
export function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

/**
 * Parse a @supabase/ssr auth cookie value into its session object.
 * Cookies are stored with a "base64-" prefix and base64url encoding.
 */
export function parseAuthCookieValue(value: string): Record<string, unknown> | null {
  try {
    const raw = value.startsWith("base64-") ? base64UrlDecode(value.slice("base64-".length)) : value;
    const session: unknown = JSON.parse(raw);
    return session && typeof session === "object" ? (session as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Extract the Supabase access token and its expiry from request cookies.
 * Handles the standard @supabase/ssr cookie format.
 */
export function extractAccessToken(
  cookies: { name: string; value: string }[]
): { accessToken: string; expiresAt: number } | null {
  const authCookie = cookies.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token") && !c.name.includes(".")
  );
  if (!authCookie) return null;

  try {
    const session = parseAuthCookieValue(authCookie.value);
    if (!session) return null;

    const accessToken: string | undefined =
      (session?.access_token as string | undefined) ??
      ((session?.currentSession as Record<string, unknown> | undefined)?.access_token as string | undefined);
    if (!accessToken) return null;

    const payload = decodeJwtPayload(accessToken);
    if (!payload || typeof payload.exp !== "number") return null;

    return { accessToken, expiresAt: payload.exp };
  } catch {
    return null;
  }
}
