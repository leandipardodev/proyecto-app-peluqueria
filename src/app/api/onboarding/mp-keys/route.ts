import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession, createServiceRoleClient } from "@/lib/dashboard/auth/server";

export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

  const admin = await createServiceRoleClient();
  const { data: membership } = await admin
    .from("shop_memberships")
    .select("shop_id")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .eq("role", "owner")
    .maybeSingle();

  if (!membership) return NextResponse.json({ success: false, error: "Solo el owner puede configurar MP" });

  const { publicKey, accessToken } = await request.json();
  if (!publicKey || !accessToken) return NextResponse.json({ success: false, error: "Faltan claves" });

  const { error } = await admin
    .from("shops")
    .update({ mp_public_key: publicKey, mp_access_token: accessToken, updated_at: new Date().toISOString() })
    .eq("id", membership.shop_id);

  if (error) return NextResponse.json({ success: false, error: error.message });
  return NextResponse.json({ success: true });
}
