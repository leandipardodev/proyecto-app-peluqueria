"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/types";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import "server-only";

function generateShopSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

function mapAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate limit") || normalized.includes("too many requests") || normalized.includes("too many")) {
    return "Superaste el límite de correos por ahora. Esperá 1 minuto y volvé a intentar.";
  }
  return message;
}

export async function login(formData: FormData): Promise<never> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    redirect("/login?error=Email+y+contraseña+son+obligatorios");
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function registerShop(
  formData: FormData
): Promise<ActionResult<{ requiresEmailConfirmation?: boolean; message?: string; redirectToDashboard?: boolean }>> {
  try {
    const shopName = formData.get("shop_name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!shopName || !email || !password) {
      return { success: false, error: "Todos los campos son obligatorios" };
    }

    if (password.length < 6) {
      return { success: false, error: "La contraseña debe tener al menos 6 caracteres" };
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
            } catch {}
          },
        },
      }
    );

    const slug = generateShopSlug(shopName);

    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      return { success: false, error: mapAuthError(signUpError.message) };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      return {
        success: true,
        data: {
          requiresEmailConfirmation: true,
          message: "Cuenta creada. Confirmá tu email para terminar de configurar tu negocio.",
        },
      };
    }

    const { error: initError } = await supabase.rpc("initialize_new_shop", {
      p_nombre: shopName,
      p_slug: slug,
    });

    if (initError) {
      const message = initError.message.toLowerCase().includes("slug") || initError.code === "23505"
        ? "El nombre del negocio genera un slug en uso. Probá con otro nombre."
        : initError.message;
      return { success: false, error: message };
    }

    await supabase.auth.refreshSession();

    return { success: true, data: { redirectToDashboard: true } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al registrar" };
  }
}

export async function getGoogleAuthUrl(): Promise<ActionResult<{ url: string }>> {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
            } catch {}
          },
        },
      }
    );

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin || "http://localhost:3000"}/auth/callback`,
      },
    });

    if (error) return { success: false, error: error.message };
    return { success: true, data: { url: data.url } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener URL de Google" };
  }
}

export async function updateShopName(formData: FormData): Promise<ActionResult> {
  try {
    const shopId = formData.get("shop_id") as string;
    const nombre = formData.get("nombre") as string;

    if (!shopId || !nombre) {
      return { success: false, error: "Faltan datos" };
    }

    const supabaseAdmin = await createServiceRoleClient();

    const { error } = await supabaseAdmin
      .from("shops")
      .update({ nombre, updated_at: new Date().toISOString() })
      .eq("id", shopId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar nombre" };
  }
}
