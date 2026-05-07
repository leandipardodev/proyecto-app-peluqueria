"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import "server-only";

// Fetch shop by slug (public)
export async function fetchShopBySlug(slug: string) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("shops")
    .select("id, name, address, phone, opening_hours, google_maps_url, slug")
    .eq("slug", slug)
    .single();

  if (error) throw error;
  return data;
}

// Fetch active services for a shop (public)
export async function fetchPublicServices(shopId: string) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("services")
    .select("id, name, price, duration_minutes")
    .eq("shop_id", shopId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data;
}

// Fetch appointments for the logged-in client
export async function fetchClientAppointments() {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(`
      id,
      start_time,
      end_time,
      status,
      is_paid,
      notes,
      services!appointments_service_id_fkey(name, price, duration_minutes),
      staff!appointments_staff_id_fkey(name)
    `)
    .eq("customer_id", session.user.id)
    .eq("shop_id", shopId)
    .order("start_time", { ascending: false });

  if (error) throw error;

  return data.map((apt) => ({
    id: apt.id,
    start_time: apt.start_time,
    end_time: apt.end_time,
    status: apt.status,
    is_paid: apt.is_paid,
    notes: apt.notes,
    service: apt.services && apt.services.length > 0
      ? {
          name: apt.services[0].name,
          price: apt.services[0].price,
          duration_minutes: apt.services[0].duration_minutes,
        }
      : null,
    staff: apt.staff && apt.staff.length > 0 ? { name: apt.staff[0].name } : null,
  }));
}

// Cancel appointment (only if it belongs to the client)
export async function cancelClientAppointment(id: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  // First verify the appointment belongs to this client
  const { data: appointment, error: fetchError } = await supabase
    .from("appointments")
    .select("customer_id")
    .eq("id", id)
    .eq("shop_id", shopId)
    .single();

  if (fetchError || !appointment) {
    return { error: "Turno no encontrado" };
  }

  if (appointment.customer_id !== session.user.id) {
    return { error: "No tienes permiso para cancelar este turno" };
  }

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("customer_id", session.user.id);

  if (error) return { error: error.message };

  revalidatePath("/client/appointments");
  return { success: true };
}

// Fetch client profile
export async function fetchClientProfile() {
  const session = await getAuthSession();

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("name, email, phone")
    .eq("user_id", session.user.id)
    .single();

  if (error) throw error;
  return data;
}

// Update client profile
export async function updateClientProfile(formData: FormData) {
  const session = await getAuthSession();

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;

  if (!name) {
    return { error: "El nombre es obligatorio" };
  }

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("user_profiles")
    .update({ name, phone: phone || null })
    .eq("user_id", session.user.id);

  if (error) return { error: error.message };

  revalidatePath("/client/profile");
  return { success: true };
}

// Create appointment from client side
export async function createClientAppointment(formData: FormData) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const serviceId = formData.get("service_id") as string;
  const staffId = formData.get("staff_id") as string;
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;
  const notes = formData.get("notes") as string;

  if (!serviceId || !startTime || !endTime) {
    return { error: "Todos los campos obligatorios deben completarse" };
  }

  const supabase = await createServerClient();

  const { error } = await supabase.from("appointments").insert({
    shop_id: shopId,
    customer_id: session.user.id,
    staff_id: staffId || null,
    service_id: serviceId,
    start_time: startTime,
    end_time: endTime,
    status: "scheduled",
    notes: notes || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/client/appointments");
  return { success: true };
}

// Fetch staff members for a shop (public)
export async function fetchPublicStaff(shopId: string) {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id, name")
    .eq("shop_id", shopId)
    .in("role", ["admin", "staff"])
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

// Fetch available time slots for a given date and service
export async function fetchAvailableSlots(
  serviceId: string,
  date: string
) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  // Get service duration
  const { data: service } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("id", serviceId)
    .single();

  if (!service) return [];

  // Get all appointments for that day
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const { data: appointments } = await supabase
    .from("appointments")
    .select("start_time, end_time")
    .eq("shop_id", shopId)
    .gte("start_time", dayStart.toISOString())
    .lte("start_time", dayEnd.toISOString())
    .not("status", "eq", "cancelled");

  // Generate available slots (assuming 9 AM to 6 PM working hours)
  const slots = [];
  const startHour = 9;
  const endHour = 18;
  const slotDuration = service.duration_minutes;

  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += slotDuration) {
      if (hour === endHour && minute > 0) break;

      const slotStart = new Date(date);
      slotStart.setHours(hour, minute, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

      // Check if slot is in the past
      if (slotStart < new Date()) continue;

      // Check if slot extends beyond working hours
      if (slotEnd.getHours() > endHour) continue;

      // Check for conflicts
      const hasConflict = (appointments || []).some((apt) => {
        const aptStart = new Date(apt.start_time);
        const aptEnd = new Date(apt.end_time);
        return slotStart < aptEnd && slotEnd > aptStart;
      });

      if (!hasConflict) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          time: slotStart.toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
      }
    }
  }

  return slots;
}
