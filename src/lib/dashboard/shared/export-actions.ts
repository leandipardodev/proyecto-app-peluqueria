"use server";

import { createServerClient } from "@/lib/supabase/server";
import { canAccessShopId, getCachedUser, getCurrentUserRole } from "@/lib/dashboard/auth/server";
import type { ActionResult } from "@/lib/types";
import "server-only";

async function requireOwnerAccess(shopId: string): Promise<ActionResult<string>> {
  if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
  const user = await getCachedUser();
  if (!user) return { success: false, error: "SESION_EXPIRADA" };
  const allowed = await canAccessShopId(user.id, shopId);
  if (!allowed) return { success: false, error: "SIN_ACCESO_LOCAL" };
  const roleResult = await getCurrentUserRole(shopId);
  if (!roleResult.success || roleResult.data?.role !== "owner") {
    return { success: false, error: "Solo el owner puede exportar datos" };
  }
  return { success: true, data: shopId };
}

type ExportRow = Record<string, string | number | boolean | null>;

export async function fetchExportCustomers(shopId: string): Promise<ActionResult<ExportRow[]>> {
  try {
    const accessResult = await requireOwnerAccess(shopId);
    if (!accessResult.success) return accessResult;
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("customers")
      .select('nombre, email, telefono, "cumpleaños", observaciones_tecnicas, tags, loyalty_cuts_count')
      .eq("shop_id", shopId)
      .order("nombre");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []).map((row) => ({ ...row, tags: Array.isArray(row.tags) ? (row.tags as string[]).join(", ") : row.tags })) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function fetchExportStock(shopId: string): Promise<ActionResult<ExportRow[]>> {
  try {
    const accessResult = await requireOwnerAccess(shopId);
    if (!accessResult.success) return accessResult;
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("stock")
      .select("nombre_producto, quantity, unit_cost")
      .eq("shop_id", shopId)
      .order("nombre_producto");
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function fetchExportAppointments(shopId: string): Promise<ActionResult<ExportRow[]>> {
  try {
    const accessResult = await requireOwnerAccess(shopId);
    if (!accessResult.success) return accessResult;
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("appointments")
      .select("start_time, end_time, customers(name), services(name), staff(name), status, is_paid, deposit_amount")
      .eq("shop_id", shopId)
      .order("start_time", { ascending: false });
    if (error) return { success: false, error: error.message };
    const rows = (data || []).map((a: Record<string, unknown>) => ({
      fecha: new Date(a.start_time as string).toLocaleDateString("es-AR"),
      horario: `${new Date(a.start_time as string).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} - ${new Date(a.end_time as string).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`,
      cliente: (a.customers as { name?: string } | null)?.name || "",
      servicio: (a.services as { name?: string } | null)?.name || "",
      staff: (a.staff as { name?: string } | null)?.name || "",
      estado: a.status as string,
      pago: a.is_paid ? "Pagado" : "Pendiente",
      seña: a.deposit_amount ? `$${Number(a.deposit_amount).toFixed(2)}` : "",
    }));
    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function fetchExportFinances(
  shopId: string,
  from: string,
  to: string
): Promise<ActionResult<{ totalIncome: number; totalExpenses: number; netBalance: number }>> {
  try {
    const accessResult = await requireOwnerAccess(shopId);
    if (!accessResult.success) return accessResult;
    const supabase = await createServerClient();

    const [apptsResult, expensesResult, movementsResult] = await Promise.all([
      supabase
        .from("appointments")
        .select("service_price, services(price)")
        .eq("shop_id", shopId)
        .eq("status", "completed")
        .eq("is_paid", true)
        .gte("start_time", from)
        .lte("start_time", to),
      supabase
        .from("finances")
        .select("amount, type")
        .eq("shop_id", shopId)
        .eq("type", "expense")
        .gte("happened_at", from)
        .lte("happened_at", to),
      supabase
        .from("cash_movements")
        .select("amount, movement_type")
        .eq("shop_id", shopId)
        .gte("happened_at", from)
        .lte("happened_at", to),
    ]);

    if (apptsResult.error) return { success: false, error: apptsResult.error.message };
    if (expensesResult.error) return { success: false, error: expensesResult.error.message };
    if (movementsResult.error) return { success: false, error: movementsResult.error.message };

    const appointmentIncome = (apptsResult.data || []).reduce((s, a) => {
      if (a.service_price != null) return s + Number(a.service_price);
      const svc = a.services as { price?: number } | null;
      return s + (svc?.price || 0);
    }, 0);

    const expenseFromFinances = (expensesResult.data || []).reduce((s, e) => s + Number(e.amount || 0), 0);

    const movementIncome = (movementsResult.data || [])
      .filter((m) => m.movement_type === "income")
      .reduce((s, m) => s + Number(m.amount), 0);
    const movementExpenses = (movementsResult.data || [])
      .filter((m) => m.movement_type === "expense" || m.movement_type === "withdrawal")
      .reduce((s, m) => s + Number(m.amount), 0);

    const totalIncome = appointmentIncome + movementIncome;
    const totalExpenses = expenseFromFinances + movementExpenses;
    return { success: true, data: { totalIncome, totalExpenses, netBalance: totalIncome - totalExpenses } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function fetchExportStaffProduction(
  shopId: string,
  from: string,
  to: string
): Promise<ActionResult<ExportRow[]>> {
  try {
    const accessResult = await requireOwnerAccess(shopId);
    if (!accessResult.success) return accessResult;

    const supabase = await createServerClient();
    const { data: memberships, error: membershipsError } = await supabase
      .from("shop_memberships")
      .select("user_id")
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .in("role", ["owner", "admin", "staff"]);
    if (membershipsError) return { success: false, error: membershipsError.message };

    const userIds = (memberships || []).map((m) => m.user_id).filter(Boolean);
    if (userIds.length === 0) return { success: true, data: [] };

    const { data: profiles, error: profilesError } = await supabase
      .from("user_profiles")
      .select("user_id, name")
      .in("user_id", userIds);
    if (profilesError) return { success: false, error: profilesError.message };

    const staffList = (profiles || []).map((p) => ({ id: p.user_id, name: p.name }));

    const { data: appointments, error: apptError } = await supabase
      .from("appointments")
      .select("staff_id, service_price, services(price), is_paid")
      .eq("shop_id", shopId)
      .gte("start_time", from)
      .lte("start_time", to);
    if (apptError) return { success: false, error: apptError.message };

    const rows = (staffList || []).map((staff) => {
      const staffAppts = (appointments || []).filter((a) => a.staff_id === staff.id);
      const count = staffAppts.length;
      const paidRevenue = staffAppts
        .filter((a) => a.is_paid)
        .reduce((s, a) => {
          if (a.service_price != null) return s + Number(a.service_price);
          const svc = a.services as { price?: number } | null;
          return s + (svc?.price || 0);
        }, 0);
      return {
        empleado: staff.name,
        turnos: count,
        cobrado: paidRevenue.toFixed(2),
        ticket_promedio: count > 0 ? (paidRevenue / count).toFixed(2) : "0.00",
      };
    });

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}
