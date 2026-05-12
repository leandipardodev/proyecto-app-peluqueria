"use server";

import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireShopId } from "@/lib/dashboard/auth-server";
import { createArgentinaDate } from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
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

type AppointmentEnriched = {
  id: string;
  customer_id: string;
  staff_id: string;
  service_id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  notes: string | null;
  customers: { id: string; name: string; email: string; phone: string | null } | null;
  staff: { user_id: string; name: string; email: string } | null;
  services: { id: string; name: string; price: number; duration_minutes: number } | null;
};

export async function fetchAppointments(startDate: string, endDate: string): Promise<ActionResult<AppointmentEnriched[]>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("appointments")
      .select("id, customer_id, staff_id, service_id, start_time, end_time, status, is_paid, notes")
      .eq("shop_id", shopId)
      .gte("start_time", startDate)
      .lte("start_time", endDate)
      .order("start_time", { ascending: true });

    if (error) return { success: false, error: error.message };

    const appointments = data || [];

    const customerIds = [...new Set(appointments.map(a => a.customer_id))];
    const staffIds = [...new Set(appointments.map(a => a.staff_id))];
    const serviceIds = [...new Set(appointments.map(a => a.service_id))];

    const [customersData, staffData, servicesData] = await Promise.all([
      supabase.from("customers").select("id, name, email, phone").in("id", customerIds),
      supabase.from("user_profiles").select("user_id, name, email").in("user_id", staffIds),
      supabase.from("services").select("id, name, price, duration_minutes").in("id", serviceIds),
    ]);

    const customersMap = new Map((customersData.data || []).map(c => [c.id, c]));
    const staffMap = new Map((staffData.data || []).map(s => [s.user_id, s]));
    const servicesMap = new Map((servicesData.data || []).map(s => [s.id, s]));

    const enriched = appointments.map(apt => ({
      ...apt,
      customers: customersMap.get(apt.customer_id) || null,
      staff: staffMap.get(apt.staff_id) || null,
      services: servicesMap.get(apt.service_id) || null,
    })) as AppointmentEnriched[];

    return { success: true, data: enriched };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener turnos" };
  }
}

type ServiceInfo = { id: string; name: string; price: number; duration_minutes: number };

export async function fetchActiveServices(): Promise<ActionResult<ServiceInfo[]>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

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

function toArgentinaStartEnd(dateStr: string, timeStr: string, durationMinutes: number): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  const start = createArgentinaDate(y, m, d, h, min);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return { start, end };
}

type StaffMemberInfo = { id: string; role: string; name: string | null; email: string | null };

export async function fetchStaffMembers(): Promise<ActionResult<StaffMemberInfo[]>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("user_profiles")
      .select("user_id, role, name, email")
      .eq("shop_id", shopId)
      .in("role", ["owner", "staff"])
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: (data || []).map(s => ({ id: s.user_id, role: s.role, name: s.name, email: s.email })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener personal" };
  }
}

export async function createAppointment(formData: FormData): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const customerId = formData.get("customer_id") as string;
    const staffId = formData.get("staff_id") as string;
    const serviceId = formData.get("service_id") as string;
    const startDate = formData.get("start_date") as string;
    const startTime = formData.get("start_time") as string;
    const notes = formData.get("notes") as string;

    if (!customerId || !staffId || !serviceId || !startDate || !startTime) {
      return { success: false, error: "Todos los campos obligatorios deben completarse" };
    }

    const supabase = await createServerClient();

    const { data: service } = await supabase
      .from("services")
      .select("duration_minutes")
      .eq("id", serviceId)
      .single();

    if (!service) return { success: false, error: "Servicio no encontrado" };

    const { start, end } = toArgentinaStartEnd(startDate, startTime, service.duration_minutes);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const { data: conflict } = await supabase
      .from("appointments")
      .select("id")
      .eq("shop_id", shopId)
      .eq("staff_id", staffId)
      .not("status", "eq", "cancelled")
      .gte("end_time", startIso)
      .lte("start_time", endIso)
      .maybeSingle();

    if (conflict) return { success: false, error: "slot_taken" };

    const { error } = await supabase.from("appointments").insert({
      shop_id: shopId,
      customer_id: customerId,
      staff_id: staffId,
      service_id: serviceId,
      start_time: startIso,
      end_time: endIso,
      date_key_ar: startDate.slice(0, 7),
      status: "scheduled",
      notes: notes || null,
    });

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear turno" };
  }
}

