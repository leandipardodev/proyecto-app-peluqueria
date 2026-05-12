"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import type { ActionResult } from "@/lib/types";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
}

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  revenue: number;
};

type StaffRpcRow = {
  user_id: string;
  role: string;
  name: string | null;
  nombre: string | null;
  email: string | null;
};

export async function fetchStaffMembers(): Promise<ActionResult<StaffMember[]>> {
  try {
    const supabase = await createServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: "SESION_EXPIRADA" };
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("shop_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError || !profile?.shop_id) {
      return { success: false, error: "SESION_EXPIRADA" };
    }

    const shopId = profile.shop_id;

    const { data, error } = await supabase.rpc("get_staff_for_my_shop");

    if (error) return { success: false, error: error.message };

    const staffRows = ((data || []) as StaffRpcRow[]).filter((member) => member.role === "owner" || member.role === "staff");

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

        return {
          id: member.user_id,
          name: member.name ?? member.nombre,
          email: member.email,
          role: member.role,
          revenue,
        };
      })
    );

    return { success: true, data: staffWithRevenue };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener personal" };
  }
}

export async function addStaffMember(formData: FormData): Promise<ActionResult<{ password: string }>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const role = formData.get("role") as "staff" | "owner";

    if (!name || !email || !role) {
      return { success: false, error: "Todos los campos son obligatorios" };
    }

    const supabase = await createServerClient();
    const admin = await createAdminClient();

    const { data: existingUser } = await admin
      .from("user_profiles")
      .select("user_id")
      .eq("email", email)
      .single();

    if (existingUser) {
      return { success: false, error: "Este email ya está registrado" };
    }

    const password = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);

    const { data: adminData, error: adminError } = await admin.auth.admin.createUser({
      email,
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

    revalidatePath("/dashboard/staff");
    return { success: true, data: { password } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al agregar personal" };
  }
}

export async function updateStaffRole(id: string, role: "staff" | "owner"): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id === id) {
      return { success: false, error: "No podés editar tu propio rol de administrador" };
    }

    const { error } = await supabase
      .from("user_profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("user_id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/staff");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar rol" };
  }
}

export async function removeStaff(id: string): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id === id) {
      return { success: false, error: "No podés editar tu propio rol de administrador" };
    }

    const { error } = await supabase
      .from("user_profiles")
      .delete()
      .eq("user_id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/staff");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar personal" };
  }
}
