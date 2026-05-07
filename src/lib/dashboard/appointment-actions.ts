"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import "server-only";

export async function fetchAppointments(startDate: string, endDate: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(`
      id,
      customer_id,
      staff_id,
      service_id,
      start_time,
      end_time,
      status,
      is_paid,
      notes
    `)
    .eq("shop_id", shopId)
    .gte("start_time", startDate)
    .lte("start_time", endDate)
    .order("start_time", { ascending: true });

  if (error) throw error;

  const appointments = data || [];

  const customerIds = [...new Set(appointments.map(a => a.customer_id))];
  const staffIds = [...new Set(appointments.map(a => a.staff_id))];
  const serviceIds = [...new Set(appointments.map(a => a.service_id))];

  const [customersData, staffData, servicesData] = await Promise.all([
    supabase.from("user_profiles").select("user_id, name, email, phone").in("user_id", customerIds),
    supabase.from("user_profiles").select("user_id, name, email").in("user_id", staffIds),
    supabase.from("services").select("id, name, price, duration_minutes").in("id", serviceIds),
  ]);

  const customersMap = new Map((customersData.data || []).map(c => [c.user_id, c]));
  const staffMap = new Map((staffData.data || []).map(s => [s.user_id, s]));
  const servicesMap = new Map((servicesData.data || []).map(s => [s.id, s]));

  return appointments.map(apt => ({
    ...apt,
    customers: customersMap.get(apt.customer_id) || null,
    staff: staffMap.get(apt.staff_id) || null,
    services: servicesMap.get(apt.service_id) || null,
  })) as {
    id: string;
    customer_id: string;
    staff_id: string;
    service_id: string;
    start_time: string;
    end_time: string;
    status: string;
    is_paid: boolean;
    notes: string | null;
    customers: { user_id: string; name: string; email: string; phone: string | null } | null;
    staff: { user_id: string; name: string; email: string } | null;
    services: { id: string; name: string; price: number; duration_minutes: number } | null;
  }[];
}

export async function fetchActiveServices() {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

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

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("user_profiles")
    .select(`
      user_id,
      role,
      name,
      email
    `)
    .eq("shop_id", shopId)
    .in("role", ["owner", "staff"])
    .order("created_at", { ascending: true })
    .returns<
      {
        user_id: string;
        role: string;
        name: string | null;
        email: string | null;
      }[]
    >();

  if (error) throw error;
  return (data || []).map(s => ({ id: s.user_id, role: s.role, name: s.name, email: s.email }));
}

export async function createAppointment(formData: FormData) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const customerId = formData.get("customer_id") as string;
  const staffId = formData.get("staff_id") as string;
  const serviceId = formData.get("service_id") as string;
  const startDate = formData.get("start_date") as string;
  const startTime = formData.get("start_time") as string;
  const notes = formData.get("notes") as string;

  if (!customerId || !staffId || !serviceId || !startDate || !startTime) {
    return { error: "Todos los campos obligatorios deben completarse" };
  }

  const supabase = await createServerClient();

  const { data: service } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", serviceId)
    .single();

  if (!service) return { error: "Servicio no encontrado" };

  const startDateTime = new Date(`${startDate}T${startTime}:00`);
  const endDateTime = new Date(startDateTime.getTime() + service.duration_minutes * 60000);

  const { error } = await supabase.from("appointments").insert({
    shop_id: shopId,
    customer_id: customerId,
    staff_id: staffId,
    service_id: serviceId,
    start_time: startDateTime.toISOString(),
    end_time: endDateTime.toISOString(),
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

  const supabase = await createServerClient();

  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
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
