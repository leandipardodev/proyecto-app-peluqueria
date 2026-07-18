import { getBillingSettings } from "@/lib/admin/site-settings";
import Home from "@/components/home";

export const revalidate = 86400;

export default async function Page() {
  const { monthly_price: monthlyPrice, trial_days: trialDays } = await getBillingSettings();
  return <Home monthlyPrice={monthlyPrice} trialDays={trialDays} />;
}
