import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { isOverlapViolation } from "@/lib/db/overlap-violation";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { MercadoPagoConfig, Payment, PreApproval } from "mercadopago";
import { cycleMonths, type BillingCycle } from "@/lib/billing/plans";
import { getArgentinaDateKey } from "@/lib/argentina-time";
import { sendAppointmentConfirmationEmail } from "@/lib/email/booking-emails";
import { createRateLimiter, getClientIp } from "@/lib/rate-limiter";
import { createLogContext, logInfo, logWarn, logError } from "@/lib/api-logger";
import { withRetry } from "@/lib/retry";
import crypto from "crypto";
import { createAdminClient } from "@/lib/dashboard/appointments/shared";
import { restoreOrderStock } from "@/lib/dashboard/store/stock";
import { completedBookingCache } from "@/lib/booking-cache";
import { extractMpAppliedAmounts } from "@/lib/payments/mp-amounts";
import { resolveAutoChargeAmounts } from "@/lib/payments/mp-auto-charge";
import { SHOP_MP_NOT_CONNECTED } from "@/lib/payments/shop-mp";

const webhookLimiter = createRateLimiter({ intervalMs: 60_000, maxRequests: 30 });

function resolveStatusFromPaymentStatus(paymentStatus: string | undefined): "confirmed" | "pending_payment" | "cancelled" {
  if (paymentStatus === "approved") return "confirmed";
  if (paymentStatus === "pending" || paymentStatus === "in_process") return "pending_payment";
  return "cancelled";
}

function parseAutoSubscriptionExternalRef(externalReference: string): string | null {
  if (!externalReference.startsWith("shop_sub_auto:")) return null;
  const shopId = externalReference.slice("shop_sub_auto:".length);
  return shopId || null;
}

function parseBillingExternalReference(externalReference: string): {
  shopId: string;
  cycle: BillingCycle;
} | null {
  const parts = externalReference.split(":");
  if (parts.length < 4) return null;
  if (parts[0] !== "shop_sub") return null;

  const shopId = parts[1];
  const cycleRaw = parts[2];

  if (!shopId) return null;
  if (cycleRaw !== "monthly") return null;

  return { shopId, cycle: cycleRaw };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: string }).code;
  return maybeCode === "23505";
}

/**
 * True cuando Mercado Pago responde que el recurso no existe.
 *
 * El cliente tira objetos planos con `response.status` / `response.data`, no
 * instancias de Error, asi que hay que mirar en los dos lugares.
 */
function isResourceNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const obj = error as { response?: { status?: unknown; data?: unknown }; status?: unknown; message?: unknown };
  const responseStatus = obj.response?.status ?? obj.status;
  if (responseStatus === 404) return true;

  const data = obj.response?.data as { message?: unknown; error?: unknown } | undefined;
  const message = `${String(obj.message ?? "")} ${String(data?.message ?? "")} ${String(data?.error ?? "")}`.toLowerCase();
  return message.includes("not found") || message.includes("no encontrado");
}
/**
 * Manifest que firma Mercado Pago en el header x-signature.
 *
 * Documentado como: id:[data.id];request-id:[x-request-id];ts:[ts]
 * parts que quedan vacias se omiten, y ts siempre va. El separador es ";".
 *
 * OJO: esto NO es el cuerpo de la notificacion. La implementacion anterior
 * firmaba `${rawBody}|${ts}`, que no es lo que hace MP: con el secret correcto
 * igual rechazaba todas las notificaciones con 401, y como MP reintenta cada 15
 * minutos para siempre, la tasa de entrega queda en 0 y el score de calidad en 0.
 */
function buildWebhookSigningManifest(dataId: string, xRequestId: string, ts: string): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (xRequestId) parts.push(`request-id:${xRequestId}`);
  parts.push(`ts:${ts}`);
  return parts.join(";");
}

function verifyMercadoPagoSignature(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null,
  secret: string
): boolean {
  if (!xSignature || !secret) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[mercadopago-webhook] WARNING: x-signature header missing or MP_WEBHOOK_SECRET not configured. Rejecting — set MP_WEBHOOK_SECRET to test webhooks."
      );
    }
    return false;
  }

  const tsMatch = xSignature.match(/ts=(\d+)/);
  const v1Match = xSignature.match(/v1=([a-f0-9]+)/);

  if (!tsMatch || !v1Match) return false;

  // Ventana de frescura. MP documenta 5 minutos. Sin esto, un tuple capturado
  // (x-signature, x-request-id, ts) es valido para siempre.
  const tsSeconds = Number(tsMatch[1]);
  if (!Number.isFinite(tsSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - tsSeconds) > 5 * 60) return false;

  const manifest = buildWebhookSigningManifest(dataId ?? "", xRequestId ?? "", tsMatch[1]);

  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest, "utf8")
    .digest("hex");

  if (expected.length !== v1Match[1].length) return false;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1Match[1]));
}

