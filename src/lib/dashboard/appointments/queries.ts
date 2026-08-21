import { createServerClient } from "@/lib/supabase/server";
import { requireShopId } from "@/lib/dashboard/auth/server";
import { getArgentinaNow } from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import { type AppointmentEnriched, type ServiceInfo, type StaffMemberInfo, type AppointmentTableRow, type StaffRpcRow, createAdminClient, fetchOperationalStaffByShopId, buildStaffMapFromRpc } from "./shared";
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
      .select("id, customer_id, staff_id, service_id, custom_service_name, custom_service_duration, start_time, end_time, status, is_paid, was_pending_payment, deposit_amount, loyalty_reward_applied, loyalty_discount_percent_applied, recurring_group_id, notes")
      .eq("shop_id", shopId)
      .gte("start_time", startDate)
      .lte("start_time", endDate)
      .neq("status", "cancelled")
      .neq("status", "no_show")
      .order("start_time", { ascending: true });

    if (error) return { success: false, error: error.message };

    const appointments = data || [];

    const customerIds = [...new Set(appointments.map(a => a.customer_id))];
    const staffIds = [...new Set(appointments.map(a => a.staff_id))];
    const serviceIds = [...new Set(appointments.map(a => a.service_id))];

    const admin = await createAdminClient();

    const [customersData, staffRows, servicesData] = await Promise.all([
      supabase.from("customers").select("id, nombre, email, telefono, loyalty_rewards_available").eq("shop_id", shopId).in("id", customerIds.filter((id): id is string => id !== null)),
      fetchOperationalStaffByShopId(shopId),
      admin.from("services").select("id, name, price, duration_minutes").eq("shop_id", shopId).in("id", serviceIds.filter((id): id is string => id !== null)),
    ]);

    const customersMap = new Map((customersData.data || []).map(c => [c.id, { ...c, nombre: c.nombre ?? "" }]));
    const staffMap = await buildStaffMapFromRpc(staffRows as StaffRpcRow[], staffIds.filter((id): id is string => id !== null));
    const servicesMap = new Map((servicesData.data || []).map(s => [s.id, { ...s, duration_minutes: s.duration_minutes ?? 0 }]));

    const enriched = appointments.map(apt => ({
      ...apt,
      customers: customersMap.get(apt.customer_id ?? "") || null,
      staff: staffMap.get(apt.staff_id ?? "") || null,
      services: servicesMap.get(apt.service_id ?? "") || null,
    })) as AppointmentEnriched[];

    return { success: true, data: enriched };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener turnos" };
  }
}

