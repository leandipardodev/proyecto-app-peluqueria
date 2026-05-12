"use server";

import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireShopId } from "@/lib/dashboard/auth-server";
import type { ActionResult } from "@/lib/types";
import "server-only";

function createAdminClient() {
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll() { return []; }, setAll() {} },
    }
  );
}

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  revenue: number;
};

export async function fetchStaffMembers(): Promise<ActionResult<StaffMember[]>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("user_profiles")
      .select("user_id, name, email, role")
      .eq("shop_id", shopId)
      .in("role", ["owner", "staff"])
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const staffWithRevenue = await Promise.all(
      (data || []).map(async (member) => {
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
          name: member.name,
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

    const { data: existingUser } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("email", email)
      .single();

    if (existingUser) {
      return { success: false, error: "Este email ya está registrado" };
    }

    const admin = createAdminClient();
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

    const { error } = await supabase.from("user_profiles").insert({
      user_id: adminData.user.id,
      shop_id: shopId,
      name,
      email,
      role,
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
