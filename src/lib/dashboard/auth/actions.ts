"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/types";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { resolveIndustry } from "@/lib/industry/resolve";
import { DEFAULT_ASSIGN_STAFF_LATER } from "@/lib/industry/types";
import { sendVerificationCode, verifyEmailCode } from "@/lib/dashboard/auth/verification-actions";
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

async function findUserByEmail(
  admin: Awaited<ReturnType<typeof createServiceRoleClient>>,
  email: string,
): Promise<{ id: string; email?: string | null } | null> {
  const pageSize = 1000;
  let page = 1;
  while (true) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: pageSize });
    const users = data?.users;
    if (!users || users.length === 0) break;
    const found = users.find((u) => u.email === email);
    if (found) return found;
    if (users.length < pageSize) break;
    page++;
  }
  return null;
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
): Promise<ActionResult<{ requiresEmailVerification?: boolean; email?: string; message?: string }>> {
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

    const normalizedEmail = email.trim().toLowerCase();

    const admin = await createServiceRoleClient();

    const staleUser = await findUserByEmail(admin, normalizedEmail);
    if (staleUser) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(staleUser.id);
      if (deleteError) {
        return { success: false, error: "Ya existe una cuenta con ese email. Iniciá sesión o usá otro email." };
      }
    }

    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: false,
    });

    if (createError || !createdUser?.user) {
      return { success: false, error: mapAuthError(createError?.message || "No se pudo crear el usuario") };
    }

    const userId = createdUser.user.id;

    const { error: profileError } = await admin.from("user_profiles").upsert({
      user_id: userId,
      shop_id: null,
      name: normalizedEmail,
      email: normalizedEmail,
      role: "owner",
      is_active: false,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      try { await admin.auth.admin.deleteUser(userId); } catch (cleanupErr) { console.error("[auth-actions] cleanup after profile error:", cleanupErr); }
      return { success: false, error: profileError.message };
    }

    const codeResult = await sendVerificationCode(normalizedEmail);
    if (!codeResult.success) {
      try { await admin.auth.admin.deleteUser(userId); } catch (cleanupErr) { console.error("[auth-actions] cleanup after code error (user):", cleanupErr); }
      try { await admin.from("user_profiles").delete().eq("user_id", userId); } catch (cleanupErr) { console.error("[auth-actions] cleanup after code error (profile):", cleanupErr); }
      return { success: false, error: "No se pudo enviar el código de verificación. Intentá de nuevo." };
    }

    return {
      success: true,
      data: {
        requiresEmailVerification: true,
        email: normalizedEmail,
        message: "Te enviamos un código de 6 dígitos a tu email.",
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al registrar" };
  }
}

export async function completeRegistration(
  formData: FormData
): Promise<ActionResult<{ redirectToDashboard?: boolean; message?: string }>> {
  try {
    const email = formData.get("email") as string;
    const code = formData.get("code") as string;
    const shopName = formData.get("shop_name") as string;
    const industry = resolveIndustry(formData.get("industry") as string | null);

    if (!email || !code || !shopName) {
      return { success: false, error: "Faltan datos para completar el registro" };
    }

    const normalizedEmail = email.trim().toLowerCase();

    const verifyResult = await verifyEmailCode(normalizedEmail, code);
    if (!verifyResult.success) {
      return { success: false as const, error: verifyResult.error || "Código incorrecto" };
    }

    const admin = await createServiceRoleClient();

    const user = await findUserByEmail(admin, normalizedEmail);
    if (!user) {
      return { success: false, error: "Usuario no encontrado" };
    }

    await admin.auth.admin.updateUserById(user.id, { email_confirm: true });

    const slug = await resolveUniqueShopSlug(generateShopSlug(shopName));
    const trialEnd = getTrialExpiryIso();

    const { data: createdShop, error: shopError } = await admin
      .from("shops")
      .insert({
        nombre: shopName,
        slug,
        industry,
        assign_staff_later: DEFAULT_ASSIGN_STAFF_LATER[industry],
        active: true,
        plan_expiry: trialEnd,
      })
      .select("id")
      .single();

    if (shopError || !createdShop?.id) {
      return { success: false, error: shopError?.message || "No se pudo crear el local" };
    }

    await admin.from("user_profiles").upsert({
      user_id: user.id,
      shop_id: createdShop.id,
      name: normalizedEmail,
      email: normalizedEmail,
      role: "owner",
      is_active: true,
      updated_at: new Date().toISOString(),
    });

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
      try { await admin.from("shops").delete().eq("id", createdShop.id); } catch (cleanupErr) { console.error("[auth-actions] cleanup after membership error:", cleanupErr); }
      return { success: false, error: membershipError.message };
    }

    await trackProductEvent(createdShop.id, "trial_started", {
      actorUserId: user.id,
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
    } catch (listErr) { console.error("[auth-actions] allowlist upsert error:", listErr); }

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
            } catch (cookieErr) { console.error("[auth-actions] cookie setAll error:", cookieErr); }
          },
        },
      }
    );

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: formData.get("password") as string,
    });

    if (signInError) {
      return { success: false, error: "Cuenta verificada pero no se pudo iniciar sesión. Intentá desde el login." };
    }

    await supabase.auth.refreshSession();

    return { success: true, data: { redirectToDashboard: true } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al completar el registro" };
  }
}

