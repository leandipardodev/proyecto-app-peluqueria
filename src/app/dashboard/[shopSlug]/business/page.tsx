import { fetchBusinessData, fetchBusinessHours } from "@/lib/dashboard/shop/business-actions";
import { fetchServices } from "@/lib/dashboard/services/service-actions";
import { fetchBookingTheme } from "@/lib/dashboard/shop/booking-theme-actions";
import { fetchVoucherWhatsappTemplate } from "@/lib/dashboard/vouchers/voucher-actions";
import { getWhatsAppAutomationOverviewForShop } from "@/lib/dashboard/whatsapp/wa-actions";
import BusinessClient from "@/app/dashboard/business/business-client";
import { getCachedUser, getCachedShopIdBySlug, getCurrentUserRole, createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { getShopFeatures } from "@/lib/industry/features";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardShopBusinessPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");

  const adminClient = await createServiceRoleClient();
  const staffPromise = adminClient
    .from("shop_memberships")
    .select("user_id, role")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .in("role", ["owner", "staff", "admin"]);

  const sellablePromise = adminClient
    .from("stock")
    .select("id")
    .eq("shop_id", shopId)
    .eq("for_sale", true);

  // Los nombres del equipo dependen de `staffPromise`, pero no del resto del
  // fan-out: se encadena al vuelo para no pagar un round trip extra al final.
  const staffNamesPromise = staffPromise.then(async ({ data: memberships }) => {
    const memberIds = (memberships || []).map((m) => m.user_id).filter(Boolean);
    if (memberIds.length === 0) return [] as { id: string; name: string }[];
    const { data: profiles } = await adminClient
      .from("user_profiles")
      .select("user_id, name")
      .in("user_id", memberIds);
    return (profiles || []).map((p) => ({ id: p.user_id, name: p.name || "Sin nombre" }));
  });

  const [result, servicesResult, businessHoursResult, bookingThemeResult, voucherTemplateResult, whatsAppOverviewResult, sellableResult, features, staffNames, roleResult] = await Promise.all([
    fetchBusinessData(shopId),
    fetchServices(shopId),
    fetchBusinessHours(shopId),
    fetchBookingTheme(shopId),
    fetchVoucherWhatsappTemplate(shopId),
    getWhatsAppAutomationOverviewForShop(shopId),
    sellablePromise,
    getShopFeatures(shopId),
    staffNamesPromise,
    // Los fetchers de arriba ya la piden para autorizar: al estar memoizada por
    // request no suma ninguna query, y el filtro `is_active: true` reemplaza al
    // chequeo manual que hacia esta pagina.
    getCurrentUserRole(shopId),
  ]);
  const storeProductCount = sellableResult.data?.length ?? 0;
  const role = roleResult.success ? (roleResult.data?.role ?? "staff") : "staff";
  const canManageBilling = roleResult.success && roleResult.data?.role === "owner";

  return (
    <BusinessClient
      role={role}
      initialData={result.success ? result.data ?? null : null}
      initialError={result.success ? null : result.error}
      canManageBilling={canManageBilling}
      shopId={shopId}
      shopSlug={shopSlug}
      initialServices={servicesResult.success ? servicesResult.data ?? [] : []}
      initialBusinessHours={businessHoursResult.success ? businessHoursResult.data ?? null : null}
      initialBookingTheme={bookingThemeResult.success ? bookingThemeResult.data ?? null : null}
      initialVoucherWhatsappTemplate={voucherTemplateResult.success ? voucherTemplateResult.data ?? null : null}
      initialWhatsAppAutomation={whatsAppOverviewResult.success ? whatsAppOverviewResult.data ?? null : null}
      initialStaff={staffNames}
      userEmail={user.email}
      storeEnabled={features.store}
      storeProductCount={storeProductCount}
    />
  );
}
