"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";

export async function fetchStaffMembers() {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("user_profiles")
    .select(`
      user_id,
      name,
      email,
      role,
      created_at
    `)
    .eq("shop_id", shopId)
    .in("role", ["admin", "staff"])
    .order("created_at", { ascending: false });

  if (error) throw error;

  const staffWithRevenue = await Promise.all(
    (data || []).map(async (member) => {
      const { data: revenueData } = await supabase
        .from("appointments")
        .select(`
          is_paid,
          status,
          services!appointments_service_id_fkey(price)
        `)
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

  return staffWithRevenue;
}

export async function addStaffMember(formData: FormData) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const role = formData.get("role") as "staff" | "admin";

  if (!name || !email || !role) {
    return { error: "Todos los campos son obligatorios" };
  }

  const supabase = await createServerClient();

  const { data: existingUser } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("email", email)
    .single();

  if (existingUser) {
    return { error: "Este email ya está registrado" };
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8),
    email_confirm: true,
    user_metadata: { name },
  });

  if (authError) return { error: authError.message };

  const { error } = await supabase.from("user_profiles").insert({
    user_id: authUser.user.id,
    shop_id: shopId,
    name,
    email,
    role,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/staff");
  return { success: true };
}

export async function updateStaffRole(id: string, role: "staff" | "admin") {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("user_profiles")
    .update({ role })
    .eq("user_id", id)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/staff");
  return { success: true };
}

export async function removeStaff(id: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("user_profiles")
    .delete()
    .eq("user_id", id)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/staff");
  return { success: true };
}
