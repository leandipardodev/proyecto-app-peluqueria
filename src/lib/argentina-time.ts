const AR_TZ = "America/Argentina/Buenos_Aires";

function getDatePartsInTimezone(tz: string): { year: number; month: number; day: number; weekday: number; hours: number; minutes: number } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "numeric", day: "numeric",
    weekday: "long", hour: "numeric", minute: "numeric", hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value || "0", 10);
  const weekdayMap: Record<string, number> = {
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
    friday: 5, saturday: 6, sunday: 0,
  };
  return {
    year: get("year"), month: get("month"), day: get("day"),
    weekday: weekdayMap[parts.find(p => p.type === "weekday")?.value.toLowerCase() || "monday"] ?? 1,
    hours: get("hour"), minutes: get("minute"),
  };
}

export function getArgentinaNow(): Date {
  const { year, month, day, hours, minutes } = getDatePartsInTimezone(AR_TZ);
  const ds = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return new Date(`${ds}T${hh}:${mm}:00-03:00`);
}

export function getArgentinaWeekStart(): Date {
  const { weekday } = getDatePartsInTimezone(AR_TZ);
  const todayAr = getArgentinaNow();
  const weekStart = new Date(todayAr);
  weekStart.setUTCDate(todayAr.getUTCDate() - ((weekday + 6) % 7));
  return weekStart;
}

export function getArgentinaDateString(): string {
  const { year, month, day } = getDatePartsInTimezone(AR_TZ);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getArgentinaDayBounds(dateStr?: string): { start: Date; end: Date } {
  const ds = dateStr || getArgentinaDateString();
  const start = new Date(`${ds}T00:00:00-03:00`);
  const end = new Date(`${ds}T23:59:59-03:00`);
  return { start, end };
}

export function getTodayArgentinaBounds(): { start: Date; end: Date } {
  return getArgentinaDayBounds();
}

export function createArgentinaDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const ds = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return new Date(`${ds}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);
}

export function formatArgentinaTime(date: Date): string {
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: AR_TZ,
  });
}

export function toArgentinaLocalIsoString(value: Date | string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    }
  }

  const dt = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(dt);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

export function getArgentinaDateKey(value: Date | string): string {
  return toArgentinaLocalIsoString(value).slice(0, 10);
}

export function getArgentinaMinutesSinceMidnight(value: Date | string): number {
  const iso = toArgentinaLocalIsoString(value);
  const hour = parseInt(iso.slice(11, 13), 10);
  const minute = parseInt(iso.slice(14, 16), 10);
  return hour * 60 + minute;
}

export function extractArgentinaTimeHHmm(value: Date | string): string {
  return toArgentinaLocalIsoString(value).slice(11, 16);
}

export function minutesFromHHmm(hhmm: string): number {
  const [hourRaw, minuteRaw] = hhmm.split(":");
  const hour = parseInt(hourRaw || "0", 10);
  const minute = parseInt(minuteRaw || "0", 10);
  return hour * 60 + minute;
}
