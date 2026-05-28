import type { Industry, IndustryFeatures } from "@/lib/industry/types";
import { DEFAULT_FEATURES } from "@/lib/industry/types";

export type IndustryConfig = {
  key: Industry;
  displayName: string;
  landingPath: `/${string}`;
  features: IndustryFeatures;
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
    features: DEFAULT_FEATURES.peluqueria,
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
    features: DEFAULT_FEATURES.psicologo,
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
    features: DEFAULT_FEATURES.masajista,
    labels: {
      customerSingular: "Cliente",
      customerPlural: "Clientes",
      staffSingular: "Terapeuta",
      staffPlural: "Terapeutas",
      serviceSingular: "Sesion",
      servicePlural: "Sesiones",
    },
  },
  canchas: {
    key: "canchas",
    displayName: "Canchas",
    landingPath: "/canchas",
    features: DEFAULT_FEATURES.canchas,
    labels: {
      customerSingular: "Jugador",
      customerPlural: "Jugadores",
      staffSingular: "Encargado",
      staffPlural: "Encargados",
      serviceSingular: "Cancha",
      servicePlural: "Canchas",
    },
  },
};
