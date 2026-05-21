export type BookingTemplateId = "classic-dark" | "minimal-glass" | "editorial-luxury" | "street-bold";

export type BookingTemplatePreset = {
  id: BookingTemplateId;
  name: string;
  description: string;
  previewSrc: string;
};

export const BOOKING_TEMPLATE_PRESETS: BookingTemplatePreset[] = [
  {
    id: "minimal-glass",
    name: "Aurora Silk",
    description: "Luz limpia y elegante con acentos azul seda.",
    previewSrc: "/template-previews/minimal-glass.svg",
  },
  {
    id: "classic-dark",
    name: "Midnight Atelier",
    description: "Nocturno premium con profundidad cinematica sofisticada.",
    previewSrc: "/template-previews/classic-dark.svg",
  },
  {
    id: "editorial-luxury",
    name: "Velvet Mocha",
    description: "Crema y cafe suave con calidez boutique refinada.",
    previewSrc: "/template-previews/editorial-luxury.svg",
  },
  {
    id: "street-bold",
    name: "Candy Atelier",
    description: "Pasteles vivos y modernos, alegres sin saturacion.",
    previewSrc: "/template-previews/street-bold.svg",
  },
];

export const DEFAULT_BOOKING_TEMPLATE: BookingTemplateId = "minimal-glass";
