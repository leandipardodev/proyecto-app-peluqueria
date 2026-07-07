"use server";

import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth/server";
import type { ActionResult } from "@/lib/types";
import "server-only";

export type OmniSearchResult =
  | { type: "stock"; id: string; nombre_producto: string; quantity: number }
  | { type: "service"; id: string; name: string; duration_minutes: number }
  | { type: "customer"; id: string; nombre: string | null; telefono: string | null }
  | { type: "staff"; id: string; name: string | null; email: string | null; role: string };

function scoreTextMatch(value: string | null | undefined, query: string) {
  if (!value) return 0;
  const v = value.toLowerCase();
  if (v === query) return 120;
  if (v.startsWith(query)) return 80;
  if (v.includes(query)) return 40;
  return 0;
}

export async function globalSearch(query: string): Promise<ActionResult<OmniSearchResult[]>> {
  try {
    const q = query.trim();
    if (q.length < 3) return { success: true, data: [] };

    const qLower = q.toLowerCase();
    const shopIdResult = await requireShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const admin = await createServiceRoleClient();

    const [stockRes, servicesRes, customersRes, staffRes] = await Promise.all([
      admin
        .from("stock")
        .select("id, nombre_producto, quantity")
        .eq("shop_id", shopId!)
        .ilike("nombre_producto", `%${q}%`)
        .order("nombre_producto", { ascending: true })
        .limit(8),
      admin
        .from("services")
        .select("id, name, duration_minutes")
        .eq("shop_id", shopId!)
        .ilike("name", `%${q}%`)
        .order("name", { ascending: true })
        .limit(8),
      admin
        .from("customers")
        .select("id, nombre, telefono")
        .eq("shop_id", shopId!)
        .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`)
        .order("nombre", { ascending: true })
        .limit(8),
      admin
        .from("user_profiles")
        .select("user_id, name, email, role")
        .eq("shop_id", shopId!)
        .in("role", ["owner", "staff"])
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .order("name", { ascending: true })
        .limit(8),
    ]);

    if (stockRes.error) return { success: false, error: stockRes.error.message };
    if (servicesRes.error) return { success: false, error: servicesRes.error.message };
    if (customersRes.error) return { success: false, error: customersRes.error.message };
    if (staffRes.error) return { success: false, error: staffRes.error.message };

    const stock = ((stockRes.data || []) as Array<{ id: string; nombre_producto: string; quantity: number }>)
      .map((item) => ({ item: { type: "stock" as const, ...item }, score: scoreTextMatch(item.nombre_producto, qLower) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);

    const services = ((servicesRes.data || []) as Array<{ id: string; name: string; duration_minutes: number }>)
      .map((item) => ({ item: { type: "service" as const, ...item }, score: scoreTextMatch(item.name, qLower) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);

    const customers = ((customersRes.data || []) as Array<{ id: string; nombre: string | null; telefono: string | null }>)
      .map((item) => ({
        item: { type: "customer" as const, ...item },
        score: scoreTextMatch(item.nombre, qLower) * 2 + scoreTextMatch(item.telefono, qLower),
      }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);

    const staff = ((staffRes.data || []) as Array<{ user_id: string; name: string | null; email: string | null; role: string }>)
      .map((item) => ({
        item: { type: "staff" as const, id: item.user_id, name: item.name, email: item.email, role: item.role },
        score: scoreTextMatch(item.name, qLower) * 2 + scoreTextMatch(item.email, qLower),
      }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item);

    return {
      success: true,
      data: [...stock, ...services, ...customers, ...staff],
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error en búsqueda global" };
  }
}
