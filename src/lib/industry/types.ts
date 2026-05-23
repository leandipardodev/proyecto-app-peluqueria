export const INDUSTRIES = ["peluqueria", "psicologo", "masajista"] as const;

export type Industry = (typeof INDUSTRIES)[number];
