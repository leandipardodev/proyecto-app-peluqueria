import { Suspense } from "react";
import { getCachedUser, getCachedShopIdBySlug, checkShopExpired } from "@/lib/dashboard/auth/server";
import ActiveShopCookieSetter from "./active-shop-cookie-setter";
import ShopBlockedOverlay from "./shop-blocked-overlay";
import NewAppointmentToast from "@/components/dashboard/new-appointment-toast";
import AuthInit from "@/components/dashboard/auth-init";

export default async function ShopSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;
  const user = await getCachedUser();
  let shopId: string | null = null;
  let expired = false;

  if (user) {
    shopId = await getCachedShopIdBySlug(shopSlug, user.id);
    if (shopId) {
      const status = await checkShopExpired(shopId);
      expired = status.expired;
    }
  }

  return (
    <>
      <Suspense fallback={null}>
        <AuthInit />
      </Suspense>
      <ActiveShopCookieSetter shopId={shopId} />
      <NewAppointmentToast shopId={shopId} />
      {children}
      {expired && <ShopBlockedOverlay shopSlug={shopSlug} />}
    </>
  );
}
