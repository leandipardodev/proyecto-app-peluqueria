export type DayHours = {
  open: boolean;
  start: string;
  end: string;
  break_start?: string | null;
  break_end?: string | null;
};

export type BusinessHoursData = Record<string, DayHours>;

export const DEFAULT_BUSINESS_HOURS: BusinessHoursData = {
  monday:    { open: true,  start: "09:00", end: "20:00" },
  tuesday:   { open: true,  start: "09:00", end: "20:00" },
  wednesday: { open: true,  start: "09:00", end: "20:00" },
  thursday:  { open: true,  start: "09:00", end: "20:00" },
  friday:    { open: true,  start: "09:00", end: "20:00" },
  saturday:  { open: true,  start: "09:00", end: "20:00" },
  sunday:    { open: false, start: "09:00", end: "20:00" },
};