export type BillingCycle = "monthly";

export const BILLING_PRICES: Record<BillingCycle, number> = {
  monthly: 25000,
};

export const BILLING_LABELS: Record<BillingCycle, string> = {
  monthly: "Mensual",
};

export function cycleMonths(cycle: BillingCycle): number {
  if (cycle === "monthly") return 1;
  return 1;
}
