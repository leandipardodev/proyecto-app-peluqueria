"use server";

import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import "server-only";

type ExportRow = Record<string, string | number | boolean | null>;

export async function fetchExportCustomers(shopId: string): Promise<ActionResult<ExportRow[]>> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("customers")
      .select('nombre, email, telefono, "cumpleaños", observaciones_tecnicas, es_vip, loyalty_cuts_count')
      .eq("shop_id", shopId)
      .order("nombre");
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export async function fetchExportStock(shopId: string): Promise<ActionResult<ExportRow[]>> {
  try {
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
    const supabase = await createServerClient();
    const { data: movements, error } = await supabase
      .from("cash_movements")
      .select("amount, type")
      .eq("shop_id", shopId)
      .gte("created_at", from)
      .lte("created_at", to);
    if (error) return { success: false, error: error.message };

    const totalIncome = (movements || []).filter((m) => m.type === "income").reduce((s, m) => s + Number(m.amount), 0);
    const totalExpenses = (movements || []).filter((m) => m.type === "expense").reduce((s, m) => s + Number(m.amount), 0);
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
    const supabase = await createServerClient();
    const { data: staffList, error: staffError } = await supabase
      .from("staff")
      .select("id, name")
      .eq("shop_id", shopId);
    if (staffError) return { success: false, error: staffError.message };

    const { data: appointments, error: apptError } = await supabase
      .from("appointments")
      .select("staff_id, services(price), is_paid")
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
