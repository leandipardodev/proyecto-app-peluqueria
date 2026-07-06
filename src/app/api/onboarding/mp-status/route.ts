import { NextResponse } from "next/server";
import { getAuthSession, createServiceRoleClient } from "@/lib/dashboard/auth/server";

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ connected: false });

  const admin = await createServiceRoleClient();
  const { data: memberships } = await admin
    .from("shop_memberships")
    .select("shop_id")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .limit(1);

  const shopId = memberships?.[0]?.shop_id;
  if (!shopId) return NextResponse.json({ connected: false });

  const { data: shop } = await admin
    .from("shops")
    .select("mp_access_token")
    .eq("id", shopId)
    .maybeSingle();

  return NextResponse.json({ connected: Boolean(shop?.mp_access_token) });
}
