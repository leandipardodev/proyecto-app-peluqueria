"use server";

import crypto from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient, getCurrentUserRole, requireShopId } from "@/lib/dashboard/auth/server";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { revalidateDashboardSegments } from "@/lib/dashboard/shared/revalidate-dashboard";
import { createStaffInviteToken } from "@/lib/dashboard/staff/staff-invite";
import type { ActionResult } from "@/lib/types";
import "server-only";
import { createAdminClient } from "../appointments/shared";

async function requireOwnerAccessForShop(shopId: string): Promise<ActionResult<{ userId: string }>> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "SESION_EXPIRADA" };

  const { data: membership } = await supabase
    .from("shop_memberships")
    .select("role, is_active")
    .eq("user_id", user.id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (!membership?.is_active || membership.role !== "owner") {
    return { success: false, error: "Solo el owner del local puede gestionar personal" };
  }

  return { success: true, data: { userId: user.id } };
}

export type ServiceOverride = {
  serviceId: string;
  serviceName: string;
  percentageRate: number;
};

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  revenue: number;
  payModel: "percentage" | "fixed" | "mixed";
  percentageRate: number;
  fixedAmount: number;
  joined: boolean;
  inviteLink: string | null;
  photo_url: string | null;
  overridesEnabled: boolean;
  serviceOverrides: ServiceOverride[];
};

type StaffRpcRow = {
  user_id: string;
  role: string;
  name: string | null;
  nombre: string | null;
  email: string | null;
  invite_accepted_at: string | null;
};

export async function fetchStaffMembers(shopIdOverride?: string): Promise<ActionResult<StaffMember[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    // Check if caller is staff — if so, return members without economic data
    const callerRole = await getCurrentUserRole(shopId);
    const isStaffCaller = callerRole.success && callerRole.data?.role === "staff";

    const [supabase, admin] = await Promise.all([createServerClient(), createAdminClient()]);

    const { data: memberships, error: membershipsError } = await admin
      .from("shop_memberships")
      .select("user_id, role, invite_accepted_at")
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .in("role", ["owner", "staff", "admin"]);

    if (membershipsError) return { success: false, error: membershipsError.message };

    const userIds = (memberships || []).map((m) => m.user_id).filter(Boolean);
    if (userIds.length === 0) return { success: true, data: [] };

    const { data: profiles, error: profilesError } = await admin
      .from("user_profiles")
      .select("user_id, name, email")
      .in("user_id", userIds);

    if (profilesError) return { success: false, error: profilesError.message };

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const { data: staffProfiles } = await admin
      .from("staff_profiles")
      .select("user_id, photo_url")
      .in("user_id", userIds);
    const staffProfileMap = new Map((staffProfiles || []).map((p) => [p.user_id, p.photo_url]));
    const { data: rules } = await admin
      .from("staff_compensation_rules")
      .select("id, staff_user_id, percentage_rate, fixed_amount, overrides_enabled")
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .order("created_at", { ascending: false, nullsFirst: false });
    const ruleMap = new Map((rules || []).map((r) => [r.staff_user_id as string, r]));

    const ruleIds = (rules || []).map((r) => r.id).filter(Boolean);
    const overrideMap = new Map<string, { service_id: string; percentage_rate: number }[]>();
    if (ruleIds.length > 0) {
      const { data: overrides } = await admin
        .from("staff_commission_overrides")
        .select("compensation_rule_id, service_id, percentage_rate")
        .in("compensation_rule_id", ruleIds);
      for (const ov of overrides ?? []) {
        const list = overrideMap.get(ov.compensation_rule_id) ?? [];
        list.push({ service_id: ov.service_id, percentage_rate: Number(ov.percentage_rate || 0) });
        overrideMap.set(ov.compensation_rule_id, list);
      }
    }
    const staffRows: StaffRpcRow[] = (memberships || []).map((m) => {
      const profile = profileMap.get(m.user_id);
      return {
        user_id: m.user_id,
        role: m.role,
        name: profile?.name || null,
        nombre: profile?.name || null,
        email: profile?.email || null,
        invite_accepted_at: m.invite_accepted_at as string | null,
      };
    });

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);

    const { data: revenueData } = await supabase
      .from("appointments")
      .select("staff_id, service_price, services!appointments_service_id_fkey(price)")
      .eq("shop_id", shopId)
      .in("staff_id", userIds)
      .gte("start_time", sixMonthsAgo.toISOString())
      .eq("status", "completed")
      .eq("is_paid", true);

    const revenueByStaff = new Map<string, number>();
    for (const apt of revenueData ?? []) {
      if (!apt.staff_id) continue;
      const value = apt.service_price != null ? Number(apt.service_price) : (apt.services?.[0]?.price || 0);
      revenueByStaff.set(apt.staff_id, (revenueByStaff.get(apt.staff_id) || 0) + value);
    }

    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://klip.com.ar";

    const staffWithRevenue: StaffMember[] = staffRows.map((member) => {
      const rule = ruleMap.get(member.user_id);
      const percentageRate = Number(rule?.percentage_rate || 0);
      const fixedAmount = Number(rule?.fixed_amount || 0);
      const payModel: StaffMember["payModel"] = fixedAmount > 0 && percentageRate > 0 ? "mixed" : fixedAmount > 0 ? "fixed" : "percentage";
      const joined = Boolean(member.invite_accepted_at);
      const inviteLink = !joined && member.email
        ? `${SITE_URL}/join?token=${encodeURIComponent(createStaffInviteToken({ shopId, email: member.email, role: member.role as "staff" | "owner" }))}`
        : null;
      const overridesEnabled = Boolean(rule?.overrides_enabled);
      const rawOverrides = rule?.id ? overrideMap.get(rule.id) ?? [] : [];

      if (isStaffCaller) {
        return {
          id: member.user_id,
          name: member.name ?? member.nombre,
          email: member.email,
          role: member.role,
          revenue: 0,
          payModel: "percentage" as const,
          percentageRate: 0,
          fixedAmount: 0,
          joined,
          inviteLink: null,
          photo_url: staffProfileMap.get(member.user_id) ?? null,
          overridesEnabled: false,
          serviceOverrides: [],
        };
      }

      return {
        id: member.user_id,
        name: member.name ?? member.nombre,
        email: member.email,
        role: member.role,
        revenue: revenueByStaff.get(member.user_id) ?? 0,
        payModel,
        percentageRate,
        fixedAmount,
        joined,
        inviteLink,
        photo_url: staffProfileMap.get(member.user_id) ?? null,
        overridesEnabled,
        serviceOverrides: rawOverrides.map((o) => ({ serviceId: o.service_id, serviceName: "", percentageRate: o.percentage_rate })),
      };
    });

    return { success: true, data: staffWithRevenue };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener personal" };
  }
}

