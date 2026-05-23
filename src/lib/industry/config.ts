import type { Industry } from "@/lib/industry/types";

export type IndustryConfig = {
  key: Industry;
  displayName: string;
  landingPath: `/${string}`;
  labels: {
    customerSingular: string;
    customerPlural: string;
    staffSingular: string;
    staffPlural: string;
    serviceSingular: string;
    servicePlural: string;
  };
};

export const INDUSTRY_CONFIG: Record<Industry, IndustryConfig> = {
  peluqueria: {
    key: "peluqueria",
    displayName: "Peluqueria",
    landingPath: "/peluqueria",
    labels: {
      customerSingular: "Cliente",
      customerPlural: "Clientes",
      staffSingular: "Profesional",
      staffPlural: "Profesionales",
      serviceSingular: "Servicio",
      servicePlural: "Servicios",
    },
  },
  psicologo: {
    key: "psicologo",
    displayName: "Psicologia",
    landingPath: "/psicologo",
    labels: {
      customerSingular: "Paciente",
      customerPlural: "Pacientes",
      staffSingular: "Terapeuta",
      staffPlural: "Terapeutas",
      serviceSingular: "Sesion",
      servicePlural: "Sesiones",
    },
  },
  masajista: {
    key: "masajista",
    displayName: "Masajes",
    landingPath: "/masajista",
    labels: {
      customerSingular: "Cliente",
      customerPlural: "Clientes",
      staffSingular: "Terapeuta",
      staffPlural: "Terapeutas",
      serviceSingular: "Sesion",
      servicePlural: "Sesiones",
    },
  },
};
