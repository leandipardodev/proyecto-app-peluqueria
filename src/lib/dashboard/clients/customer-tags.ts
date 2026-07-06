export interface CustomerTagDef {
  value: string;
  label: string;
  color: string;
}

export const CUSTOMER_TAGS: CustomerTagDef[] = [
  { value: "frecuente", label: "Frecuente", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200" },
  { value: "no_whatsapp", label: "No WhatsApp", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200" },
  { value: "confirmar_turno", label: "Confirmar turno", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200" },
  { value: "no_llamar", label: "No llamar", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200" },
  { value: "cuidado_tinte", label: "Cuidado al teñir", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200" },
  { value: "referido", label: "Referido", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200" },
  { value: "viene_con_hijos", label: "Viene con hijos", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-200" },
  { value: "impuntual", label: "Impuntual", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200" },
];

export function getTagDef(value: string): CustomerTagDef | undefined {
  return CUSTOMER_TAGS.find((t) => t.value === value);
}

export function getTagLabel(value: string): string {
  return getTagDef(value)?.label ?? value;
}

export function getTagColor(value: string): string {
  return getTagDef(value)?.color ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}
