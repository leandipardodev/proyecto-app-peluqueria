import { fetchStaffMembers } from "@/lib/dashboard/staff/staff-actions";
import StaffList from "@/components/staff/staff-list";
import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth/server";
import { createServerClient } from "@/lib/supabase/server";
import { resolveIndustry } from "@/lib/industry/resolve";
import { getShopFeatures } from "@/lib/industry/features";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopStaffPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");

  const supabase = await createServerClient();
  const { data: membership } = await supabase
    .from("shop_memberships")
    .select("role, is_active")
    .eq("user_id", user.id)
    .eq("shop_id", shopId)
    .maybeSingle();
  const canManageStaff = Boolean(membership?.is_active && membership.role === "owner");
  const { data: shop } = await supabase.from("shops").select("industry").eq("id", shopId).maybeSingle();
  const industry = resolveIndustry((shop as { industry?: string | null } | null)?.industry || null);
  const features = await getShopFeatures(shopId);
  if (!features.staff) {
    redirect(`/dashboard/${shopSlug}`);
  }

  const result = await fetchStaffMembers(shopId);
  const { data: servicesData } = await supabase
    .from("services")
    .select("id, name")
    .eq("shop_id", shopId)
    .order("name", { ascending: true });
  const services = (servicesData || []).map((s) => ({ id: s.id, name: s.name }));
  return <StaffList shopId={shopId} shopSlug={shopSlug} industry={industry} initialStaff={result.success ? result.data ?? [] : []} currentUserId={user.id} canManageStaff={canManageStaff} services={services} />;
}
