import { describe, it, expect } from "vitest";
import { normalizeRange } from "@/lib/dashboard/finances/date-range";

describe("normalizeRange", () => {
  it("deja el rango como viene si ya esta ordenado", () => {
    expect(normalizeRange("2026-10-01", "2026-10-31")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("invierte cuando from es posterior a to", () => {
    expect(normalizeRange("2026-10-31", "2026-10-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("deja el rango igual cuando las dos fechas coinciden", () => {
    expect(normalizeRange("2026-10-02", "2026-10-02")).toEqual({
      from: "2026-10-02",
      to: "2026-10-02",
    });
  });

  it("ordena bien cruces de mes y de ano, porque compara el string YYYY-MM-DD", () => {
    expect(normalizeRange("2026-01-05", "2025-12-31")).toEqual({
      from: "2025-12-31",
      to: "2026-01-05",
    });
    expect(normalizeRange("2026-10-01", "2026-09-30")).toEqual({
      from: "2026-09-30",
      to: "2026-10-01",
    });
  });

  it("siempre devuelve from <= to, que es lo que evita la consulta vacia", () => {
    const pares: [string, string][] = [
      ["2026-10-31", "2026-10-01"],
      ["2026-10-01", "2026-10-31"],
      ["2026-10-02", "2026-10-02"],
      ["2025-01-01", "2026-12-31"],
      ["2026-12-31", "2025-01-01"],
    ];
    for (const [a, b] of pares) {
      const r = normalizeRange(a, b);
      expect(r.from <= r.to).toBe(true);
      // Y no pierde ni duplica ninguna de las dos fechas.
      expect([r.from, r.to].sort()).toEqual([a, b].sort());
    }
  });
});