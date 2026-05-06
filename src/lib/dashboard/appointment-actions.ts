"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";

export async function fetchAppointments(startDate: string, endDate: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      id,
      customer_id,
      staff_id,
      service_id,
      start_time,
      end_time,
      status,
      is_paid,
      notes,
      customers!appointments_customer_id_fkey (name, email, phone),
      staff!appointments_staff_id_fkey (name, email),
      services!appointments_service_id_fkey (name, price, duration_minutes)
      `
    )
    .eq("shop_id", shopId)
    .gte("start_time", startDate)
    .lte("start_time", endDate)
    .order("start_time", { ascending: true })
    .returns<
      {
        id: string;
        customer_id: string;
        staff_id: string;
        service_id: string;
        start_time: string;
        end_time: string;
        status: string;
        is_paid: boolean;
        notes: string | null;
        customers: { name: string; email: string; phone: string | null } | null;
        staff: { name: string; email: string } | null;
        services: { name: string; price: number; duration_minutes: number } | null;
      }[]
    >();

  if (error) throw error;
  return data;
}

export async function fetchActiveServices() {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("services")
    .select("id, name, price, duration_minutes")
    .eq("shop_id", shopId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

export async function fetchStaffMembers() {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      `
      id,
      role,
      users!user_profiles_user_id_fkey (id, name, email)
      `
    )
    .eq("shop_id", shopId)
    .in("role", ["admin", "staff"])
    .order("created_at", { ascending: true })
    .returns<
      {
        id: string;
        role: string;
        users: { id: string; name: string | null; email: string | null } | null;
      }[]
    >();

  if (error) throw error;
  return data;
}

export async function createAppointment(formData: FormData) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const customerId = formData.get("customer_id") as string;
  const staffId = formData.get("staff_id") as string;
  const serviceId = formData.get("service_id") as string;
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;
  const notes = formData.get("notes") as string;

  if (!customerId || !staffId || !serviceId || !startTime || !endTime) {
    return { error: "Todos los campos obligatorios deben completarse" };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await supabase.from("appointments").insert({
    shop_id: shopId,
    customer_id: customerId,
    staff_id: staffId,
    service_id: serviceId,
    start_time: startTime,
    end_time: endTime,
    status: "scheduled",
    notes: notes || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/calendar");
  return { success: true };
}

export async function updateAppointmentStatus(
  id: string,
  status: string,
  isPaid?: boolean
) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const updates: Record<string, unknown> = { status };
  if (isPaid !== undefined) {
    updates.is_paid = isPaid;
  }

  const { error } = await supabase
    .from("appointments")
    .update(updates)
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/calendar");
  return { success: true };
}
