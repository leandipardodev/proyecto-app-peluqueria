import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/types";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { cache } from "react";
import { withRetry } from "@/lib/retry";

const ACTIVE_SHOP_ID_COOKIE = "klip_active_shop_id";

async function fetchUser() {
  return withRetry(async () => {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  });
}

export const getCachedUser = cache(fetchUser);

export async function getAuthSession(): Promise<{ user: { id: string } } | null> {
  const user = await getCachedUser();
  if (!user) return null;
  return { user };
}

export const getCachedShopIdBySlug = cache(async function (slug: string, userId: string) {
  try {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug || !userId) return null;

    const admin = await createServiceRoleClient();
    const { data: shop } = await admin
      .from("shops")
      .select("id, slug")
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (!shop?.id) return null;

    const { data: membership } = await admin
      .from("shop_memberships")
      .select("shop_id")
      .eq("user_id", userId)
      .eq("shop_id", shop.id)
      .eq("is_active", true)
      .in("role", ["owner", "admin", "staff"])
      .maybeSingle();

    return membership?.shop_id || null;
  } catch {
    return null;
  }
});

export async function getShopId(session: { user: { id: string } }): Promise<string | null> {
  const supabase = await createServerClient();
  const requestHeaders = await headers();
  const shopIdFromHeader = requestHeaders.get("x-shop-id");
  if (shopIdFromHeader) {
    const { data: headerMembership } = await supabase
      .from("shop_memberships")
      .select("shop_id")
      .eq("user_id", session.user.id)
      .eq("shop_id", shopIdFromHeader)
      .eq("is_active", true)
      .in("role", ["owner", "admin", "staff"])
      .maybeSingle();
    if (headerMembership?.shop_id) return headerMembership.shop_id;
  }

  const shopSlugFromHeader = requestHeaders.get("x-shop-slug");
  if (shopSlugFromHeader) {
    const normalizedSlug = shopSlugFromHeader.trim().toLowerCase();
    if (normalizedSlug) {
      const admin = await createServiceRoleClient();
      const { data: shop } = await admin
        .from("shops")
        .select("id")
        .eq("slug", normalizedSlug)
        .maybeSingle();

      if (shop?.id) {
        const { data: membership } = await admin
          .from("shop_memberships")
          .select("shop_id")
          .eq("user_id", session.user.id)
          .eq("shop_id", shop.id)
          .eq("is_active", true)
          .in("role", ["owner", "admin", "staff"])
          .maybeSingle();

        if (membership?.shop_id) return membership.shop_id;
      }
    }
  }

  const cookieStore = await cookies();
  const shopIdFromCookie = cookieStore.get(ACTIVE_SHOP_ID_COOKIE)?.value || null;
  if (shopIdFromCookie) {
    const { data: cookieMembership } = await supabase
      .from("shop_memberships")
      .select("shop_id")
      .eq("user_id", session.user.id)
      .eq("shop_id", shopIdFromCookie)
      .eq("is_active", true)
      .in("role", ["owner", "admin", "staff"])
      .maybeSingle();

    if (cookieMembership?.shop_id) return cookieMembership.shop_id;
  }

  const { data: membership } = await supabase
    .from("shop_memberships")
    .select("shop_id")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "staff"])
    .limit(1)
    .maybeSingle();

  if (membership?.shop_id) return membership.shop_id;
  return null;
}

export async function getShopIdBySlug(slug: string, userId: string): Promise<string | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug || !userId) return null;

  const admin = await createServiceRoleClient();
  const { data: shop } = await admin
    .from("shops")
    .select("id, slug")
    .eq("slug", normalizedSlug)
    .maybeSingle();

  if (!shop?.id) return null;

  const { data: membership } = await admin
    .from("shop_memberships")
    .select("shop_id")
    .eq("user_id", userId)
    .eq("shop_id", shop.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "staff"])
    .maybeSingle();

  return membership?.shop_id || null;
}

export async function canAccessShopId(userId: string, shopId: string): Promise<boolean> {
  if (!userId || !shopId) return false;
  const admin = await createServiceRoleClient();
  const { data: membership } = await admin
    .from("shop_memberships")
    .select("shop_id")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .in("role", ["owner", "admin", "staff"])
    .maybeSingle();

  return Boolean(membership?.shop_id);
}

export async function requireShopId(): Promise<ActionResult<string>> {
  const session = await getAuthSession();
  if (!session) return { success: false, error: "SESION_EXPIRADA" };
  const shopId = await getShopId(session);
  if (!shopId) return { success: false, error: "SESION_EXPIRADA" };
  return { success: true, data: shopId };
}

export async function requireShopContext(): Promise<{ userId: string; shopId: string }> {
  const session = await getAuthSession();
  if (!session) {
    redirect("/login");
  }
  const shopId = await getShopId(session);
  if (!shopId) {
    throw new Error("SHOP_CONTEXT_MISSING");
  }
  return { userId: session.user.id, shopId };
}

export async function requireOwnerShopId(): Promise<ActionResult<string>> {
  const session = await getAuthSession();
  if (!session) return { success: false, error: "SESION_EXPIRADA" };

  const shopId = await getShopId(session);
  if (!shopId) return { success: false, error: "SESION_EXPIRADA" };

  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("shop_memberships")
    .select("role, is_active")
    .eq("user_id", session.user.id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (membership?.is_active && membership.role === "owner") {
    return { success: true, data: shopId };
  }

  return { success: false, error: "Solo el owner del local puede realizar esta accion" };
}

export async function checkShopExpired(shopId: string): Promise<{ expired: boolean; active: boolean }> {
  const admin = await createServiceRoleClient();
  const { data: shop } = await admin
    .from("shops")
    .select("active, plan_expiry")
    .eq("id", shopId)
    .maybeSingle();

  if (!shop) return { expired: false, active: true };

  if (!shop.active) return { expired: true, active: false };

  if (shop.plan_expiry) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const planExpiryStr = shop.plan_expiry.slice(0, 10);
    if (planExpiryStr <= todayStr) return { expired: true, active: true };
  }

  return { expired: false, active: true };
}

export async function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL for service-role client");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for service-role client");
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