export async function addStaffMember(formData: FormData, shopIdOverride?: string): Promise<ActionResult<{ password?: string; login_url: string }>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const ownerAccess = await requireOwnerAccessForShop(shopId);
    if (!ownerAccess.success) return ownerAccess;

    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const role = formData.get("role") as "staff" | "owner";
    const payModel = String(formData.get("pay_model") || "percentage").trim();
    const percentageRate = Number(formData.get("percentage_rate") || 0);
    const fixedAmount = Number(formData.get("fixed_amount") || 0);
    const overridesEnabled = formData.get("overrides_enabled") === "true";
    const overrides: { serviceId: string; percentageRate: number }[] = [];
    if (overridesEnabled) {
      for (const [key, value] of formData.entries()) {
        if (key.startsWith("override_")) {
          const serviceId = key.slice("override_".length);
          const rate = Number(value);
          if (serviceId && rate >= 0 && rate <= 100) {
            overrides.push({ serviceId, percentageRate: rate });
          }
        }
      }
    }

    if (!name || !email || !role) {
      return { success: false, error: "Todos los campos son obligatorios" };
    }
    if (Number.isNaN(percentageRate) || percentageRate < 0 || percentageRate > 100) {
      return { success: false, error: "Porcentaje invalido" };
    }
    if (Number.isNaN(fixedAmount) || fixedAmount < 0) {
      return { success: false, error: "Monto fijo invalido" };
    }

    const admin = await createAdminClient();

    const normalizedEmail = email.trim().toLowerCase();
    const inviteToken = createStaffInviteToken({ shopId, email: normalizedEmail, role });
    const loginUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://klip.com.ar"}/join?token=${encodeURIComponent(inviteToken)}`;

    const { data: existingUser } = await admin
      .from("user_profiles")
      .select("user_id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUser?.user_id) {
      await admin.from("shop_memberships").upsert(
        {
          user_id: existingUser.user_id,
          shop_id: shopId,
          role,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,shop_id" }
      );

      const normalizedPercentage = payModel === "fixed" ? 0 : percentageRate;
      const normalizedFixed = payModel === "percentage" ? 0 : fixedAmount;
      if (role === "staff") {
        const { data: newRule } = await admin.from("staff_compensation_rules").insert(
          {
            shop_id: shopId,
            staff_user_id: existingUser.user_id,
            model: normalizedFixed > 0 && normalizedPercentage > 0 ? "hybrid" : normalizedFixed > 0 ? "fixed" : "percentage",
            percentage_rate: normalizedPercentage,
            fixed_amount: normalizedFixed,
            overrides_enabled: overridesEnabled,
            starts_on: new Date().toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          },
        ).select("id").single();
        if (newRule && overrides.length > 0) {
          await admin.from("staff_commission_overrides").insert(
            overrides.map((o) => ({
              shop_id: shopId,
              compensation_rule_id: newRule.id,
              service_id: o.serviceId,
              percentage_rate: Math.min(100, Math.max(0, o.percentageRate)),
            }))
          );
        }
      }

      await admin
        .from("user_profiles")
        .update({ role, is_active: true, updated_at: new Date().toISOString() })
        .eq("user_id", existingUser.user_id)
        .eq("shop_id", shopId);

      await admin.from("admin_allowlist").upsert(
        {
          email: normalizedEmail,
          shop_id: shopId,
          role,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );

      if (role === "staff") {
        await trackProductEvent(shopId, "first_staff_added", { metadata: { source: "existing_user" } });
      }

      await revalidateDashboardSegments(shopId, ["/staff"]);
      return { success: true, data: { login_url: loginUrl } };
    }

    const { data: authUsers } = await admin.auth.admin.listUsers();
    if (authUsers?.users) {
      const existingAuthUser = authUsers.users.find(
        (u: { email?: string | null }) => u.email?.toLowerCase() === normalizedEmail
      );
      if (existingAuthUser) {
        await admin.from("user_profiles").upsert(
          {
            user_id: existingAuthUser.id,
            shop_id: shopId,
            name,
            email: normalizedEmail,
            role,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

        await admin.from("shop_memberships").upsert(
          {
            user_id: existingAuthUser.id,
            shop_id: shopId,
            role,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,shop_id" }
        );

        const normalizedPercentage = payModel === "fixed" ? 0 : percentageRate;
        const normalizedFixed = payModel === "percentage" ? 0 : fixedAmount;
        if (role === "staff") {
          const { data: newRule } = await admin.from("staff_compensation_rules").insert({
            shop_id: shopId,
            staff_user_id: existingAuthUser.id,
            model: normalizedFixed > 0 && normalizedPercentage > 0 ? "hybrid" : normalizedFixed > 0 ? "fixed" : "percentage",
            percentage_rate: normalizedPercentage,
            fixed_amount: normalizedFixed,
            overrides_enabled: overridesEnabled,
            starts_on: new Date().toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          }).select("id").single();
          if (newRule && overrides.length > 0) {
            await admin.from("staff_commission_overrides").insert(
              overrides.map((o) => ({
                shop_id: shopId,
                compensation_rule_id: newRule.id,
                service_id: o.serviceId,
                percentage_rate: Math.min(100, Math.max(0, o.percentageRate)),
              }))
            );
          }
        }

        await admin.from("admin_allowlist").upsert(
          {
            email: normalizedEmail,
            shop_id: shopId,
            role,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" }
        );

        if (role === "staff") {
          await trackProductEvent(shopId, "first_staff_added", { metadata: { source: "existing_user" } });
        }

        await revalidateDashboardSegments(shopId, ["/staff"]);
        return { success: true, data: { login_url: loginUrl } };
      }
    }

    const password = crypto.randomBytes(6).toString("hex");

    const { data: adminData, error: adminError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (adminError) return { success: false, error: adminError.message };

    if (!adminData.user) {
      return { success: false, error: "Error al crear el usuario" };
    }

    const { error } = await admin.from("user_profiles").insert({
      user_id: adminData.user.id,
      shop_id: shopId,
      name,
      email: normalizedEmail,
      role,
      is_active: true,
    });

    if (error) {
      try { await admin.auth.admin.deleteUser(adminData.user.id); } catch {}
      return { success: false, error: error.message };
    }

    const { error: membershipError } = await admin.from("shop_memberships").upsert(
      {
        user_id: adminData.user.id,
        shop_id: shopId,
        role,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,shop_id" }
    );

    if (membershipError) {
      try { await admin.from("user_profiles").delete().eq("user_id", adminData.user.id); } catch {}
      try { await admin.auth.admin.deleteUser(adminData.user.id); } catch {}
      return { success: false, error: membershipError.message };
    }

    const normalizedPercentage = payModel === "fixed" ? 0 : percentageRate;
    const normalizedFixed = payModel === "percentage" ? 0 : fixedAmount;
    if (role === "staff") {
      const { data: newRule } = await admin.from("staff_compensation_rules").insert({
        shop_id: shopId,
        staff_user_id: adminData.user.id,
        model: normalizedFixed > 0 && normalizedPercentage > 0 ? "hybrid" : normalizedFixed > 0 ? "fixed" : "percentage",
        percentage_rate: normalizedPercentage,
        fixed_amount: normalizedFixed,
        overrides_enabled: overridesEnabled,
        starts_on: new Date().toISOString().slice(0, 10),
        ends_on: null,
        is_active: true,
      }).select("id").single();
      if (newRule && overrides.length > 0) {
        await admin.from("staff_commission_overrides").insert(
          overrides.map((o) => ({
            shop_id: shopId,
            compensation_rule_id: newRule.id,
            service_id: o.serviceId,
            percentage_rate: Math.min(100, Math.max(0, o.percentageRate)),
          }))
        );
      }
    }

    if (role === "staff") {
      await trackProductEvent(shopId, "first_staff_added", { metadata: { source: "new_user" } });
    }

    await revalidateDashboardSegments(shopId, ["/staff"]);
    return { success: true, data: { password, login_url: loginUrl } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al agregar personal" };
  }
}

export async function setupStaffAccount(
  token: string,
  password: string,
  name: string
): Promise<ActionResult<{ email: string }>> {
  try {
    const { verifyStaffInviteToken: verify } = await import("@/lib/dashboard/staff/staff-invite");
    const invite = verify(token);
    if (!invite) return { success: false, error: "Invitacion invalida o vencida" };

    const admin = await createAdminClient();

    const { data: users, error: listError } = await admin.auth.admin.listUsers();
    if (listError) return { success: false, error: listError.message };

    const user = users.users.find((u) => u.email?.toLowerCase() === invite.email);
    if (!user) return { success: false, error: "No encontramos una cuenta con ese email. Pedile al dueño que te invite de nuevo." };

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (updateError) return { success: false, error: updateError.message };

    await admin
      .from("user_profiles")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return { success: true, data: { email: invite.email } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al configurar la cuenta" };
  }
}

export async function updateStaffPayMode(
  id: string,
  input: { payModel: "percentage" | "fixed" | "mixed"; percentageRate: number; fixedAmount: number; overridesEnabled?: boolean; serviceOverrides?: { serviceId: string; percentageRate: number }[] },
  shopIdOverride?: string,
): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const ownerAccess = await requireOwnerAccessForShop(shopId);
    if (!ownerAccess.success) return ownerAccess;

    const admin = await createAdminClient();
    const percentage = input.payModel === "fixed" ? 0 : Math.max(0, Math.min(100, Number(input.percentageRate) || 0));
    const fixed = input.payModel === "percentage" ? 0 : Math.max(0, Number(input.fixedAmount) || 0);
    const today = new Date().toISOString().slice(0, 10);
    const overridesEnabled = Boolean(input.overridesEnabled);
    const serviceOverrides = input.serviceOverrides ?? [];

    await admin
      .from("staff_compensation_rules")
      .update({ ends_on: today, is_active: false, updated_at: new Date().toISOString() })
      .eq("shop_id", shopId)
      .eq("staff_user_id", id)
      .is("ends_on", null)
      .eq("is_active", true);

    const { data: newRule, error } = await admin.from("staff_compensation_rules").insert({
      shop_id: shopId,
      staff_user_id: id,
      model: fixed > 0 && percentage > 0 ? "hybrid" : fixed > 0 ? "fixed" : "percentage",
      percentage_rate: percentage,
      fixed_amount: fixed,
      overrides_enabled: overridesEnabled,
      starts_on: today,
      ends_on: null,
      is_active: true,
    }).select("id").single();

    if (error) return { success: false, error: error.message };

    if (newRule && overridesEnabled && serviceOverrides.length > 0) {
      const rows = serviceOverrides
        .filter((o) => o.percentageRate > 0)
        .map((o) => ({
          shop_id: shopId,
          compensation_rule_id: newRule.id,
          service_id: o.serviceId,
          percentage_rate: Math.min(100, Math.max(0, o.percentageRate)),
        }));
      if (rows.length > 0) {
        const { error: ovError } = await admin.from("staff_commission_overrides").insert(rows);
        if (ovError) return { success: false, error: ovError.message };
      }
    }

    await revalidateDashboardSegments(shopId, ["/staff", "/finances"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar modo de cobro" };
  }
}

export async function updateStaffRole(id: string, role: "staff" | "owner", shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const ownerAccess = await requireOwnerAccessForShop(shopId);
    if (!ownerAccess.success) return ownerAccess;

    const [supabase, admin] = await Promise.all([createServerClient(), createAdminClient()]);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id === id) {
      return { success: false, error: "No podés editar tu propio rol de administrador" };
    }

    const { error } = await admin
      .from("user_profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("user_id", id)
      .eq("shop_id", shopId);

    if (!error) {
      await admin
        .from("shop_memberships")
        .update({ role, updated_at: new Date().toISOString() })
        .eq("user_id", id)
        .eq("shop_id", shopId)
        .eq("is_active", true);
    }

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/staff"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar rol" };
  }
}

export async function updateStaffName(id: string, name: string, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const ownerAccess = await requireOwnerAccessForShop(shopId);
    if (!ownerAccess.success) return ownerAccess;

    const trimmed = name.trim();
    if (!trimmed) return { success: false, error: "El nombre no puede estar vacio" };

    const admin = await createAdminClient();
    const { error } = await admin
      .from("user_profiles")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("user_id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/staff", "/appointments", "/calendar"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar nombre" };
  }
}

export async function removeStaff(id: string, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const ownerAccess = await requireOwnerAccessForShop(shopId);
    if (!ownerAccess.success) return ownerAccess;

    const [supabase, admin] = await Promise.all([createServerClient(), createAdminClient()]);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id === id) {
      return { success: false, error: "No podés editar tu propio rol de administrador" };
    }

    const nowIso = new Date().toISOString();

    const { error: membershipError } = await admin
      .from("shop_memberships")
      .update({ is_active: false, updated_at: nowIso })
      .eq("user_id", id)
      .eq("shop_id", shopId);

    if (membershipError) return { success: false, error: membershipError.message };

    const { error: appointmentsError } = await admin
      .from("appointments")
      .update({ staff_id: null, updated_at: nowIso })
      .eq("shop_id", shopId)
      .eq("staff_id", id)
      .gte("start_time", nowIso)
      .in("status", ["scheduled", "confirmed", "in_progress"]);

    if (appointmentsError) return { success: false, error: appointmentsError.message };

    await revalidateDashboardSegments(shopId, ["/staff", "/appointments", "/calendar"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar personal" };
  }
}

export async function getServiceStaffIds(serviceId: string, shopIdOverride?: string): Promise<ActionResult<string[]>> {
  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("staff_services")
      .select("staff_id")
      .eq("service_id", serviceId);
    return { success: true, data: (data || []).map((r) => r.staff_id) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener personal del servicio" };
  }
}

export async function fetchStaffCommissionOverrides(
  ruleId: string,
  shopIdOverride?: string,
): Promise<ActionResult<{ service_id: string; percentage_rate: number }[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }
    const admin = await createAdminClient();
    const { data } = await admin
      .from("staff_commission_overrides")
      .select("service_id, percentage_rate")
      .eq("compensation_rule_id", ruleId);
    return { success: true, data: (data || []).map((r) => ({ service_id: r.service_id, percentage_rate: Number(r.percentage_rate || 0) })) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener comisiones por servicio" };
  }
}

export async function upsertStaffCommissionOverrides(
  ruleId: string,
  overrides: { serviceId: string; percentageRate: number }[],
  shopIdOverride?: string,
): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const ownerAccess = await requireOwnerAccessForShop(shopId);
    if (!ownerAccess.success) return ownerAccess;

    const admin = await createAdminClient();

    const { data: rule } = await admin
      .from("staff_compensation_rules")
      .select("id")
      .eq("id", ruleId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (!rule) return { success: false, error: "Regla de compensacion no encontrada" };

    const { error: deleteError } = await admin
      .from("staff_commission_overrides")
      .delete()
      .eq("compensation_rule_id", ruleId);
    if (deleteError) return { success: false, error: deleteError.message };

    if (overrides.length > 0) {
      const rows = overrides
        .filter((o) => o.percentageRate > 0)
        .map((o) => ({
          shop_id: shopId,
          compensation_rule_id: ruleId,
          service_id: o.serviceId,
          percentage_rate: Math.min(100, Math.max(0, o.percentageRate)),
        }));
      if (rows.length > 0) {
        const { error: insertError } = await admin.from("staff_commission_overrides").insert(rows);
        if (insertError) return { success: false, error: insertError.message };
      }
    }

    await revalidateDashboardSegments(shopId, ["/staff", "/finances"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar comisiones por servicio" };
  }
}

export async function getStaffSchedule(staffId: string, shopIdOverride?: string): Promise<ActionResult<{
  day_of_week: number;
  is_active: boolean;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
}[]>> {
  try {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("staff_schedules")
      .select("day_of_week, is_active, start_time, end_time, break_start, break_end")
      .eq("staff_id", staffId)
      .order("day_of_week", { ascending: true });
    return { success: true, data: (data || []).map((r) => ({
      ...r,
      start_time: r.start_time?.slice(0, 5),
      end_time: r.end_time?.slice(0, 5),
      break_start: r.break_start?.slice(0, 5) ?? null,
      break_end: r.break_end?.slice(0, 5) ?? null,
    })) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener horarios del personal" };
  }
}

export async function updateStaffSchedule(
  staffId: string,
  schedule: { day_of_week: number; is_active: boolean; start_time: string; end_time: string; break_start?: string | null; break_end?: string | null }[],
  shopIdOverride?: string,
): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const ownerAccess = await requireOwnerAccessForShop(shopId);
    if (!ownerAccess.success) return ownerAccess;

    const admin = await createAdminClient();

    const { data: memberships } = await admin
      .from("shop_memberships")
      .select("user_id")
      .eq("user_id", staffId)
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .maybeSingle();

    if (!memberships) return { success: false, error: "El empleado no pertenece a este local" };

    const rows = schedule.map((s) => ({
      staff_id: staffId,
      day_of_week: s.day_of_week,
      is_active: s.is_active,
      start_time: s.start_time,
      end_time: s.end_time,
      break_start: s.break_start || null,
      break_end: s.break_end || null,
      updated_at: new Date().toISOString(),
    }));

    for (const row of rows) {
      const { error } = await admin.from("staff_schedules").upsert(row, {
        onConflict: "staff_id,day_of_week",
        ignoreDuplicates: false,
      });
      if (error) return { success: false, error: error.message };
    }

    await revalidateDashboardSegments(shopId, ["/staff", "/calendar"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar horarios" };
  }
}

export async function getStaffProfile(staffId: string, shopIdOverride?: string): Promise<ActionResult<{
  description: string | null;
  photo_url: string | null;
  instagram: string | null;
  whatsapp: string | null;
} | null>> {
  try {
    const admin = await createAdminClient();
    if (shopIdOverride) {
      const { data: membership } = await admin
        .from("shop_memberships")
        .select("user_id")
        .eq("user_id", staffId)
        .eq("shop_id", shopIdOverride)
        .eq("is_active", true)
        .maybeSingle();
      if (!membership) return { success: false, error: "El empleado no pertenece a este local" };
    }
    const { data } = await admin
      .from("staff_profiles")
      .select("description, photo_url, instagram, whatsapp")
      .eq("user_id", staffId)
      .maybeSingle();
    return { success: true, data: data || { description: null, photo_url: null, instagram: null, whatsapp: null } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener perfil" };
  }
}

export async function updateStaffProfile(
  staffId: string,
  profile: { description?: string | null; photo_url?: string | null; instagram?: string | null; whatsapp?: string | null },
  shopIdOverride?: string,
): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const ownerAccess = await requireOwnerAccessForShop(shopId);
    if (!ownerAccess.success) return ownerAccess;

    const admin = await createAdminClient();

    const { data: membership } = await admin
      .from("shop_memberships")
      .select("user_id")
      .eq("user_id", staffId)
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership) return { success: false, error: "El empleado no pertenece a este local" };

    const { error } = await admin
      .from("staff_profiles")
      .upsert({
        user_id: staffId,
        description: profile.description ?? null,
        photo_url: profile.photo_url ?? null,
        instagram: profile.instagram ?? null,
        whatsapp: profile.whatsapp ?? null,
        updated_at: new Date().toISOString(),
      });

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/staff", "/book"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar perfil" };
  }
}
