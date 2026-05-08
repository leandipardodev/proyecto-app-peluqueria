"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createServerClient as createSsrClient } from "@supabase/ssr";
import { revalidatePath } from "next/cache";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import "server-only";

function createAdminClient() {
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
    }
  );
}

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
      user_profiles!appointments_staff_id_fkey(name)
    `)
    .eq("customer_id", session.user.id)
    .eq("shop_id", shopId)
    .order("start_time", { ascending: false });

  if (error) throw new Error(error.message);

  return data.map((apt) => {
    const svc = Array.isArray(apt.services) ? apt.services[0] : apt.services;
    const stf = Array.isArray(apt.user_profiles) ? apt.user_profiles[0] : apt.user_profiles;
    return {
      id: apt.id,
      start_time: apt.start_time,
      end_time: apt.end_time,
      status: apt.status,
      is_paid: apt.is_paid,
      notes: apt.notes,
      service: svc
        ? {
            name: svc.name,
            price: svc.price,
            duration_minutes: svc.duration_minutes,
          }
        : null,
      staff: stf ? { name: stf.name } : null,
    };
  });
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
    .from("customers")
    .select("name, email, phone")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error) throw error;

  if (data) return data;

  const { data: fallback, error: fallbackError } = await supabase
    .from("user_profiles")
    .select("name, email")
    .eq("user_id", session.user.id)
    .single();

  if (fallbackError) throw fallbackError;
  return { name: fallback.name, email: fallback.email, phone: null };
}

// Update client profile
export async function updateClientProfile(formData: FormData) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;

  if (!name) {
    return { error: "El nombre es obligatorio" };
  }

  if (!phone) {
    return { error: "El teléfono es obligatorio para recibir recordatorios" };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("customers")
    .upsert({
      id: session.user.id,
      shop_id: shopId,
      name,
      phone,
      updated_at: new Date().toISOString(),
    });

  if (error) return { error: error.message };

  revalidatePath("/client/profile");
  return { success: true };
}

// Create appointment from client side
export async function createClientAppointment(formData: FormData) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const supabase = await createServerClient();

  const serviceId = formData.get("service_id") as string;
  const staffId = formData.get("staff_id") as string;
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;
  const notes = formData.get("notes") as string;
  const phone = formData.get("phone") as string;

  if (!serviceId || !startTime || !endTime) {
    return { error: "Todos los campos obligatorios deben completarse" };
  }

  // Ensure customer exists in customers table (FK requirement)
  const admin = createAdminClient();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("name")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const { error: customerError } = await admin.from("customers").upsert({
    id: session.user.id,
    shop_id: shopId,
    name: profile?.name || "Cliente",
    phone: phone || null,
    updated_at: new Date().toISOString(),
  });

  if (customerError) return { error: customerError.message };

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
    .in("role", ["owner", "staff"])
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

  // Get shop opening hours
  const { data: shop } = await supabase
    .from("shops")
    .select("opening_hours")
    .eq("id", shopId)
    .single();

  let startHour = 9;
  let startMinute = 0;
  let endHour = 18;
  let endMinute = 0;

  if (shop?.opening_hours) {
    try {
      const hours = typeof shop.opening_hours === "string"
        ? JSON.parse(shop.opening_hours)
        : shop.opening_hours;

      const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const dayIndex = new Date(date).getDay();
      const dayKey = dayMap[dayIndex];
      const dayHours = hours[dayKey];

      if (dayHours && dayHours !== "Cerrado") {
        const match = dayHours.match(/(\d+):(\d+)\s*-\s*(\d+):(\d+)/);
        if (match) {
          startHour = parseInt(match[1], 10);
          startMinute = parseInt(match[2], 10);
          endHour = parseInt(match[3], 10);
          endMinute = parseInt(match[4], 10);
        }
      }
    } catch {}
  }

  const dayStart = new Date(date + "T00:00:00.000Z");
  const dayEnd = new Date(date + "T23:59:59.999Z");

  const { data: appointments } = await supabase
    .from("appointments")
    .select("start_time, end_time")
    .eq("shop_id", shopId)
    .gte("start_time", dayStart.toISOString())
    .lte("start_time", dayEnd.toISOString())
    .not("status", "eq", "cancelled");

  const now = new Date();
  const slots = [];
  const slotDuration = service.duration_minutes;
  const endTotalMinutes = endHour * 60 + endMinute;

  for (let hour = startHour; hour <= endHour; hour++) {
    const minuteStart = hour === startHour ? startMinute : 0;
    const minuteEnd = hour === endHour ? endMinute : 60;

    for (let minute = minuteStart; minute < minuteEnd; minute += slotDuration) {
      const [y, m, d] = date.split("-").map(Number);
      const slotStart = new Date(y, m - 1, d, hour, minute, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

      if (slotStart < now) continue;

      const slotEndTotal = slotEnd.getHours() * 60 + slotEnd.getMinutes();
      if (slotEndTotal > endTotalMinutes) continue;

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
