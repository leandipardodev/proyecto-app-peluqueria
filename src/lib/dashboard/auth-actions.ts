"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
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

export async function login(formData: FormData) {
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
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored - se llama desde Server Action
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function registerShop(formData: FormData) {
  const shopName = formData.get("shop_name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!shopName || !email || !password) {
    return { error: "Todos los campos son obligatorios" };
  }

  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres" };
  }

  const supabaseAdmin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // No necesitamos setear cookies para admin
        },
      },
    }
  );

  const { data: shop, error: shopError } = await supabaseAdmin
    .from("shops")
    .insert({
      name: shopName,
      active: true,
      plan_expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      slug: generateShopSlug(shopName),
    })
    .select()
    .single();

  if (shopError) {
    if (shopError.code === "23505") {
      return { error: "Ya existe una peluquería con ese nombre" };
    }
    return { error: shopError.message };
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
    email,
    password,
  });

  if (authError) {
    await supabaseAdmin.from("shops").delete().eq("id", shop.id);
    return { error: authError.message };
  }

  if (authData.user) {
    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .insert({
        user_id: authData.user.id,
        shop_id: shop.id,
        name: email,
        email,
        role: "owner",
      });

    if (profileError) {
      await supabaseAdmin.from("shops").delete().eq("id", shop.id);
      try {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      } catch {}
      return { error: profileError.message };
    }
  }

  return { success: true };
}

export async function getGoogleAuthUrl() {
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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored
          }
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) return { error: error.message };
  return { url: data.url };
}
