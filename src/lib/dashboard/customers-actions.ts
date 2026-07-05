"use server";

import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import type { ActionResult } from "@/lib/types";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
}

export type CustomerRow = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  birthday: string | null;
  observations: string | null;
  lastVisit: string | null;
  servicesHistory: string[];
  loyalty: "VIP" | "Recurrente" | "Nuevo";
  accumulatedSpend: number;
};

type AppointmentRow = {
  customer_id: string;
  start_time: string;
  status: string;
  services: { name: string; price: number } | { name: string; price: number }[] | null;
};

export async function fetchCustomersOverview(): Promise<ActionResult<CustomerRow[]>> {
  try {
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const admin = await createAdminClient();

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setUTCFullYear(twelveMonthsAgo.getUTCFullYear() - 1);

    const [{ data: customersRaw, error: customersError }, { data: appointmentsRaw, error: appointmentsError }] =
      await Promise.all([
        admin
          .from("customers")
          .select("id, nombre, email, telefono, birthday, birth_date, observations, created_at")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false })
          .limit(500),
        admin
          .from("appointments")
          .select("customer_id, start_time, status, services:service_id(name, price)")
          .eq("shop_id", shopId)
          .gte("start_time", twelveMonthsAgo.toISOString())
          .in("status", ["completed", "confirmed", "scheduled"]),
      ]);

    if (customersError) return { success: false, error: customersError.message };
    if (appointmentsError) return { success: false, error: appointmentsError.message };

    const appointmentsByCustomer = new Map<string, AppointmentRow[]>();

    for (const apt of (appointmentsRaw || []) as AppointmentRow[]) {
      if (!apt.customer_id) continue;
      const list = appointmentsByCustomer.get(apt.customer_id) || [];
      list.push(apt);
      appointmentsByCustomer.set(apt.customer_id, list);
    }

    const rows: CustomerRow[] = ((customersRaw || []) as Array<Record<string, unknown>>).map((customer) => {
      const id = String(customer.id || "");
      const customerAppointments = appointmentsByCustomer.get(id) || [];

      let lastVisit: string | null = null;
      let accumulatedSpend = 0;
      const servicesSet = new Set<string>();

      for (const apt of customerAppointments) {
        if (!lastVisit || new Date(apt.start_time).getTime() > new Date(lastVisit).getTime()) {
          lastVisit = apt.start_time;
        }

        const service = Array.isArray(apt.services) ? apt.services[0] : apt.services;
        if (service?.name) servicesSet.add(service.name);

        if (apt.status === "completed" || apt.status === "confirmed") {
          accumulatedSpend += Number(service?.price || 0);
        }
      }

      const visitsCount = customerAppointments.length;
      const loyalty: CustomerRow["loyalty"] =
        accumulatedSpend >= 150000 || visitsCount >= 12
          ? "VIP"
          : visitsCount >= 4
            ? "Recurrente"
            : "Nuevo";

      const birthdayValue =
        typeof customer.birthday === "string"
          ? customer.birthday
          : typeof customer.birth_date === "string"
            ? String(customer.birth_date)
            : null;

      const observationsValue =
        typeof customer.observations === "string"
          ? customer.observations
          : typeof customer.notes === "string"
            ? String(customer.notes)
            : typeof customer.technical_notes === "string"
              ? String(customer.technical_notes)
              : null;

      return {
        id,
        nombre: String(customer.nombre || "Sin nombre"),
        email: typeof customer.email === "string" ? customer.email : null,
        telefono: typeof customer.telefono === "string" ? customer.telefono : null,
        birthday: birthdayValue,
        observations: observationsValue,
        lastVisit,
        servicesHistory: Array.from(servicesSet).slice(0, 6),
        loyalty,
        accumulatedSpend,
      };
    });

    rows.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar clientes" };
  }
}

export async function fetchCustomersPage(
  shopId: string,
  options: { search?: string; page?: number; pageSize?: number }
): Promise<ActionResult<{ customers: CustomerData[]; total: number; page: number; totalPages: number }>> {
  try {
    const admin = await createAdminClient();
    const { search = "", page = 1, pageSize = 50 } = options;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = admin
      .from("customers")
      .select('id, nombre, email, telefono, "cumpleaños", observaciones_tecnicas, es_vip, tags, recurring_weekday, recurring_frequency, recurring_notes, loyalty_cuts_count, loyalty_rewards_available', { count: "exact" })
      .eq("shop_id", shopId);

    if (search.trim()) {
      const q = `%${search.trim()}%`;
      query = query.or(`nombre.ilike.${q},observaciones_tecnicas.ilike.${q}`);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return { success: false, error: error.message };

    const customers: CustomerData[] = ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id || ""),
      nombre: typeof row.nombre === "string" ? row.nombre : null,
      email: typeof row.email === "string" ? row.email : null,
      telefono: typeof row.telefono === "string" ? row.telefono : null,
      cumpleaños: typeof row["cumpleaños"] === "string" ? (row["cumpleaños"] as string) : null,
      observaciones_tecnicas: typeof row.observaciones_tecnicas === "string" ? row.observaciones_tecnicas : null,
      es_vip: typeof row.es_vip === "boolean" ? row.es_vip : false,
      tags: Array.isArray(row.tags) ? row.tags as string[] : [],
      recurring_weekday: typeof row.recurring_weekday === "number" ? row.recurring_weekday : null,
      recurring_frequency: typeof row.recurring_frequency === "string" ? row.recurring_frequency : null,
      recurring_notes: typeof row.recurring_notes === "string" ? row.recurring_notes : null,
      loyalty_cuts_count: Math.max(0, Number(row.loyalty_cuts_count || 0)),
      loyalty_rewards_available: Math.max(0, Number(row.loyalty_rewards_available || 0)),
    }));

    return {
      success: true,
      data: {
        customers,
        total: count ?? 0,
        page,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar clientes" };
  }
}

type CustomerData = {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  cumpleaños: string | null;
  observaciones_tecnicas: string | null;
  es_vip: boolean;
  tags: string[];
  recurring_weekday: number | null;
  recurring_frequency: string | null;
  recurring_notes: string | null;
  loyalty_cuts_count: number;
  loyalty_rewards_available: number;
};
