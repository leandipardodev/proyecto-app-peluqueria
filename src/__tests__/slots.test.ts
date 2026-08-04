import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeSlotsForDay } from "@/lib/dashboard/booking/slots";
import type { BlockEntry, ComputeSlotsParams, DateOverrideEntry, Slot, StaffScheduleEntry } from "@/lib/dashboard/booking/slots";
import { getArgentinaMinutesSinceMidnight } from "@/lib/argentina-time";

const DAY = "2030-06-16"; // not today (the mock "today" is 2030-06-15)

function isoAt(date: string, hour: number, minute = 0): string {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`).toISOString();
}

function schedule(sId: string, start: string, end: string, opts: { is_active?: boolean; break_start?: string | null; break_end?: string | null } = {}): StaffScheduleEntry {
  return {
    staff_id: sId,
    is_active: opts.is_active ?? true,
    start_time: start,
    end_time: end,
    break_start: opts.break_start ?? null,
    break_end: opts.break_end ?? null,
  };
}

function override(sId: string | null, opts: { is_closed?: boolean; start_time?: string | null; end_time?: string | null; break_start?: string | null; break_end?: string | null } = {}): DateOverrideEntry {
  return {
    staff_id: sId,
    is_closed: opts.is_closed ?? false,
    start_time: opts.start_time ?? null,
    end_time: opts.end_time ?? null,
    break_start: opts.break_start ?? null,
    break_end: opts.break_end ?? null,
  };
}

function appointment(startHour: number, startMin: number, endHour: number, endMin: number, staffId: string | null): BlockEntry {
  return { start_time: isoAt(DAY, startHour, startMin), end_time: isoAt(DAY, endHour, endMin), staff_id: staffId };
}

function appointmentAr(date: string, start: string, end: string, staffId: string | null): BlockEntry {
  return { start_time: `${date}T${start}:00-03:00`, end_time: `${date}T${end}:00-03:00`, staff_id: staffId };
}

function baseParams(overrides: Partial<ComputeSlotsParams> = {}): ComputeSlotsParams {
  return {
    date: DAY,
    serviceDuration: 60,
    shopDayConfig: { open: true, start: "09:00", end: "20:00" },
    shopOpenMinutes: 540,
    shopCloseMinutes: 1200,
    poolIds: ["s1"],
    scheduleMap: new Map(),
    staffOverrideMap: new Map(),
    allBlocks: [],
    ...overrides,
  };
}

const startTimes = (slots: Slot[]) => slots.map((s) => s.start);

function parseMinutesMock(nowMinutes = 600): void {
  vi.mocked(getArgentinaMinutesSinceMidnight).mockImplementation((value: Date | string) => {
    if (value instanceof Date) return nowMinutes;
    const m = value.match(/T(\d{2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 600;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getArgentinaMinutesSinceMidnight).mockImplementation(() => 600);
});

describe("computeSlotsForDay", () => {
  it("genera grilla completa unipersonal sin horario del staff (usa horario del local)", () => {
    const slots = computeSlotsForDay(baseParams());
    expect(slots).toHaveLength(21);
    expect(slots[0].start).toBe(isoAt(DAY, 9, 0));
    expect(slots[slots.length - 1].start).toBe(isoAt(DAY, 19, 0));
    expect(slots.every((s) => s.staffIds.length === 1 && s.staffIds[0] === "s1")).toBe(true);
  });

  it("aplica el break del local aun sin horario propio del staff (bug #4)", () => {
    const slots = computeSlotsForDay(
      baseParams({
        shopDayConfig: { open: true, start: "09:00", end: "20:00", break_start: "13:00", break_end: "14:00" },
      })
    );
    expect(slots).toHaveLength(18);
    expect(slots.some((s) => s.start === isoAt(DAY, 13, 0) || s.start === isoAt(DAY, 13, 30))).toBe(false);
  });

  it("aplica el break del staff en modo unipersonal", () => {
    const slots = computeSlotsForDay(
      baseParams({
        scheduleMap: new Map([["s1", schedule("s1", "09:00", "20:00", { break_start: "13:00", break_end: "14:00" })]]),
      })
    );
    expect(slots).toHaveLength(18);
    expect(slots.some((s) => s.start === isoAt(DAY, 13, 0) || s.start === isoAt(DAY, 13, 30))).toBe(false);
  });

  it("respeta la interseccion del horario del staff con el del local", () => {
    const slots = computeSlotsForDay(
      baseParams({
        scheduleMap: new Map([["s1", schedule("s1", "10:00", "17:00")]]),
      })
    );
    expect(slots).toHaveLength(13);
    expect(slots[0].start).toBe(isoAt(DAY, 10, 0));
    expect(slots[slots.length - 1].start).toBe(isoAt(DAY, 16, 0));
  });

  it("devuelve vacio cuando el staff inactivo es el unico (bug #3)", () => {
    const slots = computeSlotsForDay(
      baseParams({
        scheduleMap: new Map([["s1", schedule("s1", "09:00", "20:00", { is_active: false })]]),
      })
    );
    expect(slots).toEqual([]);
  });

  it("multi-staff: excluye al staff inactivo y usa horario local para el resto", () => {
    const slots = computeSlotsForDay(
      baseParams({
        poolIds: ["s1", "s2"],
        scheduleMap: new Map([["s1", schedule("s1", "09:00", "20:00", { is_active: false })]]),
      })
    );
    expect(slots).toHaveLength(21);
    expect(slots.every((s) => s.staffIds.length === 1 && s.staffIds[0] === "s2")).toBe(true);
  });

  it("multi-staff: un turno existente de un staff lo excluye de ese slot", () => {
    const slots = computeSlotsForDay(
      baseParams({
        poolIds: ["s1", "s2"],
        allBlocks: [appointment(12, 0, 13, 0, "s1")],
      })
    );
    const midday = slots.find((s) => s.start === isoAt(DAY, 12, 0));
    expect(midday).toBeDefined();
    expect(midday!.staffIds).toEqual(["s2"]);
  });

  it("multi-staff: los blocks sin staff caen el turno cuando no alcanzan los staff libres", () => {
    const slots = computeSlotsForDay(
      baseParams({
        poolIds: ["s1", "s2"],
        allBlocks: [appointment(13, 0, 13, 30, null), appointment(13, 30, 14, 0, null)],
      })
    );
    expect(slots).toHaveLength(20);
    expect(slots.some((s) => s.start === isoAt(DAY, 13, 0))).toBe(false);
  });

  it("multi-staff: override de staff cerrado lo excluye de todos los turnos", () => {
    const slots = computeSlotsForDay(
      baseParams({
        poolIds: ["s1", "s2"],
        staffOverrideMap: new Map([["s2", override("s2", { is_closed: true })]]),
      })
    );
    expect(slots).toHaveLength(21);
    expect(slots.every((s) => s.staffIds.length === 1 && s.staffIds[0] === "s1")).toBe(true);
  });

  it("multi-staff: override de staff recorta el horario disponible", () => {
    const slots = computeSlotsForDay(
      baseParams({
        poolIds: ["s1", "s2"],
        staffOverrideMap: new Map([["s2", override("s2", { start_time: "14:00", end_time: "16:00" })]]),
      })
    );
    const before = slots.find((s) => s.start === isoAt(DAY, 13, 0));
    const inside = slots.find((s) => s.start === isoAt(DAY, 14, 0));
    expect(before!.staffIds).toEqual(["s1"]);
    expect(inside!.staffIds).toContain("s2");
  });

  it("unipersonal: override de staff cerrado devuelve vacio", () => {
    const slots = computeSlotsForDay(
      baseParams({
        staffOverrideMap: new Map([["s1", override("s1", { is_closed: true })]]),
      })
    );
    expect(slots).toEqual([]);
  });

  it("unipersonal: override de staff recorta el horario", () => {
    const slots = computeSlotsForDay(
      baseParams({
        staffOverrideMap: new Map([["s1", override("s1", { start_time: "11:00", end_time: "15:00" })]]),
      })
    );
    expect(startTimes(slots)).toEqual([
      isoAt(DAY, 11, 0),
      isoAt(DAY, 11, 30),
      isoAt(DAY, 12, 0),
      isoAt(DAY, 12, 30),
      isoAt(DAY, 13, 0),
      isoAt(DAY, 13, 30),
      isoAt(DAY, 14, 0),
    ]);
  });

  it("unipersonal: override de staff con break lo aplica", () => {
    const slots = computeSlotsForDay(
      baseParams({
        staffOverrideMap: new Map([["s1", override("s1", { break_start: "13:00", break_end: "14:00" })]]),
      })
    );
    expect(slots).toHaveLength(18);
    expect(slots.some((s) => s.start === isoAt(DAY, 13, 0) || s.start === isoAt(DAY, 13, 30))).toBe(false);
  });

  it("horario del staff fuera del horario del local no genera turnos", () => {
    const slots = computeSlotsForDay(
      baseParams({
        scheduleMap: new Map([["s1", schedule("s1", "08:00", "09:00")]]),
      })
    );
    expect(slots).toEqual([]);
  });

  it("clamp de duracion: valores muy grandes se limitan a 480 min", () => {
    const slots = computeSlotsForDay(baseParams({ serviceDuration: 1000 }));
    expect(slots).toHaveLength(7);
    expect(slots[0].start).toBe(isoAt(DAY, 9, 0));
    expect(slots[0].end).toBe(isoAt(DAY, 17, 0));
  });

  it("clamp de duracion: valores muy chicos se elevan a 15 min", () => {
    const slots = computeSlotsForDay(baseParams({ serviceDuration: 5 }));
    expect(slots[0].start).toBe(isoAt(DAY, 9, 0));
    expect(slots[0].end).toBe(isoAt(DAY, 9, 15));
  });

  it("clamp de duracion: negativos y NaN usan 60 min", () => {
    const neg = computeSlotsForDay(baseParams({ serviceDuration: -5 }));
    const nan = computeSlotsForDay(baseParams({ serviceDuration: Number.NaN }));
    expect(neg).toHaveLength(21);
    expect(nan).toHaveLength(21);
    expect(neg[0].end).toBe(isoAt(DAY, 10, 0));
    expect(nan[0].end).toBe(isoAt(DAY, 10, 0));
  });

  it("hoy: descarta horarios pasados y arranca en la hora actual", () => {
    const slots = computeSlotsForDay(baseParams({ date: "2030-06-15" }));
    expect(slots).toHaveLength(19);
    expect(slots[0].start).toBe(isoAt("2030-06-15", 10, 0));
    expect(slots.some((s) => s.start === isoAt("2030-06-15", 9, 0) || s.start === isoAt("2030-06-15", 9, 30))).toBe(false);
  });

  it("hoy: redondea hacia arriba al slot de 30 min cuando la hora actual no esta alineada", () => {
    vi.mocked(getArgentinaMinutesSinceMidnight).mockImplementation(() => 605);
    const slots = computeSlotsForDay(baseParams({ date: "2030-06-15" }));
    expect(slots[0].start).toBe(isoAt("2030-06-15", 10, 30));
  });

  it("multi-staff: aplica el break del local a todos los staff (bug #4)", () => {
    const slots = computeSlotsForDay(
      baseParams({
        poolIds: ["s1", "s2"],
        shopDayConfig: { open: true, start: "09:00", end: "20:00", break_start: "13:00", break_end: "14:00" },
      })
    );
    expect(slots).toHaveLength(18);
    expect(slots.some((s) => s.start === isoAt(DAY, 13, 0) || s.start === isoAt(DAY, 13, 30))).toBe(false);
  });
});

describe("computeSlotsForDay - huecos fuera de grilla (turnos :15 y duraciones arbitrarias)", () => {
  it("unipersonal: ofrece slot que empieza donde termina el turno anterior (15:15-16:00)", () => {
    parseMinutesMock();
    const slots = computeSlotsForDay(
      baseParams({
        serviceDuration: 45,
        scheduleMap: new Map([["s1", schedule("s1", "14:00", "18:00")]]),
        allBlocks: [appointmentAr(DAY, "14:30", "15:15", "s1"), appointmentAr(DAY, "16:00", "17:00", "s1")],
      })
    );
    expect(slots).toHaveLength(2);
    const gap = slots.find((s) => s.start === isoAt(DAY, 15, 15));
    expect(gap).toBeDefined();
    expect(gap!.end).toBe(isoAt(DAY, 16, 0));
  });

  it("unipersonal: soporta duraciones arbitrarias (turno previo 20 min -> slot 14:50-15:35)", () => {
    parseMinutesMock();
    const slots = computeSlotsForDay(
      baseParams({
        serviceDuration: 45,
        scheduleMap: new Map([["s1", schedule("s1", "14:00", "18:00")]]),
        allBlocks: [appointmentAr(DAY, "14:30", "14:50", "s1"), appointmentAr(DAY, "16:00", "17:00", "s1")],
      })
    );
    expect(slots).toHaveLength(3);
    const gap = slots.find((s) => s.start === isoAt(DAY, 14, 50));
    expect(gap).toBeDefined();
    expect(gap!.end).toBe(isoAt(DAY, 15, 35));
  });

  it("unipersonal: no ofrece el borde si el turno no entra hasta el proximo turno", () => {
    parseMinutesMock();
    const slots = computeSlotsForDay(
      baseParams({
        serviceDuration: 60,
        scheduleMap: new Map([["s1", schedule("s1", "14:00", "18:00")]]),
        allBlocks: [appointmentAr(DAY, "14:30", "15:15", "s1"), appointmentAr(DAY, "16:00", "17:00", "s1")],
      })
    );
    expect(slots.some((s) => s.start === isoAt(DAY, 15, 15))).toBe(false);
    expect(slots).toHaveLength(1);
  });

  it("unipersonal: borde que coincide con la grilla no duplica el slot", () => {
    parseMinutesMock();
    const slots = computeSlotsForDay(
      baseParams({
        serviceDuration: 60,
        scheduleMap: new Map([["s1", schedule("s1", "14:00", "18:00")]]),
        allBlocks: [appointmentAr(DAY, "14:00", "15:00", "s1")],
      })
    );
    expect(slots).toHaveLength(5);
    expect(slots.filter((s) => s.start === isoAt(DAY, 15, 0))).toHaveLength(1);
  });

  it("multi-staff: un turno de un staff deja el borde disponible para ese staff", () => {
    parseMinutesMock();
    const slots = computeSlotsForDay(
      baseParams({
        serviceDuration: 45,
        poolIds: ["s1", "s2"],
        allBlocks: [appointmentAr(DAY, "14:30", "15:15", "s1")],
      })
    );
    const gap = slots.find((s) => s.start === isoAt(DAY, 15, 15));
    expect(gap).toBeDefined();
    expect(gap!.staffIds).toContain("s1");
    const onGrid = slots.find((s) => s.start === isoAt(DAY, 15, 0));
    expect(onGrid!.staffIds).toEqual(["s2"]);
  });

  it("multi-staff: no genera borde por un turno de un staff fuera del pool", () => {
    parseMinutesMock();
    const slots = computeSlotsForDay(
      baseParams({
        serviceDuration: 45,
        poolIds: ["s1", "s2"],
        allBlocks: [appointmentAr(DAY, "14:30", "15:15", "s3")],
      })
    );
    expect(slots.some((s) => s.start === isoAt(DAY, 15, 15))).toBe(false);
  });

  it("un bloque sin staff genera el borde para el staff unipersonal", () => {
    parseMinutesMock();
    const slots = computeSlotsForDay(
      baseParams({
        serviceDuration: 45,
        scheduleMap: new Map([["s1", schedule("s1", "14:00", "18:00")]]),
        allBlocks: [appointmentAr(DAY, "14:30", "15:15", null)],
      })
    );
    expect(slots.some((s) => s.start === isoAt(DAY, 15, 15))).toBe(true);
  });

  it("no ofrece borde si no entra antes del cierre del horario", () => {
    parseMinutesMock();
    const slots = computeSlotsForDay(
      baseParams({
        serviceDuration: 45,
        scheduleMap: new Map([["s1", schedule("s1", "14:00", "15:00")]]),
        allBlocks: [appointmentAr(DAY, "14:00", "14:45", "s1")],
      })
    );
    expect(slots).toEqual([]);
  });

  it("hoy: no redondea el borde y descarta la grilla pasada", () => {
    parseMinutesMock(877);
    const slots = computeSlotsForDay(
      baseParams({
        date: "2030-06-15",
        serviceDuration: 45,
        scheduleMap: new Map([["s1", schedule("s1", "14:00", "18:00")]]),
        allBlocks: [appointmentAr("2030-06-15", "14:30", "14:50", "s1")],
      })
    );
    expect(slots[0].start).toBe(isoAt("2030-06-15", 14, 50));
    expect(slots.some((s) => s.start === isoAt("2030-06-15", 14, 30))).toBe(false);
    expect(slots.some((s) => s.start === isoAt("2030-06-15", 15, 0))).toBe(true);
  });
});
