export const INDUSTRIES = ["peluqueria", "psicologo", "masajista", "canchas"] as const;

export type Industry = (typeof INDUSTRIES)[number];

export type IndustryFeatures = {
  inventory: boolean;
};

export const DEFAULT_FEATURES: Record<Industry, IndustryFeatures> = {
  peluqueria: { inventory: true },
  psicologo: { inventory: false },
  masajista: { inventory: false },
  canchas: { inventory: false },
};
