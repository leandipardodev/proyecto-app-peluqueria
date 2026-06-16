import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth-server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchVouchers, fetchVoucherWhatsappTemplate } from "@/lib/dashboard/voucher-actions";
import { fetchBusinessData } from "@/lib/dashboard/business-actions";
import { redirect } from "next/navigation";
import { getShopFeatures } from "@/lib/industry/features";
import FidelizacionClient from "./fidelizacion-client";

type LoyaltyRewardCustomer = {
  id: string;
  nombre: string | null;
  loyalty_rewards_available: number | null;
};

export const dynamic = "force-dynamic";

export default async function DashboardShopFidelizacionPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const [user, { shopSlug }] = await Promise.all([getCachedUser(), params]);
  if (!user) redirect("/login");
  const shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  if (!shopId) redirect("/dashboard");

  const features = await getShopFeatures(shopId);
  if (!features.marketing) {
    redirect(`/dashboard/${shopSlug}`);
  }

  const supabase = await createServerClient();

  const [vouchersResult, templateResult, businessResult, rewardsResult] = await Promise.all([
    fetchVouchers(shopId),
    fetchVoucherWhatsappTemplate(shopId),
    fetchBusinessData(shopId),
    (async () => {
      try {
        return await supabase
          .from("customers")
          .select("id, nombre, loyalty_rewards_available")
          .eq("shop_id", shopId)
          .gt("loyalty_rewards_available", 0)
          .order("loyalty_rewards_available", { ascending: false })
          .limit(8);
      } catch {
        return { data: null, error: null };
      }
    })(),
  ]);

  const loyaltyRewardCustomers: LoyaltyRewardCustomer[] = (rewardsResult.data ?? []) as LoyaltyRewardCustomer[];

  return (
    <FidelizacionClient
      shopId={shopId}
      vouchers={vouchersResult.success ? vouchersResult.data ?? [] : []}
      voucherTemplate={templateResult.success ? templateResult.data ?? undefined : undefined}
      loyaltyEnabled={businessResult.success ? businessResult.data?.loyalty_enabled !== false : true}
      loyaltyCutsRequired={businessResult.success ? businessResult.data?.loyalty_cuts_required ?? 10 : 10}
      loyaltyDiscountPercent={businessResult.success ? businessResult.data?.loyalty_discount_percent ?? 10 : 10}
      loyaltyRewardCustomers={loyaltyRewardCustomers}
    />
  );
}
