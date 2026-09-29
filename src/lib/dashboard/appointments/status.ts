export const APPOINTMENT_STATUSES = [
  "confirmed",
  "pending_payment",
  "completed",
  "cancelled",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * 'confirmed' significa "turno abierto": el local agenda y no confirma nada,
 * el cliente simplemente reserva. El pago se modela con pending_payment
 * (Mercado Pago) y con is_paid una vez completado.
 */
export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmed: "Agendado",
  pending_payment: "Pago pendiente",
  completed: "Completado",
  cancelled: "Cancelado",
};

/** Turnos que todavia no estan cerrados: los que ocupan agenda. */
export const APPOINTMENT_STATUS_OPEN: readonly AppointmentStatus[] = [
  "confirmed",
  "pending_payment",
];

/** Turnos que bloquean el horario segun las reglas de disponibilidad. */
export const APPOINTMENT_STATUS_BLOCKING_SLOT: readonly AppointmentStatus[] = [
  "confirmed",
  "pending_payment",
  "completed",
];

export const APPOINTMENT_STATUS_TODAY_SUMMARY: readonly AppointmentStatus[] = [
  "confirmed",
  "pending_payment",
  "completed",
];

export const APPOINTMENT_STATUS_UPCOMING: readonly AppointmentStatus[] = [
  "confirmed",
  "pending_payment",
];

/** Todo lo que no esta cancelado: la fila se muestra tachada si es cancelled. */
export const APPOINTMENT_STATUS_NOT_CANCELLED: readonly AppointmentStatus[] = [
  "confirmed",
  "pending_payment",
  "completed",
];

/**
 * Transiciones permitidas. El CHECK de la DB limita el conjunto de valores pero
 * no evita saltos invalidos (ej. reabrir un cancelado, o volver de cancelled a
 * completed pasando por el webhook). El server valida contra esta tabla.
 */
export const APPOINTMENT_STATUS_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  confirmed: ["completed", "cancelled"],
  pending_payment: ["confirmed", "cancelled"],
  completed: ["cancelled", "confirmed"],
  cancelled: ["confirmed"],
};

export function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return typeof value === "string" && (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

export function canTransitionStatus(from: string, to: string): boolean {
  if (!isAppointmentStatus(from) || !isAppointmentStatus(to)) return false;
  return APPOINTMENT_STATUS_TRANSITIONS[from].includes(to);
}

export function getAppointmentStatusLabel(status: string): string {
  return isAppointmentStatus(status) ? APPOINTMENT_STATUS_LABEL[status] : status;
}

/** Clases de badge compartidas por el calendario, los modales y el panel del cliente. */
export const APPOINTMENT_STATUS_BADGE_CLASS: Record<AppointmentStatus, string> = {
  confirmed: "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200",
  pending_payment: "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200",
  completed: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200",
  cancelled: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200",
};

/** Color del punto de estado en superficies sin badge. */
export const APPOINTMENT_STATUS_DOT_CLASS: Record<AppointmentStatus, string> = {
  confirmed: "bg-sky-500",
  pending_payment: "bg-orange-500",
  completed: "bg-emerald-500",
  cancelled: "bg-red-400",
};
