"use server";

import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import { MercadoPagoConfig, Preference } from "mercadopago";
import "server-only";

function createAdminClient() {
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
    }
  );
}

export async function fetchMercadoPagoKeys(): Promise<{ mp_public_key: string; mp_access_token: string }> {
  const session = await getAuthSession();
  const shopId = await getShopId(session);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("shops")
    .select("mp_public_key, mp_access_token")
    .eq("id", shopId)
    .single();

  if (error) {
    return { mp_public_key: "", mp_access_token: "" };
  }

  return {
    mp_public_key: (data.mp_public_key as string) || "",
    mp_access_token: (data.mp_access_token as string) || "",
  };
}

export async function updateMercadoPagoKeys(publicKey: string, accessToken: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);
  const admin = createAdminClient();

  const { error } = await admin
    .from("shops")
    .update({ mp_public_key: publicKey, mp_access_token: accessToken })
    .eq("id", shopId);

  if (error) {
    if (error.message?.includes("column") || error.code === "42703") {
      return { error: "Las columnas de Mercado Pago no existen en la tabla 'shops'. Ejecutá la migración primero." };
    }
    return { error: error.message };
  }

  return { success: true };
}

export async function createPaymentLink(appointmentId: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);
  const supabase = await createServerClient();
  const admin = createAdminClient();

  const { data: mpKeys } = await admin
    .from("shops")
    .select("mp_access_token, name")
    .eq("id", shopId)
    .single();

  if (!mpKeys?.mp_access_token) {
    return { error: "Configurá tu Access Token de Mercado Pago en Configuración > Pagos y Cobros" };
  }

  const accessToken = mpKeys.mp_access_token as string;
  const shopName = (mpKeys.name as string) || "Mi Peluquería";

  const { data: appointment } = await supabase
    .from("appointments")
    .select(`
      id,
      service_id,
      start_time,
      customers:customer_id ( id, name, email )
    `)
    .eq("id", appointmentId)
    .single();

  if (!appointment) {
    return { error: "Turno no encontrado" };
  }

  const { data: service } = await supabase
    .from("services")
    .select("name, price")
    .eq("id", appointment.service_id)
    .single();

  if (!service) {
    return { error: "Servicio no encontrado" };
  }

  const customerName = (appointment.customers as unknown as { id: string; name: string; email?: string })?.name || "Cliente";
  const price = Number(service.price);
  const title = `${shopName} - ${service.name}`;

  const client = new MercadoPagoConfig({ accessToken });
  const preference = new Preference(client);

  try {
    const result = await preference.create({
      body: {
        items: [
          {
            id: appointmentId,
            title,
            quantity: 1,
            unit_price: price,
            currency_id: "ARS",
          },
        ],
        payer: {
          name: customerName,
        },
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/dashboard/appointments`,
          failure: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/dashboard/appointments`,
          pending: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/dashboard/appointments`,
        },
        auto_return: "approved",
        external_reference: appointmentId,
        notification_url: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/payments/mercadopago-webhook`,
      },
    });

    return { init_point: result.init_point, preference_id: result.id };
  } catch (e) {
    console.error("[createPaymentLink] error:", e);
    const message = e instanceof Error ? e.message : "Error al crear el link de pago";
    return { error: message };
  }
}
