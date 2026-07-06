import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { resolveIndustry } from "@/lib/industry/resolve";
import { DASHBOARD_LEGACY_SEGMENTS_SET } from "@/lib/dashboard/shared/legacy-segments";
import { trackProductEvent } from "@/lib/analytics/product-events";

const TRIAL_DAYS = 15;

function createSupabaseClient(request: NextRequest, response: NextResponse) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "").map(
            ({ name, value }) => ({
              name,
              value: value ?? "",
            })
          );
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("OAuth callback misconfigured: missing Supabase service role env vars");
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildDashboardRedirectPath(nextPath: string | null, slug: string | null): string {
  if (!slug) return nextPath && nextPath.startsWith("/") ? nextPath : "/dashboard";

  if (!nextPath || !nextPath.startsWith("/")) {
    return `/dashboard/${slug}`;
  }

  if (!nextPath.startsWith("/dashboard")) {
    return nextPath;
  }

  const queryIndex = nextPath.indexOf("?");
  const hashIndex = nextPath.indexOf("#");
  const cutIndex = [queryIndex, hashIndex].filter((v) => v >= 0).sort((a, b) => a - b)[0] ?? nextPath.length;
  const pathname = nextPath.slice(0, cutIndex);
  const suffix = nextPath.slice(cutIndex);

  const parts = pathname.split("/").filter(Boolean);
  const dashboardTail = parts.slice(1);
  if (dashboardTail.length === 0) {
    return `/dashboard/${slug}${suffix}`;
  }

  const firstTail = dashboardTail[0];

  const tailPath = DASHBOARD_LEGACY_SEGMENTS_SET.has(firstTail)
    ? `/${dashboardTail.join("/")}`
    : `/${dashboardTail.slice(1).join("/")}`;

  return `/dashboard/${slug}${tailPath === "/" ? "" : tailPath}${suffix}`;
}

function generateShopSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50) || "local";
}

