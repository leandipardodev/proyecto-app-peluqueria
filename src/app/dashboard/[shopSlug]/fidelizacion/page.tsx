import { getAuthSession, getShopIdBySlug } from "@/lib/dashboard/auth-server";
import { fetchVouchers, fetchVoucherWhatsappTemplate } from "@/lib/dashboard/voucher-actions";
import { fetchBusinessData } from "@/lib/dashboard/business-actions";
import { notFound } from "next/navigation";
import FidelizacionClient from "./fidelizacion-client";

export const dynamic = "force-dynamic";

export default async function DashboardShopFidelizacionPage({ params }: { params: Promise<{ shopSlug: string }> }) {
  const session = await getAuthSession();
  if (!session) notFound();
  const { shopSlug } = await params;
  const shopId = await getShopIdBySlug(shopSlug, session.user.id);
  if (!shopId) notFound();

  const [vouchersResult, templateResult, businessResult] = await Promise.all([
    fetchVouchers(shopId),
    fetchVoucherWhatsappTemplate(shopId),
    fetchBusinessData(shopId),
  ]);

  return (
    <FidelizacionClient
      shopId={shopId}
      vouchers={vouchersResult.success ? vouchersResult.data ?? [] : []}
      voucherTemplate={templateResult.success ? templateResult.data ?? undefined : undefined}
      loyaltyEnabled={businessResult.success ? businessResult.data?.loyalty_enabled !== false : true}
      loyaltyCutsRequired={businessResult.success ? businessResult.data?.loyalty_cuts_required ?? 10 : 10}
      loyaltyDiscountPercent={businessResult.success ? businessResult.data?.loyalty_discount_percent ?? 10 : 10}
    />
  );
}
