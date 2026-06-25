export type BookingTemplateId =
  | "minimal-glass" | "pearl-white" | "ice-crystal" | "soft-linen"
  | "classic-dark" | "shadow-noir" | "onyx-edge" | "dark-titanium"
  | "street-bold" | "cotton-candy" | "lavender-dream" | "peach-sorbet"
  | "editorial-luxury" | "olive-grove" | "desert-sand" | "forest-canopy"
  | "acid-lime" | "electric-pulse" | "tropical-heat" | "ocean-reef";

export type SkinCategoryId = "dark" | "light" | "pastel" | "earth" | "vibrant";

export type SkinCategory = {
  id: SkinCategoryId;
  name: string;
  icon: string;
};

export const SKIN_CATEGORIES: SkinCategory[] = [
  { id: "dark", name: "Oscuros", icon: "🌑" },
  { id: "light", name: "Claros", icon: "🌅" },
  { id: "pastel", name: "Pastel", icon: "🍡" },
  { id: "earth", name: "Tierra", icon: "🌿" },
  { id: "vibrant", name: "Vibrante", icon: "⚡" },
];

export type BookingTemplatePreset = {
  id: BookingTemplateId;
  name: string;
  description: string;
  category: SkinCategoryId;
  palette: [string, string, string, string];
};

export const BOOKING_TEMPLATE_PRESETS: BookingTemplatePreset[] = [
  // ── Claros ──
  { id: "minimal-glass", name: "Aurora Silk", description: "Rosa rubor calido con acentos berry.", category: "light", palette: ["#FFF5F7", "#FFE8EC", "#E84D8A", "#2D1B20"] },
  { id: "pearl-white", name: "Pearl White", description: "Crema luminoso con acentos dorados.", category: "light", palette: ["#FEFCF3", "#F8F0D8", "#D4AF37", "#332B1A"] },
  { id: "ice-crystal", name: "Ice Crystal", description: "Frio cristalino con azules glaciales.", category: "light", palette: ["#E8F4FD", "#D0E8F8", "#38BDF8", "#1E3A5F"] },
  { id: "soft-linen", name: "Soft Linen", description: "Beige natural con calidez artesanal.", category: "light", palette: ["#F5EDE0", "#EDE0CC", "#C4956A", "#3D3029"] },

  // ── Oscuros ──
  { id: "classic-dark", name: "Midnight Atelier", description: "Nocturno premium con profundidad azul royal.", category: "dark", palette: ["#0A0E1A", "#1A2240", "#4A9EFF", "#E8EDF5"] },
  { id: "shadow-noir", name: "Shadow Noir", description: "Negro absoluto con acentos plateados.", category: "dark", palette: ["#000000", "#1A1A1A", "#FFFFFF", "#A0A0A0"] },
  { id: "onyx-edge", name: "Onyx Edge", description: "Purpura oscuro con destellos violeta neón.", category: "dark", palette: ["#0E0A16", "#221A38", "#C084FC", "#E8D5FF"] },
  { id: "dark-titanium", name: "Dark Titanium", description: "Verde petroleo con acentos esmeralda.", category: "dark", palette: ["#0A1412", "#14281E", "#34D399", "#A7F3D0"] },

  // ── Pastel ──
  { id: "street-bold", name: "Candy Atelier", description: "Verde menta fresco y moderno.", category: "pastel", palette: ["#ECFDF5", "#D1FAE5", "#34D399", "#1F3D36"] },
  { id: "cotton-candy", name: "Cotton Candy", description: "Rosado suave con dulzura algodonada.", category: "pastel", palette: ["#FDE8F1", "#FBCFE8", "#F472B6", "#4A2C3A"] },
  { id: "lavender-dream", name: "Lavender Dream", description: "Lavanda serena con matices violeta.", category: "pastel", palette: ["#F3EEFF", "#E4D5FF", "#A78BFA", "#3B2E5A"] },
  { id: "peach-sorbet", name: "Peach Sorbet", description: "Durazno tibio con frescura frutal.", category: "pastel", palette: ["#FFF4ED", "#FDE2D3", "#F9A87A", "#4A3428"] },

  // ── Tierra ──
  { id: "editorial-luxury", name: "Velvet Mocha", description: "Cafe crema con calidez boutique refinada.", category: "earth", palette: ["#F5EDE0", "#E8DCCC", "#6A4A2D", "#2E221A"] },
  { id: "olive-grove", name: "Olive Grove", description: "Verde oliva natural con serenidad organica.", category: "earth", palette: ["#F4F7ED", "#E2E8D0", "#6B8E23", "#2C3620"] },
  { id: "desert-sand", name: "Desert Sand", description: "Terracota intensa con calidez desertica.", category: "earth", palette: ["#F8EDE0", "#EFD6C0", "#C87D4F", "#3D261A"] },
  { id: "forest-canopy", name: "Forest Canopy", description: "Verde bosque profundo con frescura natural.", category: "earth", palette: ["#E8F0E8", "#CDE0CD", "#2D6A4F", "#1B2E24"] },

  // ── Vibrante ──
  { id: "acid-lime", name: "Acid Lime", description: "Lima electrica vibrante con frescura citrica.", category: "vibrant", palette: ["#F0FDE7", "#D9F9B8", "#84CC16", "#1A2E0A"] },
  { id: "electric-pulse", name: "Electric Pulse", description: "Violeta neón sobre fondo oscuro electrizante.", category: "vibrant", palette: ["#0D0A1A", "#1E1440", "#8B5CF6", "#E0D5FF"] },
  { id: "tropical-heat", name: "Tropical Heat", description: "Naranja intenso con energia tropical.", category: "vibrant", palette: ["#FFF0E7", "#FFDCC5", "#FF6B35", "#4A1C0A"] },
  { id: "ocean-reef", name: "Ocean Reef", description: "Cian profundo con frescura marina.", category: "vibrant", palette: ["#E7F5FF", "#C8EAF8", "#06B6D4", "#0A2A34"] },
];

export const DEFAULT_BOOKING_TEMPLATE: BookingTemplateId = "minimal-glass";

export function getCategoryForSkin(skinId: BookingTemplateId): SkinCategoryId {
  return BOOKING_TEMPLATE_PRESETS.find((s) => s.id === skinId)?.category ?? "light";
}
