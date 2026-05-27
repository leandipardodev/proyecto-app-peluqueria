import { NextRequest, NextResponse } from "next/server";

type WebVitalPayload = {
  id?: string;
  name?: string;
  value?: number;
  rating?: string;
  delta?: number;
  navigationType?: string;
  pathname?: string;
};

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as WebVitalPayload;
    const metricName = payload.name || "unknown";
    const route = payload.pathname || "unknown";

    console.info("[web-vitals]", {
      metric: metricName,
      value: payload.value,
      rating: payload.rating,
      route,
      id: payload.id,
      nav: payload.navigationType,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
