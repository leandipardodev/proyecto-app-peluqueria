export type Service = { id: string; name: string; price: number; duration_minutes: number; category: string | null };
export type StaffMember = { id: string; name: string };
export type Slot = { start: string; end: string; time: string };

export const stepReveal = {
  initial: { opacity: 0, y: 14, filter: "blur(2px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const, staggerChildren: 0.055, delayChildren: 0.03 },
  },
  exit: { opacity: 0, y: -8, filter: "blur(1px)", transition: { duration: 0.2 } },
};

export const stepItemReveal = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1] as const } },
};

let lastHapticAt = 0;

export const triggerHaptic = (duration = 15, target?: HTMLElement | null) => {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastHapticAt < 70) return;
  lastHapticAt = now;

  if (navigator.vibrate) {
    navigator.vibrate(duration);
    return;
  }

  if (target?.animate) {
    target.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(0.985)", opacity: 0.92 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 130, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }
};

export function getWeekDates(): Date[] {
  const today = new Date();
  const dates: Date[] = [];
  for (let i = 0; i < 21; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

export function parseHHmmToMinutes(value: string): number {
  const m = value.match(/(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function to24HourTimeLabel(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Math.max(0, Math.min(23, Number(hhmm[1])));
    const m = Math.max(0, Math.min(59, Number(hhmm[2])));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const ampm = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2] || "0");
    const period = ampm[3];
    if (period === "p" && hour !== 12) hour += 12;
    if (period === "a" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return value;
}

export function formatTimeFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
