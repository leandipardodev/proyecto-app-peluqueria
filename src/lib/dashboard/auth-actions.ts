"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/types";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { sendEmailWithResend } from "@/lib/email/resend";
import { resolveIndustry } from "@/lib/industry/resolve";
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

async function resolveUniqueShopSlug(baseSlug: string): Promise<string> {
  const admin = await createServiceRoleClient();
  const normalized = baseSlug || "local";
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? normalized : `${normalized}-${Math.floor(Math.random() * 9000) + 1000}`;
    const { data } = await admin.from("shops").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${normalized}-${Date.now().toString().slice(-6)}`;
}

function mapAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate limit") || normalized.includes("too many requests") || normalized.includes("too many")) {
    return "Superaste el límite de correos por ahora. Esperá 1 minuto y volvé a intentar.";
  }
  return message;
}

function resolvePublicSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://klip.com.ar";
  return raw.replace(/\/$/, "");
}

const TRIAL_DAYS = 15;

function getTrialExpiryIso(): string {
  return new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function sendAdminConfirmationEmail(email: string): Promise<void> {
  const baseUrl = resolvePublicSiteUrl();
  await sendEmailWithResend({
    to: email,
    subject: "Confirma tu acceso a Klip",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
        <h1 style="font-size:22px;margin:0 0 12px;">Bienvenido a Klip</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">
          Tu cuenta fue creada correctamente. Si ya confirmaste tu email en Supabase, podés iniciar sesión.
        </p>
        <p style="margin:22px 0;">
          <a href="${baseUrl}/login" style="background:#111827;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block;">Ir a iniciar sesión</a>
        </p>
        <p style="font-size:12px;color:#6b7280;margin-top:18px;">Enviado por Klip desde send.klip.com.ar</p>
      </div>
    `,
  });
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
    const industry = resolveIndustry(formData.get("industry") as string | null);
    const termsAccepted = formData.get("terms_accepted");

    if (!shopName || !email || !password) {
      return { success: false, error: "Todos los campos son obligatorios" };
    }

    const accepted = termsAccepted === "on" || termsAccepted === "true" || termsAccepted === "1";
    if (!accepted) {
      return { success: false, error: "Debes aceptar los Terminos y Condiciones para crear la cuenta" };
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

    const slug = await resolveUniqueShopSlug(generateShopSlug(shopName));
    const normalizedEmail = email.trim().toLowerCase();

    const baseUrl = resolvePublicSiteUrl();
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: `${baseUrl}/auth/callback?next=/dashboard`,
      },
    });
    if (signUpError) {
      return { success: false, error: mapAuthError(signUpError.message) };
    }

    if (!signUpData.user) {
      return { success: false, error: "No se pudo crear el usuario" };
    }

    const admin = await createServiceRoleClient();
    const trialEnd = getTrialExpiryIso();

    const { data: createdShop, error: shopError } = await admin
      .from("shops")
      .insert({
        nombre: shopName,
        slug,
        industry,
        active: true,
        plan_expiry: trialEnd,
      })
      .select("id")
      .single();

    if (shopError || !createdShop?.id) {
      return { success: false, error: shopError?.message || "No se pudo crear el local" };
    }

    const { error: profileError } = await admin.from("user_profiles").upsert({
      user_id: signUpData.user.id,
      shop_id: createdShop.id,
      name: signUpData.user.user_metadata?.full_name || normalizedEmail,
      email: normalizedEmail,
      role: "owner",
      is_active: true,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      try { await admin.from("shops").delete().eq("id", createdShop.id); } catch {}
      return { success: false, error: profileError.message };
    }

    const { error: membershipError } = await admin.from("shop_memberships").upsert(
      {
        user_id: signUpData.user.id,
        shop_id: createdShop.id,
        role: "owner",
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,shop_id" }
    );

    if (membershipError) {
      try {
        await admin.from("user_profiles").delete().eq("user_id", signUpData.user.id);
        await admin.from("shops").delete().eq("id", createdShop.id);
      } catch {}
      return { success: false, error: membershipError.message };
    }

    await trackProductEvent(createdShop.id, "trial_started", {
      actorUserId: signUpData.user.id,
      metadata: { source: "register_shop", trial_days: 15 },
    });

    try {
      await admin.from("admin_allowlist").upsert(
        {
          email: normalizedEmail,
          shop_id: createdShop.id,
          role: "owner",
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );
    } catch {}

    const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (signInError) {
      try {
        await sendAdminConfirmationEmail(normalizedEmail);
      } catch (mailError) {
        console.error("[registerShop] resend confirmation email error", mailError);
      }
      return {
        success: true,
        data: {
          requiresEmailConfirmation: true,
          message: "Cuenta creada. Confirmá tu email para terminar de configurar tu negocio.",
        },
      };
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
        redirectTo: `${resolvePublicSiteUrl()}/auth/callback`,
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

export async function createAdditionalShop(shopName: string): Promise<ActionResult<{ slug: string; isFirstShop: boolean }>> {
  try {
    const trimmedName = shopName.trim();
    if (!trimmedName) {
      return { success: false, error: "El nombre del local es obligatorio" };
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Sesion expirada" };
    }

    const admin = await createServiceRoleClient();
    const { data: existingMemberships } = await admin
      .from("shop_memberships")
      .select("shop_id")
      .eq("user_id", user.id)
      .eq("role", "owner");
    const isFirstShop = !existingMemberships || existingMemberships.length === 0;

    const slug = await resolveUniqueShopSlug(generateShopSlug(trimmedName));
    const trialEnd = isFirstShop ? getTrialExpiryIso() : null;

    const { data: createdShop, error: shopError } = await admin
      .from("shops")
      .insert({
        nombre: trimmedName,
        slug,
        industry: "peluqueria",
        active: isFirstShop,
        plan_expiry: trialEnd,
      })
      .select("id, slug")
      .single();

    if (shopError || !createdShop?.id || !createdShop.slug) {
      return { success: false, error: shopError?.message || "No se pudo crear el local" };
    }

    const { error: membershipError } = await admin.from("shop_memberships").upsert(
      {
        user_id: user.id,
        shop_id: createdShop.id,
        role: "owner",
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,shop_id" }
    );

    if (membershipError) {
      try { await admin.from("shops").delete().eq("id", createdShop.id); } catch {}
      return { success: false, error: membershipError.message };
    }

    const { data: createdMembership } = await admin
      .from("shop_memberships")
      .select("shop_id")
      .eq("user_id", user.id)
      .eq("shop_id", createdShop.id)
      .eq("is_active", true)
      .eq("role", "owner")
      .maybeSingle();

    if (!createdMembership?.shop_id) {
      try {
        await admin.from("shop_memberships").delete().eq("user_id", user.id).eq("shop_id", createdShop.id);
        await admin.from("shops").delete().eq("id", createdShop.id);
      } catch {}
      return { success: false, error: "No se pudo vincular el nuevo local al usuario" };
    }

    if (isFirstShop && trialEnd) {
      await trackProductEvent(createdShop.id, "trial_started", {
        actorUserId: user.id,
        metadata: { source: "create_additional_shop", trial_days: 15 },
      });
    }

    const { error: profileSyncError } = await admin
      .from("user_profiles")
      .update({
        shop_id: createdShop.id,
        role: "owner",
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (profileSyncError) {
      try {
        await admin.from("shop_memberships").delete().eq("user_id", user.id).eq("shop_id", createdShop.id);
        await admin.from("shops").delete().eq("id", createdShop.id);
      } catch {}
      return { success: false, error: profileSyncError.message };
    }

    await admin.from("admin_allowlist").upsert(
      {
        email: (user.email || "").trim().toLowerCase(),
        shop_id: createdShop.id,
        role: "owner",
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

    return { success: true, data: { slug: createdShop.slug, isFirstShop } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear local" };
  }
}

export async function resolveDashboardShopIdBySlug(shopSlug: string): Promise<ActionResult<{ shopId: string }>> {
  try {
    const trimmedSlug = shopSlug.trim().toLowerCase();
    if (!trimmedSlug) return { success: false, error: "Slug invalido" };

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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "SESION_EXPIRADA" };

    const admin = await createServiceRoleClient();
    const { data: shop } = await admin
      .from("shops")
      .select("id, slug")
      .eq("slug", trimmedSlug)
      .maybeSingle();

    if (!shop?.id) return { success: false, error: "LOCAL_NO_ENCONTRADO" };

    const { data: membership } = await admin
      .from("shop_memberships")
      .select("shop_id")
      .eq("user_id", user.id)
      .eq("shop_id", shop.id)
      .eq("is_active", true)
      .in("role", ["owner", "admin", "staff"])
      .maybeSingle();

    if (!membership?.shop_id) return { success: false, error: "SIN_ACCESO_LOCAL" };

    return { success: true, data: { shopId: shop.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al resolver local" };
  }
}
