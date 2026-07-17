"use server";

import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { requireSuperAdmin } from "@/lib/admin/auth";
import type { Json } from "@/lib/supabase/database.types";
import { INDUSTRY_CONFIG } from "@/lib/industry/config";
import { resolveIndustry } from "@/lib/industry/resolve";

export type UserAdminItem = {
  userId: string;
  email: string | null;
  name: string | null;
  nombre: string | null;
  role: string | null;
  platformRole: string;
  isActive: boolean;
  isBanned: boolean;
  bannedAt: string | null;
  shopName: string | null;
  shopSlug: string | null;
  createdAt: string | null;
};

export type ShopAdminItem = {
  shopId: string;
  nombre: string;
  slug: string;
  industry: string;
  industryLabel: string;
  active: boolean;
  planExpiry: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  memberCount: number;
  createdAt: string | null;
};

export type UserAdminResult = {
  users: UserAdminItem[];
  total: number;
  page: number;
  perPage: number;
};

export type ShopAdminResult = {
  shops: ShopAdminItem[];
  total: number;
  page: number;
  perPage: number;
};

async function appendAdminAudit(action: string, payload: Record<string, unknown>) {
  const session = await requireSuperAdmin();
  const admin = await createServiceRoleClient();
  await admin.from("admin_audit_logs").insert({
    actor_user_id: session.userId,
    action,
    target_type: "admin_management",
    target_id: null,
    payload: payload as Json,
  });
}