/**
 * Lee una lista de ids del metadata de Mercado Pago.
 *
 * MP devuelve el metadata tal cual lo mando el emisor: si fue un array puede
 * volver como array, y si fue un string JSON puede volver con doble encoding.
 * Por eso se aceptan las tres formas.
 */
function parseIdList(raw: string[] | string | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    // No es JSON: se cae al split por comas.
  }
  return raw.split(",").map((s: string) => s.trim()).filter(Boolean);
}

function formatDateInArgentina(value: Date | string): string {  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

export async function POST(request: NextRequest) {
  const log = createLogContext("POST", "/api/payments/mercadopago-webhook");
  try {
    const ip = getClientIp(request);
    const rateCheck = await webhookLimiter.check(`webhook:${ip}`);
    if (!rateCheck.allowed) {
      logWarn(log, "Rate limit exceeded", { ip });
      return NextResponse.json({ ok: false, error: "too_many_requests" }, { status: 429 });
    }

    const rawBody = await request.text();
    let payload: { type?: string; data?: { id?: string }; action?: string } | null = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
    }

    const webhookSecret = process.env.MP_WEBHOOK_SECRET || "";
    const xSignature = request.headers.get("x-signature");
    const xRequestId = request.headers.get("x-request-id");
    // El manifest se arma con data.id del query string, no con el cuerpo.
    const notificationDataId = request.nextUrl.searchParams.get("data.id");
    if (!verifyMercadoPagoSignature(xSignature, xRequestId, notificationDataId, webhookSecret)) {
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
    }

    // La firma cubre el data.id del QUERY STRING, pero abajo se actua sobre el
    // data.id del CUERPO. Si no coinciden, la firma no dice nada sobre lo que
    // vamos a procesar: cualquiera con un par (x-request-id, ts) capturado
    // podria colar un cuerpo con otro payment_id.
    //
    // Cuando la URL de notificacion no lleva ?data.id= (las suscripciones se
    // registran sin query string), no hay contra que comparar; en ese caso la
    // ventana de frescura de 5 minutos es lo que acota el replay.
    const bodyDataId = payload?.data?.id ?? null;
    if (notificationDataId && bodyDataId && bodyDataId !== notificationDataId) {
      logWarn(log, "Signature data.id does not match body data.id", {
        notificationDataId,
        bodyDataId,
      });
      return NextResponse.json({ ok: false, error: "data.id mismatch" }, { status: 401 });
    }

    const admin = await createAdminClient();
    const shopId = request.nextUrl.searchParams.get("shop_id");
    const scope = request.nextUrl.searchParams.get("scope");
    let accessToken = process.env.MP_ACCESS_TOKEN || "";

    const queryType = request.nextUrl.searchParams.get("type") || request.nextUrl.searchParams.get("topic");
    const queryDataId = request.nextUrl.searchParams.get("data.id") || request.nextUrl.searchParams.get("id");
    const type = payload?.type || queryType;
    const resourceId = payload?.data?.id || queryDataId;
    const action = payload?.action || "";

    // Los eventos de suscripcion se consultan SIEMPRE con el token de la
    // plataforma, sin importar que la URL traiga shop_id.
    //
    // No es una preferencia: /billing/checkout y /billing/subscription/activate
    // crean el cobro con MP_ACCESS_TOKEN a secas, asi que el pago vive en la
    // cuenta de la plataforma. Si el webhook usara el token del local, buscar
    // el pago por external_reference no devolveria nada y todos los auto-cargos
    // caerian en needs_review. Klip es merchant of record de las suscripciones
    // justamente porque necesita el dinero en su cuenta para pagar comisiones.
    //
    // Esto se decide ANTES de resolver el token del local: si un evento de
    // suscripcion llegara con shop_id y el local todavia no conecto su cuenta,
    // el early return de abajo lo rechazaba con 400 y la suscripcion nunca se
    // actualizaba. El chequeo va primero justamente para que eso no importe.
    const isSubscriptionEvent = type === "subscription_preapproval" || type === "subscription_charged";

    if (isSubscriptionEvent) {
      accessToken = process.env.MP_ACCESS_TOKEN || "";
      if (!accessToken) {
        return NextResponse.json({ ok: false, error: "MP_ACCESS_TOKEN no configurado" }, { status: 500 });
      }
    } else if (shopId && scope !== "billing") {
      const { data: shop } = await admin
        .from("shops")
        .select("id, mp_access_token")
        .eq("id", shopId)
        .maybeSingle();

      if (!shop?.mp_access_token) {
        return NextResponse.json({ ok: false, error: SHOP_MP_NOT_CONNECTED }, { status: 400 });
      }

      accessToken = shop.mp_access_token as string;
    }

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Mercado Pago token missing" }, { status: 500 });
    }

    // --- Subscription preapproval events (authorized / cancelled) ---
    if (type === "subscription_preapproval" && resourceId) {
      // Solo estas dos acciones cambian algo. Se filtran ANTES de pegarle
      // a la API de MP: `preapproval.created` llega al crear la suscripcion
      // (antes de cualquier cobro) y `preapproval.authorized` es la unica
      // accion real de una suscripcion cobrada. `preapproval.approved` no
      // existe en MP; aceptarla era inventarse un evento.
      //
      // Aparte de corregir el regalamo de meses, filtrar aca evita una llamada
      // a la API por cada evento que no hacemos nada.
      if (action !== "preapproval.authorized" && action !== "preapproval.cancelled") {
        logInfo(log, "subscription_preapproval con accion no manejada; ignorada", {
          action,
          preapproval_id: resourceId,
        });
        return NextResponse.json({ ok: true });
      }

      const client = new MercadoPagoConfig({ accessToken });
      const preapprovalClient = new PreApproval(client);
      const preapprovalResult = await preapprovalClient.get({ id: resourceId });

      const externalRef = preapprovalResult.external_reference || "";
      const shopId = parseAutoSubscriptionExternalRef(externalRef);

      if (!shopId) {
        return NextResponse.json({ ok: true });
      }

      if (action === "preapproval.authorized") {
        await admin.from("shop_subscriptions").upsert(
          {
            shop_id: shopId,
            preapproval_id: resourceId,
            payer_id: String(preapprovalResult.payer_id ?? ""),
            status: "authorized",
          },
          { onConflict: "preapproval_id", ignoreDuplicates: false }
        );

        const { data: shop } = await admin
          .from("shops")
          .select("id, plan_expiry")
          .eq("id", shopId)
          .maybeSingle();

        if (shop) {
          const now = new Date();
          const currentExpiry = shop.plan_expiry ? new Date(shop.plan_expiry) : null;
          const todayAr = formatDateInArgentina(now);
          const expiryAr = currentExpiry ? formatDateInArgentina(currentExpiry) : null;
          const hasPaidDaysRemaining = Boolean(currentExpiry && expiryAr && expiryAr > todayAr);
          const base = hasPaidDaysRemaining && currentExpiry ? currentExpiry : now;
          const nextExpiry = new Date(base);
          nextExpiry.setMonth(nextExpiry.getMonth() + 1);

          await admin
            .from("shops")
            .update({
              active: true,
              plan_expiry: nextExpiry.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", shopId);
        }

        await admin.from("shop_billing_events").insert({
          shop_id: shopId,
          actor_user_id: null,
          event_type: "subscription_auto_activated",
          payload: { preapproval_id: resourceId },
        });
      } else if (action === "preapproval.cancelled") {
        await admin
          .from("shop_subscriptions")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("preapproval_id", resourceId);
      }

      return NextResponse.json({ ok: true });
    }

    // --- Subscription charged events (automatic monthly charge) ---
    if (type === "subscription_charged" && resourceId) {
      const { data: sub } = await admin
        .from("shop_subscriptions")
        .select("id, shop_id, status")
        .eq("preapproval_id", resourceId)
        .maybeSingle();

      if (sub && sub.status === "authorized") {
        // CLAIM PRIMERO. Antes se extendia plan_expiry y recien despues se
        // insertaba el evento del ledger, asi que cada reintento de MP (cada 15
        // min, para siempre) regalaba un mes. El indice unico de la migracion
        // 102 (por payment_id) solo cubre el caso en que se resuelve el pago;
        // la migracion 108 agrega charge_key para el resto.
        //
        // A diferencia del pago inicial, el webhook de subscription_charged NO
        // trae el pago: trae el id del preapproval. Y el PreApproval de MP no
        // expone el id del ultimo cobro, solo el monto (summarized
        // .last_charged_amount) que NO incluye la fee. Como la comision del
        // referidos se calcula sobre el neto, sin el pago real no hay forma
        // exacta de saber cuanto entro.
        //
        // Asi que se busca el pago por external_reference y se elige el que
        // corresponde a ESTE cobro. Si no se puede resolver con confianza, el
        // evento se escribe igual (para que la secuencia de pagos del local
        // avance) pero SIN montos: el sync lo marca needs_review en vez de
        // inventar un neto.
        // shop_subscriptions no guarda el external_reference, pero es
        // deterministico: subscription/activate siempre arma
        // `shop_sub_auto:<shopId>`.
        const autoExternalRef = `shop_sub_auto:${sub.shop_id}`;
        const autoAmounts = await resolveAutoChargeAmounts({
          accessToken,
          preapprovalId: resourceId,
          externalReference: autoExternalRef,
        });

        // Un auto-cargo por ciclo mensual: dos eventos con la misma clave son la
        // misma notificacion reintentada.
        const chargeKey = `${resourceId}:${formatDateInArgentina(new Date()).slice(0, 7)}`;

        const { error: chargeError } = await admin.from("shop_billing_events").insert({
          shop_id: sub.shop_id,
          actor_user_id: null,
          event_type: "subscription_auto_charge_applied",
          payload: {
            preapproval_id: resourceId,
            charge_key: chargeKey,
            external_reference: autoExternalRef,
            ...(autoAmounts.paymentId ? { payment_id: autoAmounts.paymentId } : {}),
            ...(autoAmounts.amounts
              ? {
                  gross_amount: autoAmounts.amounts.gross_amount,
                  mp_fee: autoAmounts.amounts.mp_fee,
                  net_amount: autoAmounts.amounts.net_amount,
                  amount_source: autoAmounts.amounts.source,
                }
              : {}),
            ...(autoAmounts.liveMode === false ? { mp_live_mode: false } : {}),
          },
        });

        if (chargeError && isUniqueViolation(chargeError)) {
          // Ya se aplico este cobro (indice de 102 o de 108). Es el camino
          // normal de un reintento de MP, no un fallo.
          logInfo(log, "subscription_auto_charge ya aplicado; reintento ignorado", {
            preapproval_id: resourceId,
            charge_key: chargeKey,
          });
          return NextResponse.json({ ok: true });
        }

        if (chargeError) {
          // No se pudo escribir el ledger. Extender plan_expiry sin ledger
          // seria dar un mes sin registro que lo respalde, asi que se corta.
          logError(log, "No se pudo guardar subscription_auto_charge_applied", {
            error: chargeError.message,
            preapproval_id: resourceId,
          });
          return NextResponse.json({ ok: false, error: "charge_event_failed" }, { status: 500 });
        }

        // Claim exitoso: recien ahora se extiende el plan.
        const { data: shop } = await admin
          .from("shops")
          .select("id, plan_expiry")
          .eq("id", sub.shop_id)
          .maybeSingle();

        if (shop) {
          const now = new Date();
          const currentExpiry = shop.plan_expiry ? new Date(shop.plan_expiry) : null;
          const todayAr = formatDateInArgentina(now);
          const expiryAr = currentExpiry ? formatDateInArgentina(currentExpiry) : null;
          const hasPaidDaysRemaining = Boolean(currentExpiry && expiryAr && expiryAr > todayAr);
          const base = hasPaidDaysRemaining && currentExpiry ? currentExpiry : now;
          const nextExpiry = new Date(base);
          nextExpiry.setMonth(nextExpiry.getMonth() + 1);

          await admin
            .from("shops")
            .update({
              active: true,
              plan_expiry: nextExpiry.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", sub.shop_id);
        }
      }

      return NextResponse.json({ ok: true });
    }

    // --- Payment events (existing logic) ---
    const paymentId = resourceId;
    if (type !== "payment" || !paymentId) {
      return NextResponse.json({ ok: true });
    }

    const client = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(client);
    let paymentResult;
    try {
      paymentResult = await withRetry(
        () => payment.get({ id: paymentId }),
        { retries: 1, delayMs: 800, onRetry: (attempt) => logWarn(log, `MP API retry ${attempt}`) }
      );
    } catch (error) {
      if (isResourceNotFound(error)) {
        // MP dice que este pago no existe, y no va a empezar a existir: el
        // evento ya se fired. MP reintenta la notificacion cada 15 minutos y,
        // despues del tercero, con el intervalo cada vez mas largo, pero SIN
        // limite. Cada reintento cuenta como entrega fallida en el panel de
        // notificaciones, que es uno de los aspects que MP puntua para dar el
        // score de calidad. Confirmar con 200 corta la insistencia.
        //
        // Un 500 real (bug nuestro, caida de red) sigue_PROPAGANDO el error
        // para que MP reintente: eso si se puede resolver solo.
        logWarn(log, "MP no encuentra el pago: se confirma la notificacion sin procesar", {
          paymentId,
          type,
          action,
        });
        return NextResponse.json({ ok: true, skipped: "payment_not_found" });
      }
      throw error;
    }

    const externalReference = (paymentResult.external_reference as string | undefined) || "";
    if (scope === "billing" || externalReference.startsWith("shop_sub:")) {
      const parsed = parseBillingExternalReference(externalReference);
      if (!parsed) {
        return NextResponse.json({ ok: true });
      }

      const { shopId: extShopId, cycle } = parsed;
      const normalizedPaymentId = String(paymentId);

      await admin.from("shop_billing_events").insert({
        shop_id: extShopId,
        actor_user_id: null,
        event_type: "subscription_payment_webhook",
        payload: {
          payment_id: normalizedPaymentId,
          status: paymentResult.status,
          cycle,
          external_reference: externalReference,
        },
      });

      if (paymentResult.status !== "approved") {
        return NextResponse.json({ ok: true });
      }

      // Lo que entra de verdad a la cuenta. Lo lee el sync de comisiones del
      // referidos, asi que no se toca la logica de suscripciones.
      const appliedAmounts = extractMpAppliedAmounts(paymentResult);

      const { error: lockError } = await admin.from("shop_billing_events").insert({
        shop_id: extShopId,
        actor_user_id: null,
        event_type: "subscription_payment_applied",
        payload: {
          payment_id: normalizedPaymentId,
          status: paymentResult.status,
          cycle,
          external_reference: externalReference,
          ...(appliedAmounts
            ? {
                gross_amount: appliedAmounts.gross_amount,
                mp_fee: appliedAmounts.mp_fee,
                net_amount: appliedAmounts.net_amount,
                amount_source: appliedAmounts.source,
              }
            : {}),
        },
      });

      if (lockError) {
        if (isUniqueViolation(lockError)) {
          return NextResponse.json({ ok: true });
        }
        throw lockError;
      }

      const { data: shop } = await admin
        .from("shops")
        .select("id, plan_expiry")
        .eq("id", extShopId)
        .maybeSingle();

      if (shop) {
        const now = new Date();
        const currentExpiry = shop.plan_expiry ? new Date(shop.plan_expiry) : null;
        const todayAr = formatDateInArgentina(now);
        const expiryAr = currentExpiry ? formatDateInArgentina(currentExpiry) : null;
        const hasPaidDaysRemaining = Boolean(currentExpiry && expiryAr && expiryAr > todayAr);
        const base = hasPaidDaysRemaining && currentExpiry ? currentExpiry : now;
        const nextExpiry = new Date(base);
        nextExpiry.setMonth(nextExpiry.getMonth() + cycleMonths(cycle));

        await admin
          .from("shops")
          .update({
            active: true,
            plan_expiry: nextExpiry.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", extShopId);

        await trackProductEvent(extShopId, "subscription_paid", {
          metadata: { payment_id: normalizedPaymentId, cycle },
        });
      }

      return NextResponse.json({ ok: true });
    }

    // Check if this is a pending_booking (new flow: appointment created after payment)
    const PENDING_BOOKING_PREFIX = "pending_booking:";
    if (externalReference.startsWith(PENDING_BOOKING_PREFIX)) {
      const bookingId = externalReference.slice(PENDING_BOOKING_PREFIX.length);
      if (!bookingId) {
        return NextResponse.json({ ok: true });
      }

      const { data: booking } = await admin
        .from("pending_bookings")
        .select("id, shop_id, status, customer_phone, customer_email, customer_name, service_id, start_time, end_time, created_at, expires_at, staff_id, deposit_amount, mp_preference_id, ip_address")
        .eq("id", bookingId)
        .maybeSingle();

      if (!booking || booking.status !== "pending") {
        return NextResponse.json({ ok: true });
      }

      if (booking.expires_at && new Date(booking.expires_at) < new Date()) {
        console.log(`[WEBHOOK] Pending booking ${bookingId} already expired, skipping`);
        await admin.from("pending_bookings").update({ status: "expired" }).eq("id", booking.id);
        return NextResponse.json({ ok: true });
      }

      const normalizedPaymentId = String(paymentId);

      if (paymentResult.status === "approved") {
        // Atomically claim this pending_booking — only one request succeeds
        const { data: claimedBooking } = await admin
          .from("pending_bookings")
          .update({ status: "completed" })
          .eq("id", booking.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();

        if (!claimedBooking) {
          // Another request already claimed and processed this booking
          return NextResponse.json({ ok: true });
        }

        // Insert billing event as audit trail (no longer used as idempotency lock)
        await admin.from("shop_billing_events").insert({
          shop_id: booking.shop_id,
          actor_user_id: null,
          event_type: "appointment_payment_applied",
          payload: {
            payment_id: normalizedPaymentId,
            pending_booking_id: booking.id,
            status: paymentResult.status,
          },
        });

        // Create or update customer (tolerant of concurrent duplicate inserts)
        let customerId: string;
        const selectCustomerByPhone = () =>
          admin
            .from("customers")
            .select("id")
            .eq("shop_id", booking.shop_id)
            .eq("telefono", booking.customer_phone)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        const updateCustomerById = (id: string) =>
          admin
            .from("customers")
            .update({
              nombre: booking.customer_name,
              email: booking.customer_email || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);

        const { data: existingCustomer } = await selectCustomerByPhone();

        if (existingCustomer) {
          customerId = existingCustomer.id;
          const { error: updateCustError } = await updateCustomerById(customerId);
          if (updateCustError) throw updateCustError;
        } else {
          const { data: newCustomer, error: custError } = await admin
            .from("customers")
            .insert({
              shop_id: booking.shop_id,
              nombre: booking.customer_name,
              telefono: booking.customer_phone,
              email: booking.customer_email || null,
            })
            .select("id")
            .single();

          if (custError) {
            if (isUniqueViolation(custError)) {
              const { data: racedCustomer } = await selectCustomerByPhone();
              if (racedCustomer) {
                customerId = racedCustomer.id;
                const { error: updateCustError } = await updateCustomerById(customerId);
                if (updateCustError) throw updateCustError;
              } else {
                throw custError;
              }
            } else {
              throw custError;
            }
          } else {
            customerId = newCustomer.id;
          }
        }

        // Re-check slot availability — may have been taken since pending_booking was created
        const startStr = booking.start_time;
        const endStr = booking.end_time;

        let conflictQuery = admin
          .from("appointments")
          .select("id")
          .eq("shop_id", booking.shop_id)
          .not("status", "eq", "cancelled")
          .lt("start_time", endStr)
          .gt("end_time", startStr);

        if (booking.staff_id) {
          conflictQuery = conflictQuery.eq("staff_id", booking.staff_id);
        }

        const { data: conflict } = await conflictQuery.limit(1);

        if (conflict && conflict.length > 0) {
          await admin.from("pending_bookings").update({ status: "expired" }).eq("id", booking.id);
          return NextResponse.json({ ok: true });
        }

        // Create appointment
        const { data: service } = await admin
          .from("services")
          .select("name, price")
          .eq("id", booking.service_id)
          .maybeSingle();

        const { data: shop } = await admin
          .from("shops")
          .select("nombre, address, localidad, google_maps_url, phone, instagram_url, whatsapp_template")
          .eq("id", booking.shop_id)
          .maybeSingle();

        const { data: createdAppointment, error: aptError } = await admin
          .from("appointments")
          .insert({
            shop_id: booking.shop_id,
            customer_id: customerId,
            staff_id: booking.staff_id || null,
            service_id: booking.service_id,
            service_price: service?.price ?? null,
            start_time: booking.start_time,
            end_time: booking.end_time,
            date_key_ar: getArgentinaDateKey(booking.start_time),
            status: "confirmed",
            is_paid: true,
            deposit_amount: booking.deposit_amount,
            mp_preference_id: booking.mp_preference_id,
          })
          .select("id")
          .single();

        if (aptError) throw aptError;

        // Cache the IP so repeat bookings from this IP trigger login_required
        if (booking.ip_address) {
          const ipKey = `completed-booking:${booking.ip_address}:${booking.shop_id}`;
          completedBookingCache.set(ipKey, true);
        }

        // Send confirmation email
        if (booking.customer_email) {
          const shopData = shop as { nombre?: string | null; address?: string | null; localidad?: string | null; google_maps_url?: string | null; phone?: string | null; instagram_url?: string | null; whatsapp_template?: string | null } | null;
          const serviceName = (service as { name?: string | null } | null)?.name || "Servicio";
          const locationParts = [shopData?.address?.trim(), shopData?.localidad?.trim()].filter(Boolean);
          const shopAddress = locationParts.length > 0 ? locationParts.join(", ") : undefined;
          const mapsUrl = shopData?.google_maps_url?.trim() || undefined;
          const cleanPhone = shopData?.phone?.replace(/^\+/, "").replace(/\D/g, "") || "";
          const whatsappUrl = cleanPhone.length >= 7 ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(shopData?.whatsapp_template || "Hola! Quiero consultar sobre un turno")}` : undefined;

          sendAppointmentConfirmationEmail({
            to: booking.customer_email,
            customerName: booking.customer_name,
            shopName: shopData?.nombre || "Klip",
            serviceName,
            shopAddress,
            startTime: booking.start_time,
            endTime: booking.end_time,
            mapsUrl,
            instagramUrl: shopData?.instagram_url?.trim() || undefined,
            whatsappUrl,
          }).catch((err) => console.error("[webhook] confirmation email error:", err));
        }

        return NextResponse.json({ ok: true });
      } else {
        // Payment not approved — mark booking as expired/cancelled
        const cancelStatus = paymentResult.status === "cancelled" ? "cancelled" : "expired";
        await admin
          .from("pending_bookings")
          .update({ status: cancelStatus })
          .eq("id", booking.id);

        return NextResponse.json({ ok: true });
      }
    }

    // --- Combined booking + store checkout (appointments + order in one payment) ---
    if (paymentResult.metadata?.type === "combined") {
      const combinedAppointmentId = paymentResult.metadata?.appointment_id as string | undefined;
      const combinedOrderId = paymentResult.metadata?.order_id as string | undefined;
      if (!combinedAppointmentId || !combinedOrderId) return NextResponse.json({ ok: true });

      const combinedOrderQuery = admin.from("orders").select("id, shop_id, status").eq("id", combinedOrderId);

      const { data: combinedOrder } = await combinedOrderQuery.maybeSingle();
      if (!combinedOrder || combinedOrder.status !== "pending_payment") return NextResponse.json({ ok: true });

      const extraIds = parseIdList(paymentResult.metadata?.combo_appointment_ids as string[] | string | undefined);
      const combinedPaidIds = parseIdList(paymentResult.metadata?.paid_appointment_ids as string[] | string | undefined);
      const allCombinedIds: string[] = [combinedAppointmentId, ...(combinedPaidIds.length > 0 ? combinedPaidIds : extraIds).filter((id: string) => id !== combinedAppointmentId)];

      const preferenceId = (paymentResult.order?.id as string | undefined) || (paymentResult.metadata?.preference_id as string | undefined) || undefined;
      const normalizedPaymentId = String(paymentId);

      if (paymentResult.status === "approved") {
        for (const aptId of allCombinedIds) {
          const { error: confirmError } = await withRetry(
            () => admin
              .from("appointments")
              .update({
                status: "confirmed",
                is_paid: true,
                mp_preference_id: preferenceId,
                updated_at: new Date().toISOString(),
              })
              .eq("id", aptId)
              .eq("shop_id", combinedOrder.shop_id)
              .in("status", ["pending_payment", "confirmed"])
              .then((r) => r as { error: unknown }),
            { retries: 1, delayMs: 500 }
          );

          // 23P01 = constraint de la migracion 109. El turno ya esta tomado por
          // otro que se confirmo antes. El pago se registra igual y el turno
          // queda para que lo resuelva el local; no se aborta el checkout.
          if (confirmError && isOverlapViolation(confirmError)) {
            logWarn(log, "Turno combinado no se pudo confirmar por solape", {
              appointment_id: aptId,
              order_id: combinedOrderId,
            });
          }
        }

        // Claim the order — only one request succeeds (idempotency)
        const { data: claimedOrder } = await admin
          .from("orders")
          .update({
            status: "paid",
            confirmed_at: new Date().toISOString(),
            mp_payment_id: normalizedPaymentId,
            mp_preference_id: preferenceId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", combinedOrder.id)
          .eq("status", "pending_payment")
          .select("id")
          .maybeSingle();

        if (!claimedOrder) return NextResponse.json({ ok: true });
      } else {
        for (const aptId of allCombinedIds) {
          await withRetry(
            () => admin
              .from("appointments")
              .update({
                status: "cancelled",
                is_paid: false,
                updated_at: new Date().toISOString(),
              })
              .eq("id", aptId)
              .eq("shop_id", combinedOrder.shop_id)
              .in("status", ["pending_payment", "confirmed"])
              .then((r) => r as { error: unknown }),
            { retries: 1, delayMs: 500 }
          );
        }

        const cancelStatus = paymentResult.status === "cancelled" ? "cancelled" : "expired";
        const { data: claimedOrder } = await admin
          .from("orders")
          .update({
            status: cancelStatus,
            mp_payment_id: normalizedPaymentId,
            mp_preference_id: preferenceId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", combinedOrder.id)
          .eq("status", "pending_payment")
          .select("id")
          .maybeSingle();

        if (!claimedOrder) return NextResponse.json({ ok: true });
        await restoreOrderStock(admin, combinedOrder.shop_id, combinedOrder.id);
      }

      await admin.from("mercadopago_logs").insert({
        shop_id: combinedOrder.shop_id,
        appointment_id: combinedAppointmentId,
        mp_preference_id: preferenceId,
        event_type: "payment_webhook",
        payload: {
          payment_id: normalizedPaymentId,
          status: paymentResult.status,
          order_id: combinedOrder.id,
          external_reference: paymentResult.external_reference,
        },
      });

      return NextResponse.json({ ok: true });
    }

    // --- Store order payments (independent product orders) ---
    const orderIdFromMetadata = paymentResult.metadata?.order_id as string | undefined;
    if (paymentResult.metadata?.type === "store_order" || orderIdFromMetadata) {
      const orderId = orderIdFromMetadata || externalReference;
      if (!orderId) return NextResponse.json({ ok: true });

      let orderQuery = admin.from("orders").select("id, shop_id, status").eq("id", orderId);
      if (shopId) orderQuery = orderQuery.eq("shop_id", shopId);

      const { data: order } = await orderQuery.maybeSingle();
      if (!order || order.status !== "pending_payment") return NextResponse.json({ ok: true });

      const preferenceId = (paymentResult.order?.id as string | undefined) || (paymentResult.metadata?.preference_id as string | undefined) || undefined;
      const normalizedPaymentId = String(paymentId);

      if (paymentResult.status === "approved") {
        const { data: claimed } = await admin
          .from("orders")
          .update({
            status: "paid",
            confirmed_at: new Date().toISOString(),
            mp_payment_id: normalizedPaymentId,
            mp_preference_id: preferenceId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id)
          .eq("status", "pending_payment")
          .select("id")
          .maybeSingle();

        if (!claimed) return NextResponse.json({ ok: true });
      } else {
        const cancelStatus = paymentResult.status === "cancelled" ? "cancelled" : "expired";
        const { data: claimed } = await admin
          .from("orders")
          .update({
            status: cancelStatus,
            mp_payment_id: normalizedPaymentId,
            mp_preference_id: preferenceId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id)
          .eq("status", "pending_payment")
          .select("id")
          .maybeSingle();

        if (!claimed) return NextResponse.json({ ok: true });
        await restoreOrderStock(admin, order.shop_id, order.id);
      }

      await admin.from("mercadopago_logs").insert({
        shop_id: order.shop_id,
        mp_preference_id: preferenceId,
        event_type: "payment_webhook",
        payload: {
          payment_id: normalizedPaymentId,
          status: paymentResult.status,
          order_id: order.id,
          external_reference: paymentResult.external_reference,
        },
      });

      return NextResponse.json({ ok: true });
    }

    const appointmentId =
      (paymentResult.metadata?.appointment_id as string | undefined) ||
      (paymentResult.external_reference as string | undefined);

    if (!appointmentId) {
      return NextResponse.json({ ok: true });
    }

    const status = resolveStatusFromPaymentStatus(paymentResult.status);
    const normalizedPaymentId = String(paymentId);

    let appointmentQuery = admin
      .from("appointments")
      .select("id, shop_id")
      .eq("id", appointmentId);

    if (shopId) {
      appointmentQuery = appointmentQuery.eq("shop_id", shopId);
    }

    const { data: appointment } = await appointmentQuery.maybeSingle();

    if (!appointment) {
      return NextResponse.json({ ok: true });
    }

    const preferenceId = (paymentResult.order?.id as string | undefined) || (paymentResult.metadata?.preference_id as string | undefined) || undefined;

    // Determine which appointment IDs to update (main + any combo-linked appointments)
    //
    // `paid_appointment_ids` lo calcula el servidor al crear la preferencia y es
    // la unica lista confiable: dice que turnos se pagaron de verdad. La lista
    // que mandaba el cliente (`combo_appointment_ids`) se usa solo como fallback
    // para preferencias creadas antes de que existiera la del servidor.
    //
    // Sin esto, un cliente podia colar en el pago un servicio con hide_price
    // ("a convenir") y el webhook lo confirmaba igual, sin haberlo pagado.
    const paidIds = parseIdList(paymentResult.metadata?.paid_appointment_ids as string[] | string | undefined);
    const source = paidIds.length > 0 ? paidIds : parseIdList(paymentResult.metadata?.combo_appointment_ids as string[] | string | undefined);

    // El turno principal siempre se procesa: es el external_reference del pago.
    const allAppointmentIds: string[] = Array.from(new Set([appointment.id, ...source]));

    // Update all linked appointments
    for (const aptId of allAppointmentIds) {
      const { error: updateError } = await withRetry(
        () => admin
          .from("appointments")
          .update({
            status,
            is_paid: paymentResult.status === "approved",
            mp_preference_id: preferenceId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", aptId)
          .eq("shop_id", appointment.shop_id)
          .in("status", ["pending_payment", "confirmed"])
          .then((r) => r as { error: unknown }),
        { retries: 1, delayMs: 500 }
      );

      if (updateError) {
        // 23P01 = la constraint de la migracion 109. Pasa cuando dos carritos
        //-conviven sobre el mismo horario (pending_payment queda fuera del
        // predicado a proposito, por la retencion de 10 minutos) y este ya fue
        // tomado. El cliente ya pago: no se tira el pago, se deja el turno para
        // que lo resuelva el local y se sigue con el resto.
        if (isOverlapViolation(updateError)) {
          logWarn(log, "Turno no se pudo confirmar por solape; el pago quedo registrado", {
            appointment_id: aptId,
            shop_id: appointment.shop_id,
          });
          continue;
        }
        throw updateError;
      }
    }

    // Insert billing event after successful appointment update
    if (paymentResult.status === "approved") {
      const { error: lockError } = await withRetry(
        () => admin.from("shop_billing_events").insert({
          shop_id: appointment.shop_id,
          actor_user_id: null,
          event_type: "appointment_payment_applied",
          payload: {
            payment_id: normalizedPaymentId,
            appointment_id: appointment.id,
            status: paymentResult.status,
            external_reference: paymentResult.external_reference,
          },
        }).then((r) => r as { error: unknown }),
        { retries: 1, delayMs: 500 }
      );

      if (lockError) {
        if (!isUniqueViolation(lockError)) {
          throw lockError;
        }
        // Unique violation means billing event already recorded — appointment is already updated, safe to return OK
      }
    }

    await admin.from("mercadopago_logs").insert({
      shop_id: appointment.shop_id,
      appointment_id: appointment.id,
      mp_preference_id: preferenceId,
      event_type: "payment_webhook",
      payload: {
        payment_id: normalizedPaymentId,
        status: paymentResult.status,
        external_reference: paymentResult.external_reference,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(log, "Webhook processing failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  // MP sends GET for endpoint validation — just confirm the endpoint exists
  return NextResponse.json({ ok: true });
}
