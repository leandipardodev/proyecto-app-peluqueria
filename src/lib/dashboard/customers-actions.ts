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
