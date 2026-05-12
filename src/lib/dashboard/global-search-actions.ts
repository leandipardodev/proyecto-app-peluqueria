"use server";

import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import type { ActionResult } from "@/lib/types";
import "server-only";

type GlobalCustomerResult = {
  type: "customer";
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
};

type GlobalAppointmentResult = {
  type: "appointment";
  id: string;
  start_time: string;
  customer_id: string;
  customer_name: string | null;
};

export type GlobalSearchResult = GlobalCustomerResult | GlobalAppointmentResult;

function scoreTextMatch(value: string | null | undefined, query: string) {
  if (!value) return 0;
  const v = value.toLowerCase();
  if (v === query) return 120;
  if (v.startsWith(query)) return 80;
  if (v.includes(query)) return 40;
  return 0;
}

export async function globalSearch(query: string): Promise<ActionResult<GlobalSearchResult[]>> {
  try {
    const q = query.trim();
    if (q.length < 2) return { success: true, data: [] };
    const qLower = q.toLowerCase();

    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const admin = await createServiceRoleClient();

    const { data: customersRaw, error: customersError } = await admin
      .from("customers")
      .select("id, nombre, email, telefono")
      .eq("shop_id", shopId)
      .or(`nombre.ilike.%${q}%,email.ilike.%${q}%,telefono.ilike.%${q}%`)
      .order("nombre", { ascending: true })
      .limit(6);

    if (customersError) return { success: false, error: customersError.message };

    const customers = (customersRaw || []) as Array<{ id: string; nombre: string | null; email: string | null; telefono: string | null }>;
    const customerResults: GlobalCustomerResult[] = customers
      .map((c) => ({
        item: {
          type: "customer" as const,
          id: c.id,
          nombre: c.nombre,
          email: c.email,
          telefono: c.telefono,
        },
        score:
          scoreTextMatch(c.nombre, qLower) * 3 +
          scoreTextMatch(c.email, qLower) * 2 +
          scoreTextMatch(c.telefono, qLower),
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);

    const matchedCustomerIds = customers.map((c) => c.id);
    if (matchedCustomerIds.length === 0) return { success: true, data: customerResults };

    const { data: appointmentsRaw, error: appointmentsError } = await admin
      .from("appointments")
      .select("id, start_time, customer_id, customers!inner(nombre)")
      .eq("shop_id", shopId)
      .in("customer_id", matchedCustomerIds)
      .order("start_time", { ascending: false })
      .limit(6);

    if (appointmentsError) return { success: false, error: appointmentsError.message };

    const appointments = (appointmentsRaw || []) as Array<{ id: string; start_time: string; customer_id: string; customers: { nombre: string | null } | { nombre: string | null }[] | null }>;
    const appointmentResults: GlobalAppointmentResult[] = appointments
      .map((apt) => {
        const customer = Array.isArray(apt.customers) ? apt.customers[0] : apt.customers;
        const score = scoreTextMatch(customer?.nombre ?? null, qLower);
        return {
          item: {
            type: "appointment" as const,
            id: apt.id,
            start_time: apt.start_time,
            customer_id: apt.customer_id,
            customer_name: customer?.nombre ?? null,
          },
          score,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.item.start_time).getTime() - new Date(a.item.start_time).getTime();
      })
      .map((entry) => entry.item);

    return { success: true, data: [...customerResults.slice(0, 6), ...appointmentResults.slice(0, 6)] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error en búsqueda global" };
  }
}
