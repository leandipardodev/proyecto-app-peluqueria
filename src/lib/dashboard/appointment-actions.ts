"use server";

import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import { createArgentinaDate } from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
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
  customers: { id: string; nombre: string | null; email: string; telefono: string | null } | null;
  staff: { user_id: string; name: string | null; email: string | null } | null;
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

    const [customersData, staffRpcData, servicesData] = await Promise.all([
      supabase.from("customers").select("id, nombre, email, telefono").eq("shop_id", shopId).in("id", customerIds),
      supabase.rpc("get_staff_for_my_shop"),
      supabase.from("services").select("id, name, price, duration_minutes").in("id", serviceIds),
    ]);

    const customersMap = new Map((customersData.data || []).map(c => [c.id, c]));
    const staffMap = buildStaffMapFromRpc((staffRpcData.data || []) as StaffRpcRow[], staffIds);
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
type StaffRpcRow = {
  user_id: string;
  role: string;
  name: string | null;
  nombre: string | null;
  email: string | null;
};

function buildStaffMapFromRpc(rows: StaffRpcRow[], staffIds: string[]) {
  const allowedIds = new Set(staffIds.filter(Boolean));
  return new Map(
    rows
      .filter((row) => (row.role === "owner" || row.role === "staff") && allowedIds.has(row.user_id))
      .map((row) => [
        row.user_id,
        { user_id: row.user_id, name: row.name ?? row.nombre ?? null, email: row.email ?? null },
      ])
  );
}

export async function fetchStaffMembers(): Promise<ActionResult<StaffMemberInfo[]>> {
  try {
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc("get_staff_for_my_shop");

    if (error) return { success: false, error: error.message };

    const rows = (data || []) as StaffRpcRow[];
    return {
      success: true,
      data: rows
        .filter((s) => s.role === "owner" || s.role === "staff")
        .map((s) => ({ id: s.user_id, role: s.role, name: s.name ?? s.nombre ?? null, email: s.email })),
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

    const supabase = await createServerClient();

    const { data: customerRow, error: customerInsertError } = await supabase
      .from("customers")
      .insert({
        shop_id: shopId,
        nombre: customerName,
        email: customerEmail,
        telefono: customerPhone || null,
      })
      .select("id")
      .single();

    if (customerInsertError || !customerRow?.id) {
      return { success: false, error: customerInsertError?.message || "No se pudo crear el cliente" };
    }

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
      customer_id: customerRow.id,
      staff_id: staffId || null,
      service_id: serviceId,
      start_time: startIso,
      end_time: endIso,
      date_key_ar: startDate.slice(0, 7),
      status: "scheduled",
      notes: notes || null,
    });

    if (aptError) return { success: false, error: aptError.message };

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
  customers: { id: string; nombre: string | null; email: string; telefono: string | null } | null;
  staff: { user_id: string; name: string | null } | null;
  services: { id: string; name: string; price: number } | null;
};

export async function fetchAllAppointmentsForTable(): Promise<ActionResult<AppointmentTableRow[]>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const admin = await createAdminClient();
    const supabase = await createServerClient();

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

    const [customersRes, staffRpcRes, servicesRes] = await Promise.all([
      customerIds.length > 0
        ? admin.from("customers").select("id, nombre, email, telefono").eq("shop_id", shopId).in("id", customerIds)
        : { data: [], error: null },
      staffIds.length > 0 ? supabase.rpc("get_staff_for_my_shop") : { data: [], error: null },
      serviceIds.length > 0
        ? admin.from("services").select("id, name, price").in("id", serviceIds)
        : { data: [], error: null },
    ]);

    const customerRows = (customersRes.data || []) as Array<{ id: string; nombre: string | null; email: string; telefono: string | null }>;
    const customerMap = new Map(customerRows.map((c) => [c.id, c]));
    const staffMap = new Map(
      Array.from(buildStaffMapFromRpc((staffRpcRes.data || []) as StaffRpcRow[], staffIds)).map(([userId, row]) => [
        userId,
        { user_id: row.user_id, name: row.name },
      ])
    );
    const serviceRows = (servicesRes.data || []) as Array<{ id: string; name: string; price: number }>;
    const serviceMap = new Map(serviceRows.map((s) => [s.id, s]));

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
