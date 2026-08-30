export const INDUSTRIES = ["peluqueria", "psicologo", "masajista", "canchas"] as const;

export type Industry = (typeof INDUSTRIES)[number];

export type IndustryFeatures = {
  inventory: boolean;
  marketing: boolean;
  staff: boolean;
  vouchers: boolean;
  store: boolean;
};

export const DEFAULT_FEATURES: Record<Industry, IndustryFeatures> = {
  peluqueria: { inventory: true, marketing: true, staff: true, vouchers: true, store: false },
  psicologo: { inventory: false, marketing: true, staff: true, vouchers: true, store: false },
  masajista: { inventory: false, marketing: true, staff: true, vouchers: true, store: false },
  canchas: { inventory: false, marketing: true, staff: true, vouchers: true, store: false },
};

// assign_staff_later: true = el dueno asigna el profesional (el cliente no elige).
// false = el cliente elige a su profesional.
export const DEFAULT_ASSIGN_STAFF_LATER: Record<Industry, boolean> = {
  peluqueria: false,
  psicologo: false,
  masajista: true,
  canchas: true,
};
