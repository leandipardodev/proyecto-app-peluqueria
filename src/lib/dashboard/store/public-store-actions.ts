"use server";

import { MercadoPagoConfig, Preference } from "mercadopago";
import { buildMpPaymentMethods, fetchShopMpPaymentConfig } from "@/lib/payments/mp-payment-config";
import type { ActionResult } from "@/lib/types";
import { createAdminClient } from "@/lib/dashboard/appointments/shared";
import { createRateLimiter } from "@/lib/rate-limiter";
import { restoreOrderStock } from "./stock";
import { headers } from "next/headers";
import "server-only";

const storeOrderLimiter = createRateLimiter({ intervalMs: 60_000, maxRequests: 20 });

export type PublicStoreProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
  stock_quantity: number;
};

export async function fetchPublicStoreProducts(shopId: string): Promise<ActionResult<PublicStoreProduct[]>> {
  try {
    const admin = await createAdminClient();

    const { data, error } = await admin
      .from("stock")
      .select("id, nombre_producto, description, price, image_url, category, quantity")
      .eq("shop_id", shopId)
      .eq("for_sale", true)
      .eq("visible", true)
      .order("nombre_producto", { ascending: true });

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data || []).map((row) => ({
        id: row.id,
        name: row.nombre_producto,
        description: row.description,
        price: Number(row.price) || 0,
        image_url: row.image_url,
        category: row.category,
        stock_quantity: Number(row.quantity ?? 0),
      })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar la tienda" };
  }
}

export type StoreCheckoutItem = { productId: string; quantity: number };

export type StoreCheckoutInput = {
  shopId: string;
  shopSlug: string;
  items: StoreCheckoutItem[];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  paymentMethod: "mp" | "bank_transfer";
};

export type StoreCheckoutOutput = {
  orderId: string;
  totalAmount: number;
  initPoint?: string;
  preferenceId?: string;
  bankTransfer?: { cbu: string; alias: string; bankName: string };
};

export type StoreOrderRecord = {
  orderId: string;
  lineItems: StoreLineItem[];
  totalAmount: number;
};

export type StoreLineItem = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  stockId: string;
};

/**
 * Creates a pending order + order_items and decrements stock.
 * Reusable from both the standalone store checkout and the combined booking+store checkout.
 * On failure it rolls back the order and restored stock.
 */
export async function createStoreOrderRecord(input: {
  shopId: string;
  items: StoreCheckoutItem[];
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
}): Promise<ActionResult<StoreOrderRecord>> {
  try {
    const items = input.items.filter((i) => i.productId && Number.isInteger(i.quantity) && i.quantity > 0);
    if (items.length === 0) return { success: false, error: "No seleccionaste productos" };

    const customerName = input.customerName.trim();
    const customerEmail = input.customerEmail.trim();
    if (!customerName) return { success: false, error: "Ingresa tu nombre" };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return { success: false, error: "Ingresa un email valido" };

    const admin = await createAdminClient();

    const productIds = [...new Set(items.map((i) => i.productId))];
    const { data: products, error: productsError } = await admin
      .from("stock")
      .select("id, nombre_producto, price, quantity")
      .eq("shop_id", input.shopId)
      .eq("for_sale", true)
      .eq("visible", true)
      .in("id", productIds);

    if (productsError) return { success: false, error: productsError.message };
    if (!products || products.length === 0) return { success: false, error: "Producto no disponible" };

    const productById = new Map(products.map((p) => [p.id, p]));

    const lineItems: StoreLineItem[] = [];
    for (const item of items) {
      const product = productById.get(item.productId);
      if (!product) return { success: false, error: "Producto no disponible" };
      const stockQuantity = Number(product.quantity ?? 0);
      if (stockQuantity < item.quantity) {
        return { success: false, error: `No hay suficiente stock de "${product.nombre_producto}"` };
      }
      lineItems.push({
        productId: product.id,
        name: product.nombre_producto,
        unitPrice: Number(product.price) || 0,
        quantity: item.quantity,
        stockId: product.id,
      });
    }

    const totalAmount = lineItems.reduce((sum, li) => sum + li.unitPrice * li.quantity, 0);
    if (totalAmount <= 0) return { success: false, error: "El total del pedido es invalido" };

    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        shop_id: input.shopId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: input.customerPhone?.trim() || null,
        payment_method: "mp",
        total_amount: totalAmount,
        status: "pending_payment",
      })
      .select("id, shop_id")
      .single();

    if (orderError || !order) return { success: false, error: orderError?.message || "No se pudo crear el pedido" };

    const { error: itemsError } = await admin.from("order_items").insert(
      lineItems.map((li) => ({
        order_id: order.id,
        product_id: li.productId,
        product_name: li.name,
        unit_price: li.unitPrice,
        quantity: li.quantity,
      }))
    );
    if (itemsError) {
      await admin.from("orders").delete().eq("id", order.id).eq("shop_id", input.shopId);
      if (itemsError.code === "23503") {
        return { success: false, error: "Uno de los productos ya no esta disponible. Reintenta recargando la tienda." };
      }
      return { success: false, error: itemsError.message };
    }

    for (const li of lineItems) {
      const { data: affected, error: decrementError } = await admin.rpc("decrement_stock", {
        p_stock_id: li.stockId,
        p_shop_id: input.shopId,
        p_qty: li.quantity,
      });
      if (decrementError || !affected || affected === 0) {
        await restoreOrderStock(admin, input.shopId, order.id);
        await admin.from("orders").delete().eq("id", order.id).eq("shop_id", input.shopId);
        return { success: false, error: `No hay suficiente stock de "${li.name}"` };
      }
    }

    return {
      success: true,
      data: { orderId: order.id, lineItems, totalAmount },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No se pudo crear el pedido" };
  }
}

