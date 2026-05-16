export const APPOINTMENT_STATUS_TODAY_SUMMARY = [
  "scheduled",
  "confirmed",
  "pending_payment",
  "completed",
] as const;

export const APPOINTMENT_STATUS_UPCOMING = [
  "scheduled",
  "confirmed",
  "pending_payment",
] as const;

export const APPOINTMENT_STATUS_NEEDS_CONFIRMATION = [
  "scheduled",
  "pending_payment",
] as const;

export const APPOINTMENT_STATUS_BILLABLE = [
  "scheduled",
  "confirmed",
  "pending_payment",
  "completed",
] as const;