export async function createCustomerAndAppointment(formData: FormData): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const customerName = formData.get("customer_name") as string;
    const customerEmail = formData.get("customer_email") as string;
    const customerPhone = formData.get("customer_phone") as string;
    const staffId = formData.get("staff_id") as string;
    const serviceId = formData.get("service_id") as string;
    const startDate = formData.get("start_date") as string;
    const startTime = formData.get("start_time") as string;
    const notes = formData.get("notes") as string;

    if (!customerName || !customerEmail || !serviceId || !startDate || !startTime) {
      return { success: false, error: "Nombre, email, servicio, fecha y hora son obligatorios" };
    }

    const admin = createAdminClient();
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: customerEmail,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: customerName },
    });

    if (authError) return { success: false, error: authError.message };
    if (!authData.user) return { success: false, error: "No se pudo crear el usuario" };

    const { error: customerInsertError } = await admin
      .from("customers")
      .insert({ id: authData.user.id, shop_id: shopId, name: customerName, email: customerEmail, phone: customerPhone || null });

    if (customerInsertError) {
      try { await admin.auth.admin.deleteUser(authData.user.id); } catch {}
      return { success: false, error: customerInsertError.message };
    }

    const { error: profileError } = await admin
      .from("user_profiles")
      .insert({ user_id: authData.user.id, shop_id: shopId, name: customerName, email: customerEmail, role: "customer" });

    if (profileError) {
      try { await admin.from("customers").delete().eq("id", authData.user.id); } catch {}
      try { await admin.auth.admin.deleteUser(authData.user.id); } catch {}
      return { success: false, error: profileError.message };
    }

    const supabase = await createServerClient();
    const { data: service } = await supabase
      .from("services")
      .select("duration_minutes")
      .eq("id", serviceId)
      .single();

    if (!service) return { success: false, error: "Servicio no encontrado" };

    const { start, end } = toArgentinaStartEnd(startDate, startTime, service.duration_minutes);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    if (staffId) {
      const { data: conflict } = await supabase
        .from("appointments")
        .select("id")
        .eq("shop_id", shopId)
        .eq("staff_id", staffId)
        .not("status", "eq", "cancelled")
        .gte("end_time", startIso)
        .lte("start_time", endIso)
        .maybeSingle();

      if (conflict) return { success: false, error: "slot_taken" };
    }

    const { error: aptError } = await supabase.from("appointments").insert({
      shop_id: shopId,
      customer_id: authData.user.id,
      staff_id: staffId || null,
      service_id: serviceId,
      start_time: startIso,
      end_time: endIso,
      date_key_ar: startDate.slice(0, 7),
      status: "scheduled",
      notes: notes || null,
    });

    if (aptError) {
      try { await admin.from("customers").delete().eq("id", authData.user.id); } catch {}
      try { await admin.from("user_profiles").delete().eq("user_id", authData.user.id); } catch {}
      try { await admin.auth.admin.deleteUser(authData.user.id); } catch {}
      return { success: false, error: aptError.message };
    }

    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear turno y cliente" };
  }
}

type AppointmentTableRow = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  is_paid: boolean;
  customers: { id: string; name: string; email: string; phone: string | null } | null;
  staff: { user_id: string; name: string } | null;
  services: { id: string; name: string; price: number } | null;
};

export async function fetchAllAppointmentsForTable(): Promise<ActionResult<AppointmentTableRow[]>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const admin = createAdminClient();

    const { data: appointments, error: aptError } = await admin
      .from("appointments")
      .select("id, start_time, end_time, status, is_paid, customer_id, staff_id, service_id")
      .eq("shop_id", shopId)
      .order("start_time", { ascending: true });

    if (aptError) {
      console.error("[fetchAllAppointmentsForTable] appointments error:", aptError);
      return { success: false, error: aptError.message };
    }

    const customerIds = [...new Set((appointments || []).map(a => a.customer_id).filter(Boolean))];
    const staffIds = [...new Set((appointments || []).map(a => a.staff_id).filter(Boolean))];
    const serviceIds = [...new Set((appointments || []).map(a => a.service_id).filter(Boolean))];

    const [customersRes, staffRes, servicesRes] = await Promise.all([
      customerIds.length > 0
        ? admin.from("customers").select("id, name, email, phone").in("id", customerIds)
        : { data: [], error: null },
      staffIds.length > 0
        ? admin.from("user_profiles").select("user_id, name").in("user_id", staffIds)
        : { data: [], error: null },
      serviceIds.length > 0
        ? admin.from("services").select("id, name, price").in("id", serviceIds)
        : { data: [], error: null },
    ]);

    const customerMap = new Map((customersRes.data || []).map(c => [c.id, c]));
    const staffMap = new Map((staffRes.data || []).map(s => [s.user_id, s]));
    const serviceMap = new Map((servicesRes.data || []).map(s => [s.id, s]));

    const rows = (appointments || []).map(apt => ({
      id: apt.id,
      start_time: apt.start_time,
      end_time: apt.end_time,
      status: apt.status,
      is_paid: apt.is_paid,
      customers: customerMap.get(apt.customer_id) || null,
      staff: staffMap.get(apt.staff_id) || null,
      services: serviceMap.get(apt.service_id) || null,
    }));

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener turnos" };
  }
}

export async function updateAppointmentStatus(
  id: string,
  status: string,
  isPaid?: boolean
): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

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

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al actualizar turno" };
  }
}

export async function deleteAppointment(id: string): Promise<ActionResult> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const supabase = await createServerClient();

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/appointments");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar turno" };
  }
}
