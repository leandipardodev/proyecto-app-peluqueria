import { NextResponse } from "next/server";
import { getShopFeatures } from "@/lib/industry/features";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json({ error: "shopId es requerido" }, { status: 400 });
    }

    const features = await getShopFeatures(shopId);
    return NextResponse.json({ features });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
