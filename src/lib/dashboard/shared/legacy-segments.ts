export const DASHBOARD_LEGACY_SEGMENTS = [
  "appointments",
  "business",
  "calendar",
  "customers",
  "fidelizacion",
  "finances",
  "inventory",
  "profile",
  "services",
  "settings",
  "staff",
  "vouchers",
] as const;

export const DASHBOARD_LEGACY_SEGMENTS_SET = new Set<string>(DASHBOARD_LEGACY_SEGMENTS);