export async function fetchAppointmentGroup(
  appointmentId: string,
  shopIdOverride?: string
): Promise<ActionResult<AppointmentEnriched[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const supabase = await createServerClient();

    const { data: primary, error: primaryError } = await supabase
      .from("appointments")
      .select("id, customer_id, staff_id, start_time, end_time, date_key_ar, status, is_paid, was_pending_payment, deposit_amount, loyalty_reward_applied, loyalty_discount_percent_applied, recurring_group_id, notes, service_id, custom_service_name, custom_service_duration")
      .eq("id", appointmentId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (primaryError) return { success: false, error: primaryError.message };
    if (!primary) return { success: false, error: "Turno no encontrado" };

    const dateKey = primary.date_key_ar;
    const customerId = primary.customer_id;
    const staffId = primary.staff_id;

    let siblings: typeof primary[] = [];

    if (dateKey && customerId) {
      const query = supabase
        .from("appointments")
        .select("id, customer_id, staff_id, service_id, custom_service_name, custom_service_duration, start_time, end_time, date_key_ar, status, is_paid, was_pending_payment, deposit_amount, loyalty_reward_applied, loyalty_discount_percent_applied, recurring_group_id, notes")
        .eq("shop_id", shopId)
        .eq("customer_id", customerId)
        .eq("date_key_ar", dateKey)
        .order("start_time", { ascending: true });

      if (staffId) {
        query.eq("staff_id", staffId);
      }

      const { data: sameDay } = await query;
      if (sameDay && sameDay.length > 1) {
        let groupStart: string | null = null;
        let groupEnd: string | null = null;
        for (const apt of sameDay) {
          if (apt.id === appointmentId) {
            groupStart = apt.start_time;
            groupEnd = apt.end_time;
            break;
          }
        }
        if (groupStart && groupEnd) {
          sameDay.sort(
            (a, b) =>
              new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
          );
          const t = (v: string) => new Date(v).getTime();
          const primaryIdx = sameDay.findIndex((a) => a.id === appointmentId);
          siblings = [sameDay[primaryIdx]];
          // Walk forward
          for (let i = primaryIdx + 1; i < sameDay.length; i++) {
            const gap = t(sameDay[i].start_time) - t(sameDay[i - 1].end_time);
            if (Math.abs(gap) <= 120000) siblings.push(sameDay[i]);
            else break;
          }
          // Walk backward
          for (let i = primaryIdx - 1; i >= 0; i--) {
            const gap = t(sameDay[i + 1].start_time) - t(sameDay[i].end_time);
            if (Math.abs(gap) <= 120000) siblings.unshift(sameDay[i]);
            else break;
          }
        }
      }
    }

    const allIds = (siblings.length > 0 ? siblings : [primary]).map((a) => a.id);
    const serviceIds = [...new Set((siblings.length > 0 ? siblings : [primary]).map((a) => a.service_id).filter(Boolean))];
    const staffIds = [...new Set((siblings.length > 0 ? siblings : [primary]).map((a) => a.staff_id).filter(Boolean))];
    const customerIds = [...new Set((siblings.length > 0 ? siblings : [primary]).map((a) => a.customer_id).filter(Boolean))];

    const admin = await createAdminClient();

    const [customersData, staffRows, servicesData] = await Promise.all([
      customerIds.length > 0
        ? supabase.from("customers").select("id, nombre, email, telefono, loyalty_rewards_available").eq("shop_id", shopId).in("id", customerIds.filter((id): id is string => id !== null))
        : { data: [], error: null },
      staffIds.length > 0 ? fetchOperationalStaffByShopId(shopId) : Promise.resolve([] as StaffRpcRow[]),
      serviceIds.length > 0
        ? admin.from("services").select("id, name, price, duration_minutes").eq("shop_id", shopId).in("id", serviceIds.filter((id): id is string => id !== null))
        : { data: [], error: null },
    ]);

    const customersMap = new Map((customersData.data || []).map((c: { id: string; nombre: string | null; email: string | null; telefono: string | null; loyalty_rewards_available?: number | null }) => [c.id, { ...c, nombre: c.nombre ?? "" }]));
    const staffMap = await buildStaffMapFromRpc(staffRows as StaffRpcRow[], staffIds.filter((id): id is string => id !== null));
    const servicesMap = new Map((servicesData.data || []).map((s: { id: string; name: string; price: number; duration_minutes: number | null }) => [s.id, { ...s, duration_minutes: s.duration_minutes ?? 0 }]));

    const result = (siblings.length > 0 ? siblings : [primary]).map((apt) => ({
      ...apt,
      customers: customersMap.get(apt.customer_id ?? "") || null,
      staff: staffMap.get(apt.staff_id ?? "") || null,
      services: servicesMap.get(apt.service_id ?? "") || null,
    })) as AppointmentEnriched[];

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener grupo de turnos" };
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
    return { success: true, data: (data || []).map(s => ({ ...s, duration_minutes: s.duration_minutes ?? 0 })) };
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
      .select("id, start_time, end_time, status, is_paid, was_pending_payment, deposit_amount, loyalty_reward_applied, loyalty_discount_percent_applied, recurring_group_id, customer_id, staff_id, service_id, custom_service_name")
      .eq("shop_id", shopId)
      .neq("status", "cancelled")
      .neq("status", "no_show")
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
        ? admin.from("customers").select("id, nombre, email, telefono, loyalty_rewards_available").eq("shop_id", shopId).in("id", customerIds.filter((id): id is string => id !== null))
        : { data: [], error: null },
      staffIds.length > 0 ? fetchOperationalStaffByShopId(shopId) : Promise.resolve([] as StaffRpcRow[]),
      serviceIds.length > 0
        ? admin.from("services").select("id, name, price").in("id", serviceIds.filter((id): id is string => id !== null))
        : { data: [], error: null },
    ]);

    const customerRows = (customersRes.data || []) as Array<{ id: string; nombre: string | null; email: string; telefono: string | null; loyalty_rewards_available?: number | null }>;
    const customerMap = new Map(customerRows.map((c) => [c.id, { ...c, nombre: c.nombre ?? "" }]));
    const staffMap = new Map(
      Array.from(await buildStaffMapFromRpc(staffRows as StaffRpcRow[], staffIds.filter((id): id is string => id !== null))).map(([userId, row]) => [
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
      was_pending_payment: apt.was_pending_payment ?? false,
      deposit_amount: apt.deposit_amount,
      loyalty_reward_applied: apt.loyalty_reward_applied,
      loyalty_discount_percent_applied: apt.loyalty_discount_percent_applied,
      recurring_group_id: apt.recurring_group_id,
      customers: customerMap.get(apt.customer_id ?? "") || null,
      staff: staffMap.get(apt.staff_id ?? "") || null,
      services: serviceMap.get(apt.service_id ?? "") || null,
      custom_service_name: apt.custom_service_name || null,
    })) as AppointmentTableRow[];

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener turnos" };
  }
}
