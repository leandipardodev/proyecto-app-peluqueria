import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/dashboard/auth-server";
import { MercadoPagoConfig, Preference } from "mercadopago";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serviceId, items: rawItems, shopId } = body;

    const admin = await createServiceRoleClient();

    let mpAccessToken = "";
    let shopSlug = "";
    let mpItems: { id: string; title: string; quantity: number; unit_price: number; currency_id: string }[] = [];
    let shopName = "";

    if (rawItems && Array.isArray(rawItems) && rawItems.length > 0) {
      if (!shopId) {
        return NextResponse.json({ error: "Falta shopId para checkout" }, { status: 400 });
      }

      const { data: shop } = await admin
        .from("shops")
        .select("mp_access_token, nombre, slug")
        .eq("id", shopId)
        .single();

      if (!shop || !shop.mp_access_token) {
        return NextResponse.json({ error: "Este local no acepta pagos online" }, { status: 400 });
      }

      mpAccessToken = shop.mp_access_token as string;
      shopName = shop.nombre as string;
      shopSlug = (shop.slug as string) || "local";

      const requestedServiceIds = rawItems
        .map((item: { id?: string }) => item?.id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

      if (requestedServiceIds.length === 0) {
        return NextResponse.json({ error: "Items de checkout inválidos" }, { status: 400 });
      }

      const { data: services, error: servicesError } = await admin
        .from("services")
        .select("id, name, price")
        .eq("shop_id", shopId)
        .in("id", requestedServiceIds);

      if (servicesError || !services || services.length === 0) {
        return NextResponse.json({ error: "No se pudieron validar los servicios" }, { status: 400 });
      }

      const serviceMap = new Map(services.map((s) => [s.id, s]));
      mpItems = requestedServiceIds
        .map((serviceIdItem) => {
          const svc = serviceMap.get(serviceIdItem);
          if (!svc) return null;
          return {
            id: svc.id,
            title: `${shopName} - ${svc.name}`,
            quantity: 1,
            unit_price: Number(svc.price),
            currency_id: "ARS",
          };
        })
        .filter((item): item is { id: string; title: string; quantity: number; unit_price: number; currency_id: string } => item !== null);

      if (mpItems.length === 0) {
        return NextResponse.json({ error: "No hay servicios válidos para pagar" }, { status: 400 });
      }
    } else if (serviceId) {
      const { data: service, error: serviceError } = await admin
        .from("services")
        .select("id, name, price, shop_id")
        .eq("id", serviceId)
        .single();

      if (serviceError || !service) {
        return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
      }

      const { data: shop, error: shopError } = await admin
        .from("shops")
        .select("mp_access_token, nombre, slug")
        .eq("id", service.shop_id)
        .single();

      if (shopError || !shop) {
        return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
      }

      if (!shop.mp_access_token) {
        return NextResponse.json({ error: "Este local no acepta pagos online" }, { status: 400 });
      }

      mpAccessToken = shop.mp_access_token as string;
      shopName = shop.nombre as string;
      shopSlug = (shop.slug as string) || "local";
      mpItems = [{
        id: service.id,
        title: `${shopName} - ${service.name}`,
        quantity: 1,
        unit_price: Number(service.price),
        currency_id: "ARS",
      }];
    } else {
      return NextResponse.json({ error: "Falta el ID del servicio o los items" }, { status: 400 });
    }

    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    const baseUrl = (
      origin
      || (host ? `https://${host}` : null)
      || process.env.NEXT_PUBLIC_BASE_URL
      || new URL(request.url).origin
    ).replace(/\/+$/, "");

    const successUrl = `${baseUrl}/confirmacion?status=success&slug=${encodeURIComponent(shopSlug)}`;
    const failureUrl = `${baseUrl}/confirmacion?status=failure&slug=${encodeURIComponent(shopSlug)}`;
    const pendingUrl = `${baseUrl}/confirmacion?status=pending&slug=${encodeURIComponent(shopSlug)}`;
    const notificationUrl = `${baseUrl}/api/payments/mercadopago-webhook?shop_id=${encodeURIComponent(shopId || "")}`;

    if (!successUrl.startsWith("http")) {
      return NextResponse.json({ error: "No se pudo determinar la URL base" }, { status: 500 });
    }

    const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: mpItems,
        back_urls: {
          success: successUrl,
          failure: failureUrl,
          pending: pendingUrl,
        },
        auto_return: "approved",
        external_reference: serviceId || "booking",
        notification_url: notificationUrl,
      },
    });

    return NextResponse.json({
      init_point: result.init_point,
      preference_id: result.id,
    });
  } catch (e) {
    console.error("[checkout] error:", e);
    const message = e instanceof Error ? e.message : "Error al procesar el pago";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
