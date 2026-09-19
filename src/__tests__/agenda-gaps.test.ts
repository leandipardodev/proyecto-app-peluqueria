import { describe, it, expect } from "vitest";
import { findLargestGap } from "@/lib/dashboard/finances/agenda-gaps";

const DAY_START = new Date("2030-06-15T03:00:00.000Z");
const at = (hhmm: string) => new Date(`2030-06-15T${hhmm}:00-03:00`).toISOString();

const OPEN_DAY = { open: true, start: "09:00", end: "20:00", break_start: null, break_end: null };

describe("findLargestGap", () => {
  it("return null cuando el local esta cerrado", () => {
    const result = findLargestGap([], { ...OPEN_DAY, open: false }, DAY_START, at("09:00"));
    expect(result).toBeNull();
  });

  it("return null cuando la hora actual supera el cierre", () => {
    const result = findLargestGap([], OPEN_DAY, DAY_START, at("21:00"));
    expect(result).toBeNull();
  });

  it("sin turnos marca todo el dia desde ahora como hueco", () => {
    const result = findLargestGap([], OPEN_DAY, DAY_START, at("10:00"));
    expect(result).toEqual({ start: "10:00", end: "20:00", minutes: 600 });
  });

  it("elige el hueco mas grande rodeando los turnos ocupados", () => {
    const intervals = [{ start: at("10:00"), end: at("11:30") }];
    const result = findLargestGap(intervals, OPEN_DAY, DAY_START, at("09:00"));
    expect(result).toEqual({ start: "11:30", end: "20:00", minutes: 510 });
  });

  it("fusiona turnos superpuestos", () => {
    const intervals = [
      { start: at("10:00"), end: at("12:00") },
      { start: at("11:00"), end: at("11:30") },
    ];
    const result = findLargestGap(intervals, OPEN_DAY, DAY_START, at("09:00"));
    expect(result).toEqual({ start: "12:00", end: "20:00", minutes: 480 });
  });

  it("no cuenta como hueco un espacio menor a 45 minutos", () => {
    const intervals = [{ start: at("09:30"), end: at("19:50") }];
    const result = findLargestGap(intervals, OPEN_DAY, DAY_START, at("09:00"));
    expect(result).toBeNull();
  });

  it("no ocupa la agenda un turno sin end_time", () => {
    const result = findLargestGap([{ start: at("10:00"), end: "" }], OPEN_DAY, DAY_START, at("10:00"));
    expect(result).toEqual({ start: "10:00", end: "20:00", minutes: 600 });
  });

  it("respeta el corte horario (siesta)", () => {
    const hours = { open: true, start: "09:00", end: "20:00", break_start: "13:00", break_end: "14:00" };
    const result = findLargestGap([], hours, DAY_START, at("09:00"));
    expect(result).toEqual({ start: "14:00", end: "20:00", minutes: 360 });
  });
});