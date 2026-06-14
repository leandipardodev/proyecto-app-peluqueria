import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getShopFeatures } from "@/lib/industry/features";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");

    if (!shopId) {
      return NextResponse.json({ error: "shopId es requerido" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    let user;
    if (supabaseUrl && anonKey) {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "");
      if (token) {
        const supabase = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user: authUser } } = await supabase.auth.getUser(token);
        user = authUser;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const features = await getShopFeatures(shopId);
    return NextResponse.json({ features });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
