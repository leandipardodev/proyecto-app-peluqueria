import { DEFAULT_BUSINESS_HOURS } from "../shop/business-hours-defaults";

export type AgendaInterval = { start: string; end: string };
export type AgendaGap = { start: string; end: string; minutes: number };

export type GapHours = {
  open: boolean;
  start: string;
  end: string;
  break_start: string | null;
  break_end: string | null;
};

const MIN_GAP_MINUTES = 45;
const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function timeToMinutes(t: string | undefined | null): number {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function toDayMinutes(iso: string, dayStart: Date): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - dayStart.getTime()) / 60000));
}

function minutesToLabel(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function bestGap(current: { start: number; end: number } | null, start: number, end: number) {
  if (!current || end - start > current.end - current.start) return { start, end };
  return current;
}

function normalizeDayHours(def: GapHours): GapHours {
  return { ...def, break_start: def.break_start ?? null, break_end: def.break_end ?? null };
}

export function resolveGapHours(raw: unknown, dayIndex: number): GapHours {
  const fallback = DEFAULT_BUSINESS_HOURS[DAY_KEYS[dayIndex]] ?? DEFAULT_BUSINESS_HOURS.monday;
  if (!raw || typeof raw !== "object") return normalizeDayHours({ open: fallback.open, start: fallback.start, end: fallback.end, break_start: null, break_end: null });

  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === "object") normalized[k.toLowerCase()] = v;
  }

  const entry = normalized[DAY_KEYS[dayIndex]] as Record<string, unknown> | null;
  if (entry && typeof entry === "object" && typeof entry.open === "boolean") {
    return {
      open: entry.open,
      start: typeof entry.start === "string" ? entry.start : fallback.start,
      end: typeof entry.end === "string" ? entry.end : fallback.end,
      break_start: typeof entry.break_start === "string" ? entry.break_start : null,
      break_end: typeof entry.break_end === "string" ? entry.break_end : null,
    };
  }
  return normalizeDayHours({ open: fallback.open, start: fallback.start, end: fallback.end, break_start: null, break_end: null });
}

export function findLargestGap(
  intervals: AgendaInterval[],
  hours: GapHours,
  dayStart: Date,
  nowIso: string
): AgendaGap | null {
  if (!hours.open) return null;

  const now = toDayMinutes(nowIso, dayStart);
  const open = timeToMinutes(hours.start);
  const close = timeToMinutes(hours.end);
  const segStart = Math.max(open, now);
  if (segStart >= close) return null;

  const breakStart = hours.break_start ? timeToMinutes(hours.break_start) : null;
  const breakEnd = hours.break_end ? timeToMinutes(hours.break_end) : null;

  const segments: Array<[number, number]> = [];
  const pushSegment = (a: number, b: number) => {
    const start = Math.max(a, segStart);
    const end = Math.min(b, close);
    if (end - start >= MIN_GAP_MINUTES) segments.push([start, end]);
  };

  if (breakStart !== null && breakEnd !== null && breakStart < breakEnd) {
    pushSegment(segStart, breakStart);
    pushSegment(breakEnd, close);
  } else {
    pushSegment(segStart, close);
  }
  if (segments.length === 0) return null;

  const occupied = intervals
    .filter((i) => Boolean(i.start && i.end) && new Date(i.end).getTime() > new Date(i.start).getTime())
    .map((i) => ({ start: toDayMinutes(i.start, dayStart), end: toDayMinutes(i.end, dayStart) }))
    .filter((o) => o.end > segStart && o.start < close)
    .sort((a, b) => a.start - b.start);

  let best: { start: number; end: number } | null = null;

  for (const [segSegmentStart, segEnd] of segments) {
    let cursor = segSegmentStart;
    for (const occ of occupied) {
      if (occ.end <= cursor) continue;
      if (occ.start > cursor) {
        const gapEnd = Math.min(occ.start, segEnd);
        if (gapEnd - cursor >= MIN_GAP_MINUTES) best = bestGap(best, cursor, gapEnd);
      }
      cursor = Math.max(cursor, occ.end);
      if (cursor >= segEnd) break;
    }
    if (segEnd - cursor >= MIN_GAP_MINUTES) best = bestGap(best, cursor, segEnd);
  }

  if (!best) return null;
  return { start: minutesToLabel(best.start), end: minutesToLabel(best.end), minutes: best.end - best.start };
}