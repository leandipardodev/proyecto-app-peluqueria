"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient, requireOwnerShopId } from "@/lib/dashboard/auth/server";
import { MercadoPagoConfig, Preference, PaymentRefund } from "mercadopago";
import { buildMpPaymentMethods, fetchShopMpPaymentConfig } from "@/lib/payments/mp-payment-config";
import { buildShopNotificationUrl } from "@/lib/payments/shop-mp";
import { resolveNotificationBaseUrl } from "@/lib/urls";
import { createExpense } from "@/lib/dashboard/finances/finances-actions";
import { resolveRefundAppointmentIds } from "@/lib/payments/refund-targets";
import type { ActionResult } from "@/lib/types";
import type { Json } from "@/lib/supabase/database.types";
import "server-only";
import { createAdminClient } from "@/lib/dashboard/appointments/shared";

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
      .eq("id", shopId!)
      .maybeSingle();

    if (error || !data) {
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
      .eq("id", shopId!);

    if (error) {
      if (error.message?.includes("column") || error.code === "42703") {
        return { success: false, error: "Las columnas de Mercado Pago no existen en la tabla 'shops'. Ejecutá la migración primero." };
      }
      return { success: false, error: error.message };
    }

    await admin.from("shop_billing_events").insert({
      shop_id: shopId!,
      actor_user_id: user?.id || null,
      event_type: "mercadopago_keys_updated",
      payload: {
        has_public_key: Boolean(publicKey),
        has_access_token: Boolean(accessToken),
      } as Json,
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
      .eq("id", shopId!)
      .maybeSingle();

    if (!mpKeys?.mp_access_token) {
      return { success: false, error: "Configurá tu Access Token de Mercado Pago en Configuración > Pagos y Cobros" };
    }

    const accessToken = mpKeys.mp_access_token as string;
    const shopName = (mpKeys.nombre as string) || "Mi Peluquería";

    const paymentMethods = buildMpPaymentMethods(await fetchShopMpPaymentConfig(admin, shopId!));

    const { data: appointment } = await supabase
      .from("appointments")
      .select("id, service_id, start_time, loyalty_discount_percent_applied, customers:customer_id ( id, nombre, email )")
      .eq("id", appointmentId)
      .maybeSingle();

    if (!appointment) {
      return { success: false, error: "Turno no encontrado" };
    }

    const { data: service } = await supabase
      .from("services")
      .select("name, price")
      .eq("id", appointment.service_id!)
      .maybeSingle();

    if (!service) {
      return { success: false, error: "Servicio no encontrado" };
    }

    const customer = appointment.customers as unknown as { id: string; nombre: string; email?: string | null } | null;
    const customerName = customer?.nombre || "Cliente";
    const customerEmail = customer?.email?.trim() || undefined;
    const basePrice = Number(service.price);
    const discountPercent = Math.max(0, Math.min(100, Number(appointment.loyalty_discount_percent_applied || 0)));
    const price = Math.max(0, Number((basePrice * (1 - discountPercent / 100)).toFixed(2)));

    if (price === 0) {
      await admin
        .from("appointments")
        .update({ is_paid: true, updated_at: new Date().toISOString() })
        .eq("id", appointmentId)
        .eq("shop_id", shopId!);

      return { success: false, error: "Este turno quedo bonificado al 100%. Ya figura como pagado." };
    }
    const title = `${shopName} - ${service.name}`;

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    // Centralizado: antes caia a "https://klip.com.ar" hardcodeado si faltaba la
    // variable, y en otro dominio las notificaciones iban a un sitio inexistente.
    const siteUrl = resolveNotificationBaseUrl();

    // Sin local no hay notification_url posible, y una vacia hace que el webhook
    // consulte el pago con el token equivocado. Preferimos fallar aca.
    if (!shopId) {
      throw new Error("No se pudo determinar el local para notificar el pago");
    }

    const result = await preference.create({
      body: {
        items: [{ id: appointmentId, title, description: `Turno: ${service.name}`, quantity: 1, unit_price: price, currency_id: "ARS" }],
        payer: { name: customerName, ...(customerEmail ? { email: customerEmail } : {}) },
        back_urls: {
          success: `${siteUrl}/dashboard/appointments`,
          failure: `${siteUrl}/dashboard/appointments`,
          pending: `${siteUrl}/dashboard/appointments`,
        },
        auto_return: "approved",
        external_reference: appointmentId,
        notification_url: buildShopNotificationUrl(siteUrl, shopId),
        ...(paymentMethods ? { payment_methods: paymentMethods } : {}),
      },
    });

    const preferenceId = result.id ?? "";

    if (preferenceId) {
      await admin
        .from("appointments")
        .update({ mp_preference_id: preferenceId, updated_at: new Date().toISOString() })
        .eq("id", appointmentId)
        .eq("shop_id", shopId!);

      await admin.from("mercadopago_logs").insert({
        shop_id: shopId,
        appointment_id: appointmentId,
        mp_preference_id: preferenceId,
        event_type: "preference_created",
        payload: {
          init_point: result.init_point ?? "",
          title,
          amount: price,
        } as Json,
      });

      await admin      .from("shop_billing_events").insert({
        shop_id: shopId!,
        actor_user_id: user?.id || null,
        event_type: "payment_link_created",
        payload: {
          appointment_id: appointmentId,
          mp_preference_id: preferenceId,
          amount: price,
        } as Json,
      });
    }

    return { success: true, data: { init_point: result.init_point ?? "", preference_id: preferenceId } };
  } catch (e) {
    console.error("[createPaymentLink] error:", e);
    const message = e instanceof Error ? e.message : "Error al crear el link de pago";
    return { success: false, error: message };
  }
}

export async function refundMpPayment(appointmentId: string): Promise<ActionResult> {
  try {
    const shopIdResult = await requireOwnerShopId();
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const admin = await createAdminClient();

    const { data: appointment } = await admin
      .from("appointments")
      .select("id, is_paid, mp_preference_id, shop_id")
      .eq("id", appointmentId)
      .eq("shop_id", shopId!)
      .maybeSingle();

    if (!appointment) return { success: false, error: "Turno no encontrado" };

    const { data: mpKeys } = await admin
      .from("shops")
      .select("mp_access_token")
      .eq("id", shopId!)
      .maybeSingle();

    if (!mpKeys?.mp_access_token) {
      return { success: false, error: "Mercado Pago no esta configurado para este local" };
    }

    const accessToken = mpKeys.mp_access_token as string;

    const { data: logs } = await admin
      .from("mercadopago_logs")
      .select("payload")
      .eq("appointment_id", appointmentId)
      .eq("event_type", "payment_webhook")
      .order("created_at", { ascending: false })
      .limit(1);

    const mpPaymentId = (logs?.[0]?.payload as { payment_id?: string } | null)?.payment_id;
    if (!mpPaymentId) {
      // Sin pago registrado no hay nada que devolver. Ojo: `is_paid` NO se usa
      // como condicion.
      //
      // La constraint de la migracion 109 cubre `confirmed` y NO `pending_payment`
      // (a proposito: la retencion del carrito son 10 minutos y un CHECK no puede
      // mirar el reloj). Entonces dos carritos sobre el mismo slot se confirman
      // los dos en el webhook: el segundo revienta con 23P01, el turno queda en
      // `pending_payment` con `is_paid = false` PERO su pago quedo registrado en
      // `mercadopago_logs` y en el ledger de facturacion.
      //
      // Antes, con el chequeo por `is_paid`, el local no tenia ninguna forma de
      // devolver esa plata desde la app: el boton de reembolso no aparecia y la
      // accion rechazaba el pedido. Plata cobrada de mas y sin salida.
      return {
        success: false,
        error: appointment.is_paid
          ? "No se encontro el pago de este turno en Mercado Pago"
          : "Este turno no tiene ningun pago registrado",
      };
    }

    // Un pago de combo o carrito es UNA preferencia de MP que cubre VARIOS
    // turnos, y `refund.total()` devuelve el 100% de ese pago. Antes solo se
    // desmarcaba el turno principal: se devolvia la plata de todos y los demas
    // seguian contando como cobrados. El set lo deja el webhook en el payload
    // (`paid_appointment_ids`); para preferencias viejas cae en el turno solo.
    const { data: paidLogs } = await admin
      .from("mercadopago_logs")
      .select("payload")
      .eq("event_type", "payment_webhook")
      .order("created_at", { ascending: false })
      .limit(200);

    const reimbursementTargets = resolveRefundAppointmentIds({
      paymentId: mpPaymentId,
      principalId: appointmentId,
      logs: (paidLogs || []) as Array<{ payload: unknown }>,
    });

    // CLAIM antes de llamar a Mercado Pago. Antes era read-then-write sin barrera
    // (`if (!is_paid) return` y despues el refund): dos clics o dos pestañas
    // pasaban el chequeo y los dos reembolsaban. Si el claim falla por indice
    // unico, este pago ya fue reembolsado.
    const { error: claimError } = await admin.from("shop_billing_events").insert({
      shop_id: shopId!,
      actor_user_id: user?.id ?? null,
      event_type: "appointment_refund_applied",
      payload: {
        payment_id: mpPaymentId,
        appointment_id: appointmentId,
        refund_appointment_ids: reimbursementTargets,
      },
    });

    if (claimError) {
      const code = (claimError as { code?: string }).code;
      if (code === "23505") {
        return { success: false, error: "Este pago ya fue reembolsado" };
      }
      return { success: false, error: claimError.message };
    }

    const client = new MercadoPagoConfig({ accessToken });
    const refund = new PaymentRefund(client);

    let refundedAmount = 0;
    try {
      const refundResult = await refund.total({ payment_id: mpPaymentId });
      refundedAmount = Number((refundResult as { amount?: number } | null)?.amount || 0);
    } catch (e) {
      // Si MP falla, el claim se borra para que la accion quede reintentable. Un
      // pago que MP rechazo no debe quedar bloqueado como "ya reembolsado".
      await admin
        .from("shop_billing_events")
        .delete()
        .eq("shop_id", shopId!)
        .eq("event_type", "appointment_refund_applied")
        .eq("payload->>payment_id", mpPaymentId);
      console.error("[refundMpPayment] fallo el reembolso en MP, claim liberado:", e);
      return {
        success: false,
        error: `No se pudo procesar el reembolso en Mercado Pago: ${e instanceof Error ? e.message : "error desconocido"}`,
      };
    }

    await admin
      .from("appointments")
      .update({ is_paid: false, updated_at: new Date().toISOString() })
      .in("id", reimbursementTargets)
      .eq("shop_id", shopId!);

    // Egreso contable. Sin esto el Balance del local no ve la plata que salio, y
    // el ingreso original nunca fue caja real: queda asimetrico, pero omitir el
    // egreso es peor, porque el dueño ve que entro plata que en realidad
    // devolvio.
    //
    // `createExpense` no setea `appointment_id`, a proposito: `fetchFlowRange`
    // (Inicio) filtra las filas de `finances` con `appointment_id IS NULL` y
    // `fetchFinanceData` (Caja) no filtra. Si lo seteáramos, Inicio no lo
    // contaria y Caja si: dos pantallas del mismo local con numeros distintos.
    if (refundedAmount > 0) {
      const fd = new FormData();
      fd.set("amount", String(refundedAmount));
      fd.set("category", "Reembolso");
      fd.set(
        "description",
        `Reembolso Mercado Pago ${mpPaymentId} · turno(s) ${reimbursementTargets.join(", ")}`,
      );
      const expenseResult = await createExpense(fd, shopId!);
      if (!expenseResult.success) {
        // El reembolso ya fue devuelto; que falle el asiento no lo deshace.
        // Se avisa para que el local lo registre a mano.
        console.error("[refundMpPayment] el reembolso salio pero no se pudo asentar el gasto:", expenseResult.error);
      }
    }

    await admin.from("mercadopago_logs").insert({
      shop_id: shopId,
      appointment_id: appointmentId,
      mp_preference_id: appointment.mp_preference_id,
      event_type: "refund_processed",
      payload: {
        mp_payment_id: mpPaymentId,
        refunded_by: user?.id,
        refunded_appointment_ids: reimbursementTargets,
      },
    });

    return { success: true };
  } catch (e) {
    console.error("[refundMpPayment] error:", e);
    const message = e instanceof Error ? e.message : "Error al procesar reembolso";
    return { success: false, error: `Error al reembolsar: ${message}` };
  }
}
