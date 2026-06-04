"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient, getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import { getArgentinaDateKey } from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
}

type ShopInfo = { id: string; name: string; address: string | null; phone: string | null; business_hours: unknown; google_maps_url: string | null; slug: string };

export async function fetchShopBySlug(slug: string): Promise<ActionResult<ShopInfo>> {
  try {
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("shops")
      .select("id, nombre, address, phone, business_hours, google_maps_url, slug")
      .eq("slug", slug)
      .single();

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: {
        id: data.id,
        name: data.nombre,
        address: data.address,
        phone: data.phone,
        business_hours: data.business_hours,
        google_maps_url: data.google_maps_url,
        slug: data.slug,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener local" };
  }
}

type PublicService = { id: string; name: string; price: number; duration_minutes: number };

export async function fetchPublicServices(shopId: string): Promise<ActionResult<PublicService[]>> {
  try {
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("services")
      .select("id, name, price, duration_minutes")
      .eq("shop_id", shopId)
      .order("name", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener servicios" };
  }
}

type ClientAppointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  notes: string | null;
  service: { name: string; price: number; duration_minutes: number } | null;
  staff: { name: string } | null;
};

export async function fetchClientAppointments(): Promise<ActionResult<ClientAppointment[]>> {
  try {
    const session = await getAuthSession();
    if (!session) return { success: false, error: "SESION_EXPIRADA" };
    const shopId = await getShopId(session);
    if (!shopId) return { success: false, error: "SESION_EXPIRADA" };

    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, status, is_paid, notes, services!appointments_service_id_fkey(name, price, duration_minutes), user_profiles!appointments_staff_id_fkey(name)")
      .eq("customer_id", session.user.id)
      .order("start_time", { ascending: false });

    if (error) return { success: false, error: error.message };

    const mapped = (data || []).map((apt: Record<string, unknown>) => {
      const svc = Array.isArray(apt.services) ? apt.services[0] : apt.services;
      const stf = Array.isArray(apt.user_profiles) ? apt.user_profiles[0] : apt.user_profiles;
      return {
        id: apt.id as string,
        start_time: apt.start_time as string,
        end_time: apt.end_time as string,
        status: apt.status as string,
        is_paid: apt.is_paid as boolean,
        notes: (apt.notes as string) || null,
        service: svc ? { name: (svc as { name: string }).name, price: (svc as { price: number }).price, duration_minutes: (svc as { duration_minutes: number }).duration_minutes } : null,
        staff: stf ? { name: (stf as { name: string }).name } : null,
      };
    });

    return { success: true, data: mapped };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener turnos" };
  }
}

export async function cancelClientAppointment(id: string): Promise<ActionResult> {
  try {
    const session = await getAuthSession();
    if (!session) return { success: false, error: "SESION_EXPIRADA" };
    const shopId = await getShopId(session);
    if (!shopId) return { success: false, error: "SESION_EXPIRADA" };

    const supabase = await createServerClient();

    const { data: appointment, error: fetchError } = await supabase
      .from("appointments")
      .select("customer_id")
      .eq("id", id)
      .single();

    if (fetchError || !appointment) {
      return { success: false, error: "Turno no encontrado" };
    }

    if (appointment.customer_id !== session.user.id) {
      return { success: false, error: "No tienes permiso para cancelar este turno" };
    }

    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("customer_id", session.user.id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/client/appointments");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cancelar turno" };
  }
}

type ClientProfile = { nombre: string | null; email: string | null; telefono: string | null };

export async function fetchClientProfile(): Promise<ActionResult<ClientProfile>> {
  try {
    const session = await getAuthSession();
    if (!session) return { success: false, error: "SESION_EXPIRADA" };
    const shopId = await getShopId(session);
    if (!shopId) return { success: false, error: "SESION_EXPIRADA" };

    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("customers")
      .select("nombre, email, telefono")
      .eq("id", session.user.id)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };

    if (data) return { success: true, data };

    const { data: fallback, error: fallbackError } = await supabase
      .from("user_profiles")
      .select("name, email")
      .eq("user_id", session.user.id)
      .single();

    if (fallbackError) return { success: false, error: fallbackError.message };
    return { success: true, data: { nombre: fallback.name, email: fallback.email, telefono: null } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener perfil" };
  }
}

export async function updateClientProfile(formData: FormData): Promise<ActionResult> {
  try {
    const session = await getAuthSession();
    if (!session) return { success: false, error: "SESION_EXPIRADA" };
    const shopId = await getShopId(session);
    if (!shopId) return { success: false, error: "SESION_EXPIRADA" };

    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;

    if (!name) {
      return { success: false, error: "El nombre es obligatorio" };
    }

    if (!phone) {
      return { success: false, error: "El teléfono es obligatorio para recibir recordatorios" };
    }

    const admin = await createAdminClient();

    const { error } = await admin
      .from("customers")
      .upsert({
        id: session.user.id,
        user_id: session.user.id,
        shop_id: shopId,
        nombre: name,
        telefono: phone,
        updated_at: new Date().toISOString(),
      });

    if (error) return { success: false, error: error.message };

    revalidatePath("/client/profile");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar perfil" };
  }
}

export async function createClientAppointment(formData: FormData): Promise<ActionResult> {
  try {
    const session = await getAuthSession();
    if (!session) return { success: false, error: "SESION_EXPIRADA" };
    const shopId = await getShopId(session);
    if (!shopId) return { success: false, error: "SESION_EXPIRADA" };

    const supabase = await createServerClient();

    const serviceId = formData.get("service_id") as string;
    const serviceIdsRaw = formData.get("service_ids") as string | null;
    const staffId = formData.get("staff_id") as string;
    const startTime = formData.get("start_time") as string;
    const endTime = formData.get("end_time") as string;
    const notes = formData.get("notes") as string;
    const phone = formData.get("phone") as string;
    const isPaid = formData.get("is_paid") === "true";

    if ((!serviceId && !serviceIdsRaw) || !startTime || !endTime) {
      return { success: false, error: "Todos los campos obligatorios deben completarse" };
    }

    const startDate = new Date(startTime);

    const admin = await createAdminClient();

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("name")
      .eq("user_id", session.user.id)
      .maybeSingle();

    const { error: customerError } = await admin.from("customers").upsert({
      id: session.user.id,
      user_id: session.user.id,
      shop_id: shopId,
      nombre: profile?.name || "Cliente",
      telefono: phone || null,
      updated_at: startDate.toISOString(),
    });

    if (customerError) return { success: false, error: customerError.message };

    const parsedServiceIds = serviceIdsRaw
      ? serviceIdsRaw.split(",").map((id) => id.trim()).filter(Boolean)
      : [];

    const serviceIds = parsedServiceIds.length > 0 ? parsedServiceIds : [serviceId];

    const { data: serviceRows, error: durationError } = await supabase
      .from("services")
      .select("id, duration_minutes, price")
      .in("id", serviceIds);

    if (durationError) return { success: false, error: durationError.message };

    const serviceMap = new Map((serviceRows || []).map((s) => [s.id, { duration: s.duration_minutes, price: s.price }]));
    const missingServiceId = serviceIds.find((id) => !serviceMap.has(id));
    if (missingServiceId) {
      return { success: false, error: "Uno de los servicios seleccionados no existe" };
    }

    let currentStart = new Date(startDate);
    const payload = serviceIds.map((id, index) => {
      const svc = serviceMap.get(id)!;
      const duration = svc.duration;
      const currentEnd = new Date(currentStart.getTime() + duration * 60000);
      const appointment = {
        shop_id: shopId,
        customer_id: session.user.id,
        staff_id: staffId || null,
        service_id: id,
        service_price: svc.price ?? null,
        start_time: currentStart.toISOString(),
        end_time: currentEnd.toISOString(),
        date_key_ar: getArgentinaDateKey(currentStart.toISOString()),
        status: "scheduled",
        is_paid: isPaid,
        notes: index === 0 ? notes || null : null,
      };
      currentStart = currentEnd;
      return appointment;
    });

    const { error } = await supabase.from("appointments").insert(payload);

    if (error) return { success: false, error: error.message };

    revalidatePath("/client/appointments");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear turno" };
  }
}

type PublicStaffMember = { user_id: string; name: string | null };

export async function fetchPublicStaff(shopId: string): Promise<ActionResult<PublicStaffMember[]>> {
  try {
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("user_profiles")
      .select("user_id, name")
      .eq("shop_id", shopId)
      .in("role", ["owner", "staff"])
      .order("name", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener personal" };
  }
}
