import type { Industry, IndustryFeatures } from "@/lib/industry/types";
import { DEFAULT_FEATURES } from "@/lib/industry/types";

export type IndustryConfig = {
  key: Industry;
  displayName: string;
  features: IndustryFeatures;
  /**
   * schema.org type para el JSON-LD del local. Klip no es solo peluquería:
   * hardcodear "HairSalon" etiquetaba mal a masajistas, psicólogos y canchas.
   */
  schemaType: string;
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
    features: DEFAULT_FEATURES.peluqueria,
    schemaType: "HairSalon",
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
    features: DEFAULT_FEATURES.psicologo,
    schemaType: "MedicalBusiness",
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
    features: DEFAULT_FEATURES.masajista,
    schemaType: "HealthAndBeautyBusiness",
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
    features: DEFAULT_FEATURES.canchas,
    schemaType: "SportsActivityLocation",
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
