"use server";

import { requireOwnerShopId, requireShopId } from "@/lib/dashboard/auth/server";
import { createAdminClient } from "@/lib/dashboard/appointments/shared";
import { revalidateDashboardSegments } from "@/lib/dashboard/shared/revalidate-dashboard";
import { restoreOrderStock } from "./stock";
import type { ActionResult } from "@/lib/types";
import "server-only";

export type StoreOrderItem = {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
};

export type StoreOrder = {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  status: string;
  payment_method: string;
  total_amount: number;
  mp_payment_id: string | null;
  created_at: string;
  confirmed_at: string | null;
  order_items: StoreOrderItem[];
};

export async function fetchStoreOrders(shopIdOverride?: string): Promise<ActionResult<StoreOrder[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();

    const { data, error } = await admin
      .from("orders")
      .select("id, customer_name, customer_email, customer_phone, status, payment_method, total_amount, mp_payment_id, created_at, confirmed_at, order_items(id, product_name, unit_price, quantity)")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const orders: StoreOrder[] = (data || []).map((row) => ({
      id: row.id,
      customer_name: row.customer_name,
      customer_email: row.customer_email,
      customer_phone: row.customer_phone,
      status: row.status,
      payment_method: row.payment_method,
      total_amount: Number(row.total_amount) || 0,
      mp_payment_id: row.mp_payment_id,
      created_at: row.created_at,
      confirmed_at: row.confirmed_at,
      order_items: (row.order_items || []).map((item) => ({
        id: item.id,
        product_name: item.product_name,
        unit_price: Number(item.unit_price) || 0,
        quantity: item.quantity,
      })),
    }));

    return { success: true, data: orders };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al obtener pedidos" };
  }
}

export async function countPendingStoreOrders(shopIdOverride?: string): Promise<ActionResult<{ count: number }>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();

    const { count, error } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("status", "pending_payment");

    if (error) return { success: false, error: error.message };

    return { success: true, data: { count: count || 0 } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al contar pedidos" };
  }
}

export async function confirmStoreOrder(orderId: string, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();

    const { data: order } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (!order) return { success: false, error: "Pedido no encontrado" };
    if (order.status !== "pending_payment") return { success: false, error: "El pedido ya fue procesado" };

    const { error } = await admin
      .from("orders")
      .update({ status: "paid", confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al confirmar pedido" };
  }
}

export async function cancelStoreOrder(orderId: string, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireOwnerShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();

    const { data: order } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (!order) return { success: false, error: "Pedido no encontrado" };
    if (order.status !== "pending_payment") return { success: false, error: "El pedido ya fue procesado" };

    await restoreOrderStock(admin, shopId, orderId);

    const { error } = await admin
      .from("orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/inventory"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cancelar pedido" };
  }
}
