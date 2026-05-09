import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { MercadoPagoConfig, Preference } from "mercadopago";

export async function POST(request: NextRequest) {
  try {
    const { serviceId } = await request.json();

    if (!serviceId) {
      return NextResponse.json({ error: "Falta el ID del servicio" }, { status: 400 });
    }

    const admin = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll() { return []; },
          setAll() {},
        },
      }
    );

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
      .select("mp_access_token, name, slug")
      .eq("id", service.shop_id)
      .single();

    if (shopError || !shop) {
      return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
    }

    if (!shop.mp_access_token) {
      return NextResponse.json(
        { error: "Este local no acepta pagos online" },
        { status: 400 }
      );
    }

    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    const baseUrl = (
      origin
      || (host ? `https://${host}` : null)
      || process.env.NEXT_PUBLIC_BASE_URL
      || new URL(request.url).origin
    ).replace(/\/+$/, "");

    const slug = shop.slug || "local";
    const successUrl = `${baseUrl}/confirmacion?status=success&slug=${encodeURIComponent(slug)}`;
    const failureUrl = `${baseUrl}/confirmacion?status=failure&slug=${encodeURIComponent(slug)}`;
    const pendingUrl = `${baseUrl}/confirmacion?status=pending&slug=${encodeURIComponent(slug)}`;

    if (!successUrl.startsWith("http")) {
      return NextResponse.json({ error: "No se pudo determinar la URL base" }, { status: 500 });
    }

    const client = new MercadoPagoConfig({ accessToken: shop.mp_access_token as string });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            id: service.id,
            title: `${shop.name} - ${service.name}`,
            quantity: 1,
            unit_price: Number(service.price),
            currency_id: "ARS",
          },
        ],
        back_urls: {
          success: successUrl,
          failure: failureUrl,
          pending: pendingUrl,
        },
        auto_return: "approved",
        external_reference: service.id,
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
