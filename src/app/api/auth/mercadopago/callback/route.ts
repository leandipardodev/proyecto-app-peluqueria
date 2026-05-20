import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const source = new URL(request.url);
  const target = new URL("/api/payments/mercadopago-oauth/callback", source.origin);
  source.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return NextResponse.redirect(target);
}
