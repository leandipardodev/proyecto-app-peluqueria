/**
 * Decode a JWT payload without verifying the signature.
 * Used in middleware for local expiry checks — RLS still enforces authorization.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payload);
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
    const session = JSON.parse(authCookie.value);
    const accessToken: string | undefined =
      session?.access_token ?? session?.currentSession?.access_token;
    if (!accessToken) return null;

    const payload = decodeJwtPayload(accessToken);
    if (!payload || typeof payload.exp !== "number") return null;

    return { accessToken, expiresAt: payload.exp };
  } catch {
    return null;
  }
}
