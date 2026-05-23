"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient, requireOwnerShopId } from "@/lib/dashboard/auth-server";
import { MercadoPagoConfig, Preference } from "mercadopago";
import type { ActionResult } from "@/lib/types";
import "server-only";

async function createAdminClient() {
  return createServiceRoleClient();
}

type MercadoPagoKeys = { mp_public_key: string; mp_access_token: string };

export async function fetchMercadoPagoKeys(): Promise<ActionResult<MercadoPagoKeys>> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const { data, error } = await admin
      .from("shops")
      .select("mp_public_key, mp_access_token")
      .eq("id", shopId)
      .single();

    if (error) {
      return { success: true, data: { mp_public_key: "", mp_access_token: "" } };
    }

    return {
      success: true,
      data: {
        mp_public_key: (data.mp_public_key as string) || "",
        mp_access_token: (data.mp_access_token as string) || "",
      },
    };
  } catch {
    return { success: true, data: { mp_public_key: "", mp_access_token: "" } };
  }
}

export async function updateMercadoPagoKeys(publicKey: string, accessToken: string): Promise<ActionResult> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const admin = await createAdminClient();

    const { error } = await admin
      .from("shops")
      .update({ mp_public_key: publicKey, mp_access_token: accessToken })
      .eq("id", shopId);

    if (error) {
      if (error.message?.includes("column") || error.code === "42703") {
        return { success: false, error: "Las columnas de Mercado Pago no existen en la tabla 'shops'. Ejecutá la migración primero." };
      }
      return { success: false, error: error.message };
    }

    await admin.from("shop_billing_events").insert({
      shop_id: shopId,
      actor_user_id: user?.id || null,
      event_type: "mercadopago_keys_updated",
      payload: {
        has_public_key: Boolean(publicKey),
        has_access_token: Boolean(accessToken),
      },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar claves de Mercado Pago" };
  }
}

type PaymentLinkResult = { init_point: string; preference_id: string };

export async function createPaymentLink(appointmentId: string): Promise<ActionResult<PaymentLinkResult>> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const admin = await createAdminClient();

    const { data: mpKeys } = await admin
      .from("shops")
      .select("mp_access_token, nombre")
      .eq("id", shopId)
      .single();

    if (!mpKeys?.mp_access_token) {
      return { success: false, error: "Configurá tu Access Token de Mercado Pago en Configuración > Pagos y Cobros" };
    }

    const accessToken = mpKeys.mp_access_token as string;
    const shopName = (mpKeys.nombre as string) || "Mi Peluquería";

    const { data: appointment } = await supabase
      .from("appointments")
      .select("id, service_id, start_time, loyalty_discount_percent_applied, customers:customer_id ( id, nombre, email )")
      .eq("id", appointmentId)
      .single();

    if (!appointment) {
      return { success: false, error: "Turno no encontrado" };
    }

    const { data: service } = await supabase
      .from("services")
      .select("name, price")
      .eq("id", appointment.service_id)
      .single();

    if (!service) {
      return { success: false, error: "Servicio no encontrado" };
    }

    const customerName = (appointment.customers as unknown as { id: string; nombre: string; email?: string })?.nombre || "Cliente";
    const basePrice = Number(service.price);
    const discountPercent = Math.max(0, Math.min(100, Number(appointment.loyalty_discount_percent_applied || 0)));
    const price = Math.max(0, Number((basePrice * (1 - discountPercent / 100)).toFixed(2)));

    if (price === 0) {
      await admin
        .from("appointments")
        .update({ is_paid: true, updated_at: new Date().toISOString() })
        .eq("id", appointmentId)
        .eq("shop_id", shopId);

      return { success: false, error: "Este turno quedo bonificado al 100%. Ya figura como pagado." };
    }
    const title = `${shopName} - ${service.name}`;

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://klip.com.ar").replace(/\/$/, "");

    const result = await preference.create({
      body: {
        items: [{ id: appointmentId, title, quantity: 1, unit_price: price, currency_id: "ARS" }],
        payer: { name: customerName },
        back_urls: {
          success: `${siteUrl}/dashboard/appointments`,
          failure: `${siteUrl}/dashboard/appointments`,
          pending: `${siteUrl}/dashboard/appointments`,
        },
        auto_return: "approved",
        external_reference: appointmentId,
        notification_url: `${siteUrl}/api/payments/mercadopago-webhook?shop_id=${shopId}`,
      },
    });

    const preferenceId = result.id ?? "";

    if (preferenceId) {
      await admin
        .from("appointments")
        .update({ mp_preference_id: preferenceId, updated_at: new Date().toISOString() })
        .eq("id", appointmentId)
        .eq("shop_id", shopId);

      await admin.from("mercadopago_logs").insert({
        shop_id: shopId,
        appointment_id: appointmentId,
        mp_preference_id: preferenceId,
        event_type: "preference_created",
        payload: {
          init_point: result.init_point ?? "",
          title,
          amount: price,
        },
      });

      await admin.from("shop_billing_events").insert({
        shop_id: shopId,
        actor_user_id: user?.id || null,
        event_type: "payment_link_created",
        payload: {
          appointment_id: appointmentId,
          mp_preference_id: preferenceId,
          amount: price,
        },
      });
    }

    return { success: true, data: { init_point: result.init_point ?? "", preference_id: preferenceId } };
  } catch (e) {
    console.error("[createPaymentLink] error:", e);
    const message = e instanceof Error ? e.message : "Error al crear el link de pago";
    return { success: false, error: message };
  }
}
