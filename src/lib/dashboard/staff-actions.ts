"use server";

import crypto from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { revalidateDashboardSegments } from "@/lib/dashboard/revalidate-dashboard";
import { createStaffInviteToken } from "@/lib/dashboard/staff-invite";
import type { ActionResult } from "@/lib/types";
import { sendEmailWithResend } from "@/lib/email/resend";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
}

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

async function sendStaffInviteEmail(params: {
  to: string;
  name: string;
  role: "staff" | "owner";
}): Promise<void> {
  const loginUrl = "https://klip.com.ar/login";
  const roleLabel = params.role === "owner" ? "Owner" : "Staff";

  await sendEmailWithResend({
    to: params.to,
    subject: `Invitacion a Klip (${roleLabel})`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
        <h1 style="font-size:22px;margin:0 0 12px;">Te invitaron a Klip</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 8px;">Hola ${params.name}, ya tenes acceso como ${roleLabel}.</p>
        <p style="margin:22px 0;">
          <a href="${loginUrl}" style="background:#111827;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block;">Ingresar a Klip</a>
        </p>
        <p style="font-size:13px;color:#6b7280;">Si no esperabas este correo, ignoralo.</p>
      </div>
    `,
  });
}

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  revenue: number;
  payModel: "percentage" | "fixed" | "mixed";
  percentageRate: number;
  fixedAmount: number;
};

type StaffRpcRow = {
  user_id: string;
  role: string;
  name: string | null;
  nombre: string | null;
  email: string | null;
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

    const [supabase, admin] = await Promise.all([createServerClient(), createAdminClient()]);

    const { data: memberships, error: membershipsError } = await admin
      .from("shop_memberships")
      .select("user_id, role")
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
    const { data: rules } = await admin
      .from("staff_compensation_rules")
      .select("staff_user_id, percentage_rate, fixed_amount")
      .eq("shop_id", shopId);
    const ruleMap = new Map((rules || []).map((r) => [r.staff_user_id as string, r]));
    const staffRows: StaffRpcRow[] = (memberships || []).map((m) => {
      const profile = profileMap.get(m.user_id);
      return {
        user_id: m.user_id,
        role: m.role,
        name: profile?.name || null,
        nombre: profile?.name || null,
        email: profile?.email || null,
      };
    });

    const staffWithRevenue = await Promise.all(
      staffRows.map(async (member) => {
        const { data: revenueData } = await supabase
          .from("appointments")
          .select("is_paid, status, services!appointments_service_id_fkey(price)")
          .eq("shop_id", shopId)
          .eq("staff_id", member.user_id)
          .eq("status", "completed")
          .eq("is_paid", true);

        const revenue = (revenueData || []).reduce((sum, apt) => {
          return sum + (apt.services?.[0]?.price || 0);
        }, 0);
        const rule = ruleMap.get(member.user_id);
        const percentageRate = Number(rule?.percentage_rate || 0);
        const fixedAmount = Number(rule?.fixed_amount || 0);
        const payModel: StaffMember["payModel"] = fixedAmount > 0 && percentageRate > 0 ? "mixed" : fixedAmount > 0 ? "fixed" : "percentage";

        return {
          id: member.user_id,
          name: member.name ?? member.nombre,
          email: member.email,
          role: member.role,
          revenue,
          payModel,
          percentageRate,
          fixedAmount,
        };
      })
    );

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
        await admin.from("staff_compensation_rules").upsert(
          {
            shop_id: shopId,
            staff_user_id: existingUser.user_id,
            model: normalizedFixed > 0 && normalizedPercentage > 0 ? "fixed_plus_percentage" : "percentage",
            percentage_rate: normalizedPercentage,
            fixed_amount: normalizedFixed,
            active_from: new Date().toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "shop_id,staff_user_id,active_from" },
        );
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

      try {
        await sendStaffInviteEmail({ to: normalizedEmail, name, role });
      } catch (mailError) {
        console.error("[addStaffMember] invite email error:", mailError);
      }

      if (role === "staff") {
        await trackProductEvent(shopId, "first_staff_added", { metadata: { source: "existing_user" } });
      }

      await revalidateDashboardSegments(shopId, ["/staff"]);
      return { success: true, data: { login_url: loginUrl } };
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
      email,
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
      await admin.from("staff_compensation_rules").insert({
        shop_id: shopId,
        staff_user_id: adminData.user.id,
        model: normalizedFixed > 0 && normalizedPercentage > 0 ? "fixed_plus_percentage" : "percentage",
        percentage_rate: normalizedPercentage,
        fixed_amount: normalizedFixed,
        active_from: new Date().toISOString().slice(0, 10),
      });
    }

    try {
      await sendStaffInviteEmail({ to: normalizedEmail, name, role });
    } catch (mailError) {
      console.error("[addStaffMember] invite email error:", mailError);
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

export async function updateStaffPayMode(
  id: string,
  input: { payModel: "percentage" | "fixed" | "mixed"; percentageRate: number; fixedAmount: number },
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

    const { error } = await admin.from("staff_compensation_rules").upsert(
      {
        shop_id: shopId,
        staff_user_id: id,
        model: fixed > 0 && percentage > 0 ? "fixed_plus_percentage" : "percentage",
        percentage_rate: percentage,
        fixed_amount: fixed,
        active_from: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop_id,staff_user_id,active_from" },
    );

    if (error) return { success: false, error: error.message };
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
