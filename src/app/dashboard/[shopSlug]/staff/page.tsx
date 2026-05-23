import { fetchStaffMembers } from "@/lib/dashboard/staff-actions";
import StaffList from "@/components/staff/staff-list";
import { getAuthSession, getShopIdBySlug } from "@/lib/dashboard/auth-server";
import { createServerClient } from "@/lib/supabase/server";
import { resolveIndustry } from "@/lib/industry/resolve";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopStaffPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  const { shopSlug } = await params;
  const shopId = await getShopIdBySlug(shopSlug, session.user.id);
  if (!shopId) redirect("/dashboard");

  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("shop_memberships")
    .select("role, is_active")
    .eq("user_id", session.user.id)
    .eq("shop_id", shopId)
    .maybeSingle();
  const canManageStaff = Boolean(membership?.is_active && membership.role === "owner");
  const { data: shop } = await supabase.from("shops").select("industry").eq("id", shopId).maybeSingle();
  const industry = resolveIndustry((shop as { industry?: string | null } | null)?.industry || null);

  const result = await fetchStaffMembers(shopId);
  return <StaffList shopId={shopId} shopSlug={shopSlug} industry={industry} initialStaff={result.success ? result.data ?? [] : []} currentUserId={session.user.id} canManageStaff={canManageStaff} />;
}