export async function createStoreOrder(input: StoreCheckoutInput): Promise<ActionResult<StoreCheckoutOutput>> {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateCheck = await storeOrderLimiter.check(`store-order:${ip}:${input.shopId}`);
    if (!rateCheck.allowed) return { success: false, error: "Demasiados intentos, proba en un momento" };

    const record = await createStoreOrderRecord({
      shopId: input.shopId,
      items: input.items,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
    });
    if (!record.success || !record.data) return record;

    const { orderId, lineItems, totalAmount } = record.data;

    const admin = await createAdminClient();

    if (input.paymentMethod === "bank_transfer") {
      const { data: shop } = await admin
        .from("shops")
        .select("bank_cvu_cbu, bank_alias, bank_name")
        .eq("id", input.shopId)
        .maybeSingle();

      return {
        success: true,
        data: {
          orderId,
          totalAmount,
          bankTransfer: {
            cbu: shop?.bank_cvu_cbu || "",
            alias: shop?.bank_alias || "",
            bankName: shop?.bank_name || "",
          },
        },
      };
    }

    const { data: shop } = await admin
      .from("shops")
      .select("mp_access_token")
      .eq("id", input.shopId)
      .maybeSingle();
    const accessToken = (shop?.mp_access_token as string | undefined) || process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      await restoreOrderStock(admin, input.shopId, orderId);
      await admin.from("orders").delete().eq("id", orderId).eq("shop_id", input.shopId);
      return { success: false, error: "Mercado Pago no esta configurado para este local. Intenta mas tarde." };
    }

    const paymentMethods = buildMpPaymentMethods(
      await fetchShopMpPaymentConfig(admin, input.shopId)
    );

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://klip.com.ar").replace(/\/+$/, "");
    const storeBase = `${baseUrl}/book/${encodeURIComponent(input.shopSlug)}`;
    const successUrl = `${storeBase}?status=success&order=${orderId}`;
    const pendingUrl = `${storeBase}?status=pending&order=${orderId}`;
    const failureUrl = `${storeBase}?status=failure&order=${orderId}`;
    const notificationUrl = `${baseUrl}/api/payments/mercadopago-webhook`;
    const canUseBackUrls = /^https?:\/\//.test(baseUrl) && !/localhost|127\.0\.0\.1/.test(baseUrl);
    const shouldSendWebhook = notificationUrl.startsWith("https://");

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);
    const preferenceResult = await preference.create({
      body: {
        items: lineItems.map((li) => ({
          id: li.productId,
          title: li.name,
          quantity: li.quantity,
          unit_price: li.unitPrice,
          currency_id: "ARS",
        })),
        back_urls: canUseBackUrls
          ? { success: successUrl, pending: pendingUrl, failure: failureUrl }
          : undefined,
        auto_return: canUseBackUrls ? "approved" : undefined,
        external_reference: orderId,
        notification_url: shouldSendWebhook ? notificationUrl : undefined,
        ...(paymentMethods ? { payment_methods: paymentMethods } : {}),
        metadata: { type: "store_order", order_id: orderId, shop_id: input.shopId },
      },
    });

    if (!preferenceResult.id || !preferenceResult.init_point) {
      throw new Error("No se pudo crear la preferencia de pago");
    }

    await admin
      .from("orders")
      .update({ mp_preference_id: preferenceResult.id, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("shop_id", input.shopId);

    return {
      success: true,
      data: {
        orderId,
        totalAmount,
        initPoint: preferenceResult.init_point,
        preferenceId: preferenceResult.id,
      },
    };
  } catch (e) {
    console.error("[createStoreOrder] error:", e);
    return { success: false, error: e instanceof Error ? e.message : "Error al crear el pedido" };
  }
}
