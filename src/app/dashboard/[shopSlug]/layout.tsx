import { getCachedUser, getCachedShopIdBySlug } from "@/lib/dashboard/auth-server";
import ActiveShopCookieSetter from "./active-shop-cookie-setter";

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

  if (user) {
    shopId = await getCachedShopIdBySlug(shopSlug, user.id);
  }

  return (
    <>
      <ActiveShopCookieSetter shopId={shopId} />
      {children}
    </>
  );
}
