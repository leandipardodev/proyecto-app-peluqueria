import "server-only";
import { createServiceRoleClient } from "@/lib/dashboard/auth/server";
import { BILLING_PRICES } from "@/lib/billing/plans";

type BillingSettings = {
  monthly_price: number;
  trial_days: number;
};

const DEFAULT_BILLING: BillingSettings = {
  monthly_price: BILLING_PRICES.monthly,
  trial_days: 14,
};

export async function getBillingSettings(): Promise<BillingSettings> {
  try {
    const admin = await createServiceRoleClient();
    const { data, error } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "billing")
      .maybeSingle();

    if (error || !data?.value) return DEFAULT_BILLING;

    const v = data.value as Record<string, unknown>;
    return {
      monthly_price: typeof v.monthly_price === "number" ? v.monthly_price : DEFAULT_BILLING.monthly_price,
      trial_days: typeof v.trial_days === "number" ? v.trial_days : DEFAULT_BILLING.trial_days,
    };
  } catch {
    return DEFAULT_BILLING;
  }
}

export async function getBillingPrice(): Promise<number> {
  const settings = await getBillingSettings();
  return settings.monthly_price;
}

export function trialLabel(days: number): string {
  if (days % 7 === 0 && days / 7 <= 4) {
    const weeks = days / 7;
    return weeks === 1 ? "1 semana" : `${weeks} semanas`;
  }
  if (days === 30 || days === 31) return "1 mes";
  return days === 1 ? "1 día" : `${days} días`;
}

export async function updateBillingSettings(
  price: number,
  trialDays: number,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await createServiceRoleClient();
    const { error } = await admin
      .from("site_settings")
      .upsert(
        {
          key: "billing",
          value: { monthly_price: price, trial_days: trialDays },
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: "key" }
      );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error desconocido" };
  }
}
