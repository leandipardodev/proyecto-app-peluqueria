import { describe, it, expect, vi } from "vitest";

// El setup global mockea @/lib/argentina-time con valores fijos, lo que
// justamente no sirve para verificar una conversion de zona horaria. Se
// re-mockea contra el modulo real para probar el path de Timestamptz.
vi.mock("@/lib/argentina-time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/argentina-time")>();
  return { ...actual };
});

import { buildDemandaBuckets, weekdayFromDateKey } from "@/lib/dashboard/finances/demanda-buckets";

function row(over: Partial<Parameters<typeof buildDemandaBuckets>[0]>[number]) {
  return {
    start_time: "2026-06-15T21:00:00.000Z",
    date_key_ar: "2026-06-15",
    service_id: "svc-1",
    services: { name: "Corte" },
    ...over,
  };
}

describe("weekdayFromDateKey", () => {
  it("resuelve el dia de la semana sin depender del offset del runtime", () => {
    expect(weekdayFromDateKey("2026-06-15")).toBe(1); // lunes
    expect(weekdayFromDateKey("2026-06-21")).toBe(0); // domingo
    expect(weekdayFromDateKey("2026-06-16")).toBe(2); // martes
  });
});

describe("buildDemandaBuckets", () => {
  it("muestra la hora en ART, no en UTC", () => {
    // 21:00Z == 18:00 ART. La tarjeta no debe decir 21:00.
    const { topHorarios } = buildDemandaBuckets([row({})]);
    expect(topHorarios).toEqual([{ name: "18:00", count: 1 }]);
  });

  it("no arrastra al dia siguiente los turnos de 21 a 23:59 ART", () => {
    // 2026-06-15 es lunes. Un turno a las 22:30 ART es 2026-06-16T01:30Z, que en
    // UTC cae el martes: getUTCDay() lo atribuia a martes.
    const { topDias } = buildDemandaBuckets([
      row({ start_time: "2026-06-16T01:30:00.000Z", date_key_ar: "2026-06-15" }),
    ]);
    expect(topDias).toEqual([{ name: "lunes", count: 1 }]);
    expect(topDias.some((d) => d.name === "martes")).toBe(false);
  });

  it("cae a date_key_ar cuando no puede derivarlo del instante", () => {
    const { topDias } = buildDemandaBuckets([
      row({ start_time: "2026-06-16T01:30:00.000Z", date_key_ar: null }),
    ]);
    // Sin date_key_ar usa getArgentinaDateKey: 2026-06-16T01:30Z sigue siendo el
    // 15 en ART, asi que el turno es del lunes.
    expect(topDias).toEqual([{ name: "lunes", count: 1 }]);
  });

  it("usa el mismo set de filas para los tres slides", () => {
    // Un completed sin pagar es demanda igual: si Servicios filtrara is_paid,
    // los totales del carousel no cerrarian.
    const rows = [
      row({ service_id: "a", services: { name: "Corte" } }),
      row({ service_id: "b", services: { name: "Barba" } }),
      row({ service_id: "a", services: { name: "Corte" } }),
    ];
    const { topServicios, topDias, topHorarios } = buildDemandaBuckets(rows);
    const total = topServicios.reduce((sum, s) => sum + s.count, 0);
    expect(total).toBe(rows.length);
    expect(topServicios).toEqual([
      { name: "Corte", count: 2 },
      { name: "Barba", count: 1 },
    ]);
    expect(topDias.reduce((s, d) => s + d.count, 0)).toBe(rows.length);
    expect(topHorarios.reduce((s, h) => s + h.count, 0)).toBe(rows.length);
  });

  it("ordena por cantidad y corta en cinco con desempate estable", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ service_id: `s${i}`, services: { name: `Servicio ${i}` } }),
    );
    const { topServicios } = buildDemandaBuckets(rows, 5);
    expect(topServicios).toHaveLength(5);
    // Todos empatan en 1, asi que el corte tiene que ser siempre el mismo.
    expect(topServicios.map((s) => s.name)).toEqual([
      "Servicio 0",
      "Servicio 1",
      "Servicio 2",
      "Servicio 3",
      "Servicio 4",
    ]);
  });

  it("devuelve todo vacio sin filas y no rompe con filas sin start_time", () => {
    expect(buildDemandaBuckets([])).toEqual({
      topServicios: [],
      topDias: [],
      topHorarios: [],
      busiestDay: null,
      busiestHour: null,
    });
    expect(buildDemandaBuckets([row({ start_time: null })])).toEqual({
      topServicios: [],
      topDias: [],
      topHorarios: [],
      busiestDay: null,
      busiestHour: null,
    });
  });

  it("tolera el join de services como objeto o como array", () => {
    const { topServicios } = buildDemandaBuckets([
      row({ service_id: "x", services: [{ name: "Planchado" }] }),
    ]);
    expect(topServicios).toEqual([{ name: "Planchado", count: 1 }]);
  });
});
