import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Memoizado por request con `cache()` de React: el cliente queda atado al cookie
 * store del request en curso, asi que compartirlo dentro de la misma request es
 * identico a crearlo de nuevo, pero evita reconstruir el cliente (y su estado
 * auth/postgrest) en cada llamada. En Route Handlers, donde no hay scope de
 * render, `cache()` degrada a una llamada directa: mismo comportamiento.
 */
export const createServerClient = cache(async function createServerClient() {
  const cookieStore = await cookies();
  
  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value }) => ({
            name,
            value: value ?? "",
          }));
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore errors when called from Server Components
          }
        },
      },
    }
  );
});
