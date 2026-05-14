export type BillingCycle = "monthly" | "semiannual" | "annual";

export const BILLING_PRICES: Record<BillingCycle, number> = {
  monthly: 23000,
  semiannual: 120000,
  annual: 216000,
};

export const BILLING_LABELS: Record<BillingCycle, string> = {
  monthly: "Mensual",
  semiannual: "Semestral",
  annual: "Anual",
};

export function cycleMonths(cycle: BillingCycle): number {
  if (cycle === "annual") return 12;
  if (cycle === "semiannual") return 6;
  return 1;
}
