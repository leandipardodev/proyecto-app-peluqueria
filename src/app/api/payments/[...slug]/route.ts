import { NextRequest, NextResponse } from "next/server";

function looksLikeMercadoPagoOauthCallback(url: URL) {
  return url.searchParams.has("code") || url.searchParams.has("state") || url.searchParams.has("error");
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string[] }> }) {
  const source = new URL(request.url);
  const params = await context.params;
  const parts = params.slug || [];
  const path = parts.join("/").toLowerCase();

  const isMercadoPagoPath = path.includes("mercadopago") || path.includes("mercado-pago");
  if (!isMercadoPagoPath || !looksLikeMercadoPagoOauthCallback(source)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const target = new URL("/api/payments/mercadopago-oauth/callback", source.origin);
  source.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return NextResponse.redirect(target);
}