async function resolveUniqueShopSlug(adminClient: ReturnType<typeof createAdminClient>, baseSlug: string): Promise<string> {
  const normalized = baseSlug || "local";
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? normalized : `${normalized}-${Math.floor(Math.random() * 9000) + 1000}`;
    const { data } = await adminClient.from("shops").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${normalized}-${Date.now().toString().slice(-6)}`;
}

export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const cookieFlow = request.cookies.get("klip_oauth_flow")?.value || null;
    const cookieNextRaw = request.cookies.get("klip_oauth_next")?.value || null;
    const cookieNext = cookieNextRaw ? decodeURIComponent(cookieNextRaw) : null;
    const cookieState = request.cookies.get("klip_oauth_state")?.value || null;
    const stateParam = requestUrl.searchParams.get("state") || cookieState;
    const flowParam = requestUrl.searchParams.get("flow") || cookieFlow;
    const requestedAdminFlow = flowParam === "admin";
    let flow: "admin" | "owner_signup" | "client" =
      flowParam === "admin" || flowParam === "owner_signup" ? flowParam : "client";

    if (!code) {
      if (process.env.NODE_ENV !== "production") {
        console.info("[oauth-debug][callback] missing code", {
          url: request.url,
          flowParam,
          hasState: Boolean(stateParam),
          next: requestUrl.searchParams.get("next"),
        });
      }
      return NextResponse.redirect(
        new URL("/login?error=No+se+recibio+el+codigo+de+Google", request.url)
      );
    }

    let shopSlug: string | null = null;
    let serviceId: string | null = null;
    let staffId: string | null = null;
    const nextPath = requestUrl.searchParams.get("next") || cookieNext;
    const isExplicitAdminTarget = requestedAdminFlow && Boolean(nextPath?.startsWith("/admin"));

    if (process.env.NODE_ENV !== "production") {
      console.info("[oauth-debug][callback] incoming", {
        url: request.url,
        origin: requestUrl.origin,
        host: requestUrl.host,
        flowParam,
        requestedAdminFlow,
        nextPath,
        hasState: Boolean(stateParam),
        isExplicitAdminTarget,
      });
    }

    if (requestedAdminFlow && !isExplicitAdminTarget) {
      flow = "client";
    }

    if (stateParam) {
      try {
        const state = JSON.parse(decodeURIComponent(stateParam));
        shopSlug = state.shopSlug || null;
        serviceId = state.serviceId || null;
        staffId = state.staffId || null;
        if (
          flow === "client" &&
          typeof state?.shopName === "string" &&
          state.shopName.trim().length > 0 &&
          !nextPath?.startsWith("/book/")
        ) {
          flow = "owner_signup";
        }
      } catch (e) { console.error("[auth/callback] error parsing state:", e); }
    }

    const response = new NextResponse(null, { status: 200 });
    response.cookies.set("klip_oauth_flow", "", { path: "/", maxAge: 0 });
    response.cookies.set("klip_oauth_next", "", { path: "/", maxAge: 0 });
    response.cookies.set("klip_oauth_state", "", { path: "/", maxAge: 0 });

    const supabase = createSupabaseClient(request, response);

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.redirect(
        new URL("/login?error=No+se+pudo+obtener+el+usuario", request.url)
      );
    }

    // Check if user already has a profile
    let { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("user_id, shop_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    const adminClient = createAdminClient();
    const normalizedEmail = (user.email || "").trim().toLowerCase();
    const { data: allowlistEntry } = await adminClient
      .from("admin_allowlist")
      .select("shop_id, role, is_active")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    const isAllowlistedAdmin = Boolean(
      allowlistEntry && allowlistEntry.is_active && ["owner", "admin", "staff"].includes(allowlistEntry.role)
    );

    const { data: existingOperationalMembership } = await adminClient
      .from("shop_memberships")
      .select("shop_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .in("role", ["owner", "admin", "staff"])
      .limit(1)
      .maybeSingle();

    const hasOperationalAccess = Boolean(existingOperationalMembership?.shop_id);
    let createdOrSelectedShopId: string | null = null;

    if (!isExplicitAdminTarget && requestedAdminFlow && !isAllowlistedAdmin && !hasOperationalAccess) {
      flow = "client";
    }

    if (isExplicitAdminTarget && !isAllowlistedAdmin && !hasOperationalAccess) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL("/login?error=Acceso+admin+denegado.+Tu+email+no+está+autorizado", request.url),
        { headers: response.headers }
      );
    }

    if (flow === "owner_signup" && !hasOperationalAccess) {
      let ownerShopName: string | null = null;
      let ownerIndustry = resolveIndustry(null);
      if (stateParam) {
        try {
          const state = JSON.parse(decodeURIComponent(stateParam));
          ownerShopName = typeof state?.shopName === "string" ? state.shopName.trim() : null;
          ownerIndustry = resolveIndustry(typeof state?.industry === "string" ? state.industry : null);
        } catch (e) { console.error("[auth/callback] error parsing state:", e); }
      }

      if (!ownerShopName) {
        return NextResponse.redirect(new URL("/register?error=Debes+indicar+el+nombre+del+local", request.url));
      }

      const slug = await resolveUniqueShopSlug(adminClient, generateShopSlug(ownerShopName));
      const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { data: createdShop, error: createShopError } = await adminClient
        .from("shops")
        .insert({
          nombre: ownerShopName,
          slug,
          industry: ownerIndustry,
          active: true,
          plan_expiry: trialEnd,
        })
        .select("id")
        .single();

      if (createShopError || !createdShop?.id) {
        return NextResponse.redirect(
          new URL(`/register?error=${encodeURIComponent(createShopError?.message || "No se pudo crear el local")}`, request.url)
        );
      }

      createdOrSelectedShopId = createdShop.id;

      if (existingProfile) {
        const { error: profileUpdateError } = await adminClient
          .from("user_profiles")
          .update({
            role: "owner",
            shop_id: createdShop.id,
            email: normalizedEmail,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);

        if (profileUpdateError) {
          try { await adminClient.from("shops").delete().eq("id", createdShop.id); } catch (cleanupErr) { console.error("[auth/callback] cleanup after profile update error:", cleanupErr); }
          return NextResponse.redirect(new URL(`/register?error=${encodeURIComponent(profileUpdateError.message)}`, request.url));
        }
      } else {
        const { error: profileInsertError } = await adminClient
          .from("user_profiles")
          .insert({
            user_id: user.id,
            shop_id: createdShop.id,
            name: user.user_metadata?.full_name || user.email || "Owner",
            email: normalizedEmail,
            role: "owner",
            is_active: true,
          });

        if (profileInsertError) {
          try { await adminClient.from("shops").delete().eq("id", createdShop.id); } catch (cleanupErr) { console.error("[auth/callback] cleanup after profile insert error:", cleanupErr); }
          return NextResponse.redirect(new URL(`/register?error=${encodeURIComponent(profileInsertError.message)}`, request.url));
        }
      }

      const { error: membershipError } = await adminClient.from("shop_memberships").upsert(
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
        try {
          await adminClient.from("user_profiles").delete().eq("user_id", user.id).eq("shop_id", createdShop.id);
          await adminClient.from("shops").delete().eq("id", createdShop.id);
        } catch (cleanupErr) { console.error("[auth/callback] cleanup after membership error:", cleanupErr); }
        return NextResponse.redirect(new URL(`/register?error=${encodeURIComponent(membershipError.message)}`, request.url));
      }

      await trackProductEvent(createdShop.id, "trial_started", {
        actorUserId: user.id,
        metadata: { source: "oauth_owner_signup", trial_days: TRIAL_DAYS },
      });

      await adminClient.from("admin_allowlist").upsert(
        {
          email: normalizedEmail,
          shop_id: createdShop.id,
          role: "owner",
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );

      existingProfile = { user_id: user.id, shop_id: createdShop.id, role: "owner" };
    }

    if (!existingProfile) {
    let shopId: string | null = null;
    let role: "owner" | "admin" | "staff" | "customer" = "customer";

    if (isAllowlistedAdmin && allowlistEntry?.shop_id) {
      shopId = allowlistEntry.shop_id;
      role = allowlistEntry.role as "owner" | "admin" | "staff";
    } else if (shopSlug) {
      const { data: shop } = await adminClient
        .from("shops")
        .select("id")
        .eq("slug", shopSlug)
        .maybeSingle();
      shopId = shop?.id || null;
    }

    // Fallback: extraer slug del nextPath (e.g. /book/mi-local) si no se obtuvo shopId
    if (!shopId && nextPath) {
      const slugMatch = nextPath.match(/^\/book\/([^\/?#]+)/);
      if (slugMatch) {
        const { data: shop } = await adminClient
          .from("shops")
          .select("id")
          .eq("slug", slugMatch[1])
          .maybeSingle();
        shopId = shop?.id ?? null;
        if (shopId && role === "customer") {
          role = "customer";
        }
      }
    }

    // Use service role key to bypass RLS (chicken-and-egg: new user has no profile yet)
    const { error: profileError } = await adminClient
      .from("user_profiles")
      .insert({
        user_id: user.id,
        shop_id: shopId,
        name: user.user_metadata?.full_name || user.email || "Cliente",
        email: user.email || "",
        role,
      });

    if (profileError) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(profileError.message)}`, request.url)
      );
    }

    if (["owner", "admin", "staff"].includes(role) && shopId) {
      const { error: membershipError } = await adminClient.from("shop_memberships").upsert(
        {
          user_id: user.id,
          shop_id: shopId,
          role,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,shop_id" }
      );

      if (membershipError) {
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(membershipError.message)}`, request.url)
        );
      }
    }

    if (role === "customer") {
      const { error: customerError } = await adminClient
        .from("customers")
        .upsert({
          id: user.id,
          user_id: user.id,
          shop_id: shopId,
          nombre: user.user_metadata?.full_name || user.email || "Cliente",
          email: user.email || "",
          telefono: null,
        });

      if (customerError) {
        try { await adminClient.from("user_profiles").delete().eq("user_id", user.id); } catch (cleanupErr) { console.error("[auth/callback] cleanup after customer error:", cleanupErr); }
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(customerError.message)}`, request.url)
        );
      }
    }
    } else if (isAllowlistedAdmin && allowlistEntry?.shop_id && ["owner", "admin", "staff"].includes(allowlistEntry.role)) {
    if (existingProfile.role !== allowlistEntry.role || existingProfile.shop_id !== allowlistEntry.shop_id) {
      const { error: roleSyncError } = await adminClient
        .from("user_profiles")
        .update({
          role: allowlistEntry.role,
          shop_id: allowlistEntry.shop_id,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (roleSyncError) {
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(roleSyncError.message)}`, request.url)
        );
      }
    }

    const { error: membershipError } = await adminClient.from("shop_memberships").upsert(
      {
        user_id: user.id,
        shop_id: allowlistEntry.shop_id,
        role: allowlistEntry.role,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,shop_id" }
    );

    if (membershipError) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(membershipError.message)}`, request.url)
      );
    }
    } else if (existingProfile.shop_id) {
      if (existingProfile.role === "customer") {
        await adminClient.from("customers").upsert({
          id: user.id,
          user_id: user.id,
          shop_id: existingProfile.shop_id,
          nombre: user.user_metadata?.full_name || user.email || "Cliente",
          email: user.email || "",
          telefono: null,
        });
      }
    }

    const effectiveRole =
      (isAllowlistedAdmin ? allowlistEntry?.role : null) || existingProfile?.role || "customer";
    const isDashboardRole = ["owner", "admin", "staff"].includes(effectiveRole);

    let dashboardSlug: string | null = null;
    if (isDashboardRole) {
      const effectiveShopId =
      createdOrSelectedShopId || (isAllowlistedAdmin && allowlistEntry?.shop_id) || existingProfile?.shop_id || null;

    if (effectiveShopId) {
      const { data: effectiveShop } = await adminClient
        .from("shops")
        .select("slug")
        .eq("id", effectiveShopId)
        .maybeSingle();
      dashboardSlug = effectiveShop?.slug || null;
    }

      if (!dashboardSlug) {
        const { data: memberships } = await adminClient
        .from("shop_memberships")
        .select("shop_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

        if (memberships?.shop_id) {
          if (!existingProfile?.shop_id) {
            await adminClient
              .from("user_profiles")
              .update({ shop_id: memberships.shop_id, updated_at: new Date().toISOString() })
              .eq("user_id", user.id);
          }
          const { data: fallbackShop } = await adminClient
            .from("shops")
            .select("slug")
          .eq("id", memberships.shop_id)
          .maybeSingle();
        dashboardSlug = fallbackShop?.slug || null;
      }
    }
    }

    const redirectUrl =
      isDashboardRole
        ? new URL(buildDashboardRedirectPath(nextPath, dashboardSlug), request.url)
        : nextPath && nextPath.startsWith("/")
          ? new URL(nextPath, request.url)
          : serviceId
            ? new URL(`/client/book?serviceId=${serviceId}${staffId ? `&staffId=${staffId}` : ""}`, request.url)
            : shopSlug
              ? new URL(`/book/${shopSlug}`, request.url)
              : new URL("/client/appointments", request.url);

    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  } catch (error) {
    console.error("[auth/callback] unexpected error", error);
    const fallbackUrl = new URL("/login", request.url);
    fallbackUrl.searchParams.set("error", "Error interno al procesar Google OAuth");
    return NextResponse.redirect(fallbackUrl);
  }
}
