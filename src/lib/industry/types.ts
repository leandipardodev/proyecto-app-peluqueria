export const INDUSTRIES = ["peluqueria", "psicologo", "masajista", "canchas"] as const;

export type Industry = (typeof INDUSTRIES)[number];

export type IndustryFeatures = {
  inventory: boolean;
  marketing: boolean;
  staff: boolean;
  vouchers: boolean;
};

export const DEFAULT_FEATURES: Record<Industry, IndustryFeatures> = {
  peluqueria: { inventory: true, marketing: true, staff: true, vouchers: true },
  psicologo: { inventory: false, marketing: true, staff: true, vouchers: true },
  masajista: { inventory: false, marketing: true, staff: true, vouchers: true },
  canchas: { inventory: false, marketing: true, staff: true, vouchers: true },
};
