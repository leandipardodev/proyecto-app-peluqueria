import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

/**
 * Vercel corta el middleware a los 25s y devuelve 504
 * (MIDDLEWARE_INVOCATION_TIMEOUT). Un fetch a Supabase (auth o PostgREST) sin
 * limite de tiempo deja la request colgada hasta ese corte: el usuario ve la
 * pantalla de error de Vercel en vez de la app. Con este limite la llamada
 * falla rapido, el middleware atrapa el error y deja pasar la request (el
 * guard real sigue estando en las paginas/acciones, con RLS).
 */
const SUPABASE_FETCH_TIMEOUT_MS = 4_000;

const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS);
  // `AbortSignal.any` existe en Node 20+ y en el runtime Edge actual, pero si
  // el runtime no lo tuviera preferimos quedarnos solo con el timeout antes que
  // romper el middleware.
  const signal =
    init?.signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([init.signal, timeout])
      : timeout;

  return fetch(input, { ...init, signal });
};

export function createMiddlewareClient(
  request: NextRequest,
  response: NextResponse
) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: fetchWithTimeout,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}
