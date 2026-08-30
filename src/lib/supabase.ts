import { createBrowserClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan las variables de entorno de Supabase");
}

// La sesión se comparte entre cliente y servidor a través de las mismas cookies
// sb-*. Así, cuando el servidor (middleware / server components) rota el refresh
// token, el cliente sigue las mismas cookies y no queda un token huérfano en
// localStorage que provoque "Invalid Refresh Token".
function getBrowserCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined") return [];
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      return { name: part.slice(0, eq), value: part.slice(eq + 1) };
    })
    .filter((c) => c.name.startsWith("sb-"));
}

function serializeCookieOptions(options: CookieOptions): string {
  const parts: string[] = [];
  if (typeof options?.maxAge === "number") parts.push(`max-age=${options.maxAge}`);
  if (options?.domain) parts.push(`domain=${options.domain}`);
  if (options?.path) parts.push(`path=${options.path}`);
  if (options?.sameSite) parts.push(`samesite=${options.sameSite}`);
  if (options?.secure) parts.push("secure");
  if (options?.expires) {
    const expires =
      typeof options.expires === "object" ? options.expires.toUTCString() : options.expires;
    parts.push(`expires=${expires}`);
  }
  return parts.join("; ");
}

export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    // Auto-refresh desactivado a propósito. El refresh lo maneja el servidor
    // (middleware + server components): si el browser refresca solo con un
    // refresh token que el servidor ya rotó, se produce el error de consola
    // "Invalid Refresh Token: Refresh Token Not Found" y riesgos de deslogueo.
    autoRefreshToken: false,
    detectSessionInUrl: true,
  },
  cookies: {
    getAll() {
      return getBrowserCookies();
    },
    setAll(cookiesToSet) {
      if (typeof document === "undefined") return;
      cookiesToSet.forEach(({ name, value, options }) => {
        document.cookie = `${name}=${value}; ${serializeCookieOptions(options)}`;
      });
    },
  },
});
