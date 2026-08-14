import { Suspense } from "react";
import { getCachedUser, getCachedShopIdBySlug, checkShopExpired } from "@/lib/dashboard/auth/server";
import { autoCompletePastAppointments } from "@/lib/dashboard/appointments/mutations";
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
      // Reemplazo del cron de auto-complete: al entrar al local se completan
      // los turnos vencidos. Es barato (retorna al toque si el auto-complete
      // está desactivado) y el dedupe evita corridas concurrentes.
      void autoCompletePastAppointments(shopId).catch(() => {});
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