export async function resendVerificationCode(email: string): Promise<ActionResult> {
  try {
    const result = await sendVerificationCode(email);
    if (!result.success) {
      return { success: false, error: result.error || "No se pudo reenviar el código" };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al reenviar código" };
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
            } catch (cookieErr) { console.error("[auth-actions] cookie setAll error:", cookieErr); }
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
            } catch (cookieErr) { console.error("[auth-actions] cookie setAll error:", cookieErr); }
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

    let planExpiry: string;
    if (isFirstShop) {
      planExpiry = getTrialExpiryIso();
    } else {
      const firstShopId = existingMemberships![0].shop_id;
      const { data: mainShop } = await admin
        .from("shops")
        .select("plan_expiry")
        .eq("id", firstShopId)
        .maybeSingle();
      planExpiry = mainShop?.plan_expiry ?? getTrialExpiryIso();
    }

    const slug = await resolveUniqueShopSlug(generateShopSlug(trimmedName));

    const { data: createdShop, error: shopError } = await admin
      .from("shops")
      .insert({
        nombre: trimmedName,
        slug,
        industry: "peluqueria",
        assign_staff_later: DEFAULT_ASSIGN_STAFF_LATER.peluqueria,
        active: true,
        plan_expiry: planExpiry,
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
      try { await admin.from("shops").delete().eq("id", createdShop.id); } catch (cleanupErr) { console.error("[auth-actions] cleanup after createAdditionalShop membership error:", cleanupErr); }
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
      } catch (cleanupErr) { console.error("[auth-actions] cleanup after membership verify error:", cleanupErr); }
      return { success: false, error: "No se pudo vincular el nuevo local al usuario" };
    }

    if (isFirstShop) {
      await trackProductEvent(createdShop.id, "trial_started", {
        actorUserId: user.id,
        metadata: { source: "create_additional_shop", trial_days: 15 },
      });
    }

    const { error: profileSyncError } = await admin
      .from("user_profiles")
      .update({
        role: "owner",
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (profileSyncError) {
      try {
        await admin.from("shop_memberships").delete().eq("user_id", user.id).eq("shop_id", createdShop.id);
        await admin.from("shops").delete().eq("id", createdShop.id);
      } catch (cleanupErr) { console.error("[auth-actions] cleanup after profile sync error:", cleanupErr); }
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
            } catch (cookieErr) { console.error("[auth-actions] cookie setAll error:", cookieErr); }
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
