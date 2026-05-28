import { Settings } from "lucide-react";
import type { IndustryFeatures } from "@/lib/industry/types";

export const FEATURE_LABELS: Record<
  keyof IndustryFeatures,
  { label: string; description: string; icon: typeof Settings }
> = {
  inventory: {
    label: "Inventario",
    description: "Gestion de productos y stock",
    icon: Settings,
  },
  marketing: {
    label: "Marketing",
    description: "Campanas y promociones",
    icon: Settings,
  },
  staff: {
    label: "Colaboradores",
    description: "Gestion de empleados y roles",
    icon: Settings,
  },
  vouchers: {
    label: "Vouchers",
    description: "Gift cards y codigos de descuento",
    icon: Settings,
  },
};
