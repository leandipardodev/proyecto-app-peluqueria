"use server";

import { createServerClient } from "@/lib/supabase/server";
import { requireShopId } from "@/lib/dashboard/auth-server";
import { getArgentinaNow } from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import { type AppointmentEnriched, type ServiceInfo, type StaffMemberInfo, type AppointmentTableRow, type StaffRpcRow, createAdminClient, fetchOperationalStaffByShopId, buildStaffMapFromRpc } from "./appointment-shared";
import "server-only";

export async function fetchAppointments(startDate: string, endDate: string, shopIdOverride?: string): Promise<ActionResult<AppointmentEnriched[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("appointments")
      .select("id, customer_id, staff_id, service_id, start_time, end_time, status, is_paid, deposit_amount, loyalty_reward_applied, loyalty_discount_percent_applied, notes")
      .eq("shop_id", shopId)
      .gte("start_time", startDate)
      .lte("start_time", endDate)
      .order("start_time", { ascending: true });

    if (error) return { success: false, error: error.message };

    const appointments = data || [];

    const customerIds = [...new Set(appointments.map(a => a.customer_id))];
    const staffIds = [...new Set(appointments.map(a => a.staff_id))];
    const serviceIds = [...new Set(appointments.map(a => a.service_id))];

    const admin = await createAdminClient();

    const [customersData, staffRows, servicesData] = await Promise.all([
      supabase.from("customers").select("id, nombre, email, telefono, loyalty_rewards_available").eq("shop_id", shopId).in("id", customerIds),
      fetchOperationalStaffByShopId(shopId),
      admin.from("services").select("id, name, price, duration_minutes").eq("shop_id", shopId).in("id", serviceIds),
    ]);

    const customersMap = new Map((customersData.data || []).map(c => [c.id, c]));
    const staffMap = buildStaffMapFromRpc(staffRows as StaffRpcRow[], staffIds);
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

export async function fetchActiveServices(shopIdOverride?: string): Promise<ActionResult<ServiceInfo[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

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

export async function fetchStaffMembers(shopIdOverride?: string): Promise<ActionResult<StaffMemberInfo[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }
    const rows = await fetchOperationalStaffByShopId(shopId);

    return {
      success: true,
      data: rows
        .filter((s) => s.role === "owner" || s.role === "staff" || s.role === "admin")
        .map((s) => ({ id: s.user_id, role: s.role, name: s.name ?? s.nombre ?? null, email: s.email })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener personal" };
  }
}

export async function fetchAllAppointmentsForTable(
  shopIdOverride?: string,
  options?: { limit?: number; upcomingOnly?: boolean }
): Promise<ActionResult<AppointmentTableRow[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();

    const limit = options?.limit;
    const upcomingOnly = options?.upcomingOnly === true;
    let appointmentsQuery = admin
      .from("appointments")
      .select("id, start_time, end_time, status, is_paid, deposit_amount, loyalty_reward_applied, loyalty_discount_percent_applied, customer_id, staff_id, service_id")
      .eq("shop_id", shopId)
      .order("start_time", { ascending: true });

    if (upcomingOnly) {
      appointmentsQuery = appointmentsQuery.gte("start_time", getArgentinaNow().toISOString());
    }

    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
      appointmentsQuery = appointmentsQuery.limit(Math.floor(limit));
    }

    const { data: appointments, error: aptError } = await appointmentsQuery;

    if (aptError) {
      console.error("[fetchAllAppointmentsForTable] appointments error:", aptError);
      return { success: false, error: aptError.message };
    }

    const customerIds = [...new Set((appointments || []).map(a => a.customer_id).filter(Boolean))];
    const staffIds = [...new Set((appointments || []).map(a => a.staff_id).filter(Boolean))];
    const serviceIds = [...new Set((appointments || []).map(a => a.service_id).filter(Boolean))];

    const [customersRes, staffRows, servicesRes] = await Promise.all([
      customerIds.length > 0
        ? admin.from("customers").select("id, nombre, email, telefono, loyalty_rewards_available").eq("shop_id", shopId).in("id", customerIds)
        : { data: [], error: null },
      staffIds.length > 0 ? fetchOperationalStaffByShopId(shopId) : Promise.resolve([] as StaffRpcRow[]),
      serviceIds.length > 0
        ? admin.from("services").select("id, name, price").in("id", serviceIds)
        : { data: [], error: null },
    ]);

    const customerRows = (customersRes.data || []) as Array<{ id: string; nombre: string | null; email: string; telefono: string | null; loyalty_rewards_available?: number | null }>;
    const customerMap = new Map(customerRows.map((c) => [c.id, c]));
    const staffMap = new Map(
      Array.from(buildStaffMapFromRpc(staffRows as StaffRpcRow[], staffIds)).map(([userId, row]) => [
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
      deposit_amount: apt.deposit_amount,
      loyalty_reward_applied: apt.loyalty_reward_applied,
      loyalty_discount_percent_applied: apt.loyalty_discount_percent_applied,
      customers: customerMap.get(apt.customer_id) || null,
      staff: staffMap.get(apt.staff_id) || null,
      services: serviceMap.get(apt.service_id) || null,
    }));

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener turnos" };
  }
}