export async function fetchUsersAdmin(input: {
  q?: string;
  filter?: string;
  page?: number;
}): Promise<UserAdminResult> {
  await requireSuperAdmin();
  const admin = await createServiceRoleClient();
  const perPage = 20;
  const page = Math.max(1, input.page || 1);
  const q = (input.q || "").trim().toLowerCase();
  const filter = input.filter || "all";

  // Using as any because is_banned/banned_at/banned_reason columns are new (migration 078)
  // and database.types.ts hasn't been regenerated yet. Run `npm run supabase:gen-types` after migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from("user_profiles")
    .select("user_id, email, name, nombre, role, platform_role, is_active, is_banned, banned_at, shop_id, created_at", { count: "exact" });

  if (q) {
    query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%,nombre.ilike.%${q}%`);
  }

  if (filter === "banned") {
    query = query.eq("is_banned", true);
  } else if (filter === "active") {
    query = query.eq("is_banned", false);
  }

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  const rows = (data || []) as Array<{
    user_id: string;
    email: string | null;
    name: string | null;
    nombre: string | null;
    role: string | null;
    platform_role: string;
    is_active: boolean | null;
    is_banned: boolean | null;
    banned_at: string | null;
    shop_id: string | null;
    created_at: string | null;
  }>;

  const shopIds = [...new Set(rows.map((r) => r.shop_id).filter(Boolean))] as string[];
  let shopMap = new Map<string, { nombre: string; slug: string }>();
  if (shopIds.length > 0) {
    const { data: shops } = await admin.from("shops").select("id, nombre, slug").in("id", shopIds);
    shopMap = new Map((shops || []).map((s: any) => [s.id, { nombre: s.nombre, slug: s.slug }]));
  }

  const users: UserAdminItem[] = rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    name: row.name,
    nombre: row.nombre,
    role: row.role,
    platformRole: row.platform_role,
    isActive: row.is_active ?? true,
    isBanned: row.is_banned ?? false,
    bannedAt: row.banned_at,
    shopName: row.shop_id ? shopMap.get(row.shop_id)?.nombre || null : null,
    shopSlug: row.shop_id ? shopMap.get(row.shop_id)?.slug || null : null,
    createdAt: row.created_at,
  }));

  return {
    users,
    total: count || 0,
    page,
    perPage,
  };
}

export async function banUser(
  userId: string,
  banned: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSuperAdmin();
    if (userId === session.userId) {
      return { success: false, error: "No podes bannear tu propia cuenta." };
    }

    const admin = await createServiceRoleClient();

    // Using as any for is_banned/banned_at/banned_reason (new columns from migration 078)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("user_profiles")
      .update({
        is_banned: banned,
        banned_at: banned ? new Date().toISOString() : null,
        banned_reason: banned ? "Banneado por admin" : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (banned) {
      await admin.auth.admin.updateUserById(userId, {
        ban_duration: "604800", // 7 dias
      });
    } else {
      await admin.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });
    }

    await appendAdminAudit(banned ? "admin.ban_user" : "admin.unban_user", {
      targetUserId: userId,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo cambiar el baneo" };
  }
}

export async function deleteUser(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSuperAdmin();
    if (userId === session.userId) {
      return { success: false, error: "No podes borrar tu propia cuenta." };
    }

    const admin = await createServiceRoleClient();

    // Using as any for admin_cleanup_user_data RPC (new from migration 078)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (admin as any).rpc("admin_cleanup_user_data", {
      p_user_id: userId,
    });
    if (rpcError) return { success: false, error: rpcError.message };

    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) return { success: false, error: authError.message };

    await appendAdminAudit("admin.delete_user", {
      targetUserId: userId,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo borrar el usuario" };
  }
}

export async function fetchShopsAdmin(input: {
  q?: string;
  filter?: string;
  page?: number;
}): Promise<ShopAdminResult> {
  await requireSuperAdmin();
  const admin = await createServiceRoleClient();
  const perPage = 20;
  const page = Math.max(1, input.page || 1);
  const q = (input.q || "").trim().toLowerCase();
  const filter = input.filter || "all";

  let query = admin
    .from("shops")
    .select("id, nombre, slug, industry, active, plan_expiry, created_at", { count: "exact" });

  if (q) {
    query = query.or(`nombre.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  if (filter === "active") {
    query = query.eq("active", true);
  } else if (filter === "inactive") {
    query = query.eq("active", false);
  }

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  const rows = (data || []) as Array<{
    id: string;
    nombre: string;
    slug: string;
    industry: string;
    active: boolean | null;
    plan_expiry: string | null;
    created_at: string | null;
  }>;

  const shopIds = rows.map((r) => r.id);
  const ownerMap = new Map<string, { email: string | null; name: string | null }>();
  const memberCountMap = new Map<string, number>();

  if (shopIds.length > 0) {
    const { data: memberships } = await admin
      .from("shop_memberships")
      .select("shop_id, user_id, role")
      .in("shop_id", shopIds)
      .eq("is_active", true);

    const memberRows = (memberships || []) as Array<{
      shop_id: string;
      user_id: string;
      role: string;
    }>;

    for (const m of memberRows) {
      memberCountMap.set(m.shop_id, (memberCountMap.get(m.shop_id) || 0) + 1);
      if (m.role === "owner") {
        const { data: profile } = await admin
          .from("user_profiles")
          .select("email, name")
          .eq("user_id", m.user_id)
          .maybeSingle();
        if (profile) {
          ownerMap.set(m.shop_id, {
            email: (profile as any).email,
            name: (profile as any).name,
          });
        }
      }
    }
  }

  const shops: ShopAdminItem[] = rows.map((row) => ({
    shopId: row.id,
    nombre: row.nombre,
    slug: row.slug,
    industry: row.industry,
    industryLabel: INDUSTRY_CONFIG[resolveIndustry(row.industry)].displayName,
    active: row.active ?? true,
    planExpiry: row.plan_expiry,
    ownerEmail: ownerMap.get(row.id)?.email || null,
    ownerName: ownerMap.get(row.id)?.name || null,
    memberCount: memberCountMap.get(row.id) || 0,
    createdAt: row.created_at,
  }));

  return {
    shops,
    total: count || 0,
    page,
    perPage,
  };
}

export async function deleteShop(
  shopId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();

    // Using as any for admin_delete_shop RPC (new from migration 078)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (admin as any).rpc("admin_delete_shop", {
      p_shop_id: shopId,
    });
    if (rpcError) return { success: false, error: rpcError.message };

    await appendAdminAudit("admin.delete_shop", {
      targetShopId: shopId,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo borrar la tienda" };
  }
}

export async function toggleShopActive(
  shopId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireSuperAdmin();
    const admin = await createServiceRoleClient();

    const { data: shop } = await admin
      .from("shops")
      .select("active")
      .eq("id", shopId)
      .maybeSingle();

    if (!shop) return { success: false, error: "Tienda no encontrada" };

    const newActive = !(shop as any).active;

    await admin
      .from("shops")
      .update({
        active: newActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shopId);

    await appendAdminAudit(newActive ? "admin.activate_shop" : "admin.deactivate_shop", {
      targetShopId: shopId,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "No se pudo cambiar el estado" };
  }
}
