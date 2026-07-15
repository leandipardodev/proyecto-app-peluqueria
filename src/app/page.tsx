import { getBillingPrice } from "@/lib/admin/site-settings";
import Home from "@/components/home";

export const revalidate = 86400;

export default async function Page() {
  const monthlyPrice = await getBillingPrice();
  return <Home monthlyPrice={monthlyPrice} />;
}
