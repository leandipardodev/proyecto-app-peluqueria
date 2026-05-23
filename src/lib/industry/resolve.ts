import { INDUSTRIES, type Industry } from "@/lib/industry/types";

export const DEFAULT_INDUSTRY: Industry = "peluqueria";

export function isIndustry(value: string | null | undefined): value is Industry {
  if (!value) return false;
  return (INDUSTRIES as readonly string[]).includes(value);
}

export function resolveIndustry(value: string | null | undefined): Industry {
  const normalized = String(value || "").trim().toLowerCase();
  return isIndustry(normalized) ? normalized : DEFAULT_INDUSTRY;
}
