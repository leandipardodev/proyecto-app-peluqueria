import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchPublicAvailableSlots,
  fetchPublicCombos,
} from "@/lib/dashboard/booking/public-booking-actions";
import { mockQueryResult } from "@/__tests__/setup";

const { rateLimitCheck, adminClientMock } = vi.hoisted(() => ({
  rateLimitCheck: vi.fn(),
  adminClientMock: vi.fn(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  createRateLimiter: vi.fn(() => ({ check: rateLimitCheck })),
}));

vi.mock("@/lib/dashboard/appointments/shared", () => ({
  createAdminClient: adminClientMock,
}));

const isoAt = (date: string, hour: number, minute = 0) =>
  new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`).toISOString();

const memberships = (...ids: string[]) => ids.map((id) => ({ user_id: id }));

const queryChains: Record<string, unknown> = {};

function makeAdmin(routes: Record<string, unknown> = {}): never {
  const client = {
    from: vi.fn((table: string) => {
      const data = Object.prototype.hasOwnProperty.call(routes, table) ? routes[table] : null;
      const chain = mockQueryResult(data);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
      queryChains[table] = chain;
      return chain;
    }),
  };
  return client as never;
}

const defaultRoutes = () => ({
  shops: null,
  shop_memberships: memberships("s1", "s2"),
  staff_schedules: [],
  appointments: [],
  pending_bookings: [],
  shop_date_overrides: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitCheck.mockResolvedValue({ allowed: true });
  adminClientMock.mockReset();
  adminClientMock.mockResolvedValue(makeAdmin(defaultRoutes()));
  Object.keys(queryChains).forEach((k) => delete queryChains[k]);
});

describe("fetchPublicAvailableSlots", () => {
  const date = "2026-08-04"; // martes

  it("devuelve lista vacia cuando el rate limiter bloquea", async () => {
    rateLimitCheck.mockResolvedValueOnce({ allowed: false });
    const res = await fetchPublicAvailableSlots("shop-1", 60, date);
    expect(res).toEqual({ success: true, data: [] });
  });

  it("devuelve vacio cuando el local esta cerrado ese dia", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...defaultRoutes(),
        shops: { business_hours: { tuesday: { open: false, start: "09:00", end: "20:00" } } },
      })
    );
    const res = await fetchPublicAvailableSlots("shop-1", 60, date);
    expect(res).toEqual({ success: true, data: [] });
  });

  it("devuelve vacio cuando no hay staff activo", async () => {
    adminClientMock.mockResolvedValue(makeAdmin({ ...defaultRoutes(), shop_memberships: [] }));
    const res = await fetchPublicAvailableSlots("shop-1", 60, date);
    expect(res).toEqual({ success: true, data: [] });
  });

  it("devuelve vacio cuando el filtro por staff deja el pool sin nadie", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({ ...defaultRoutes(), staff_services: [{ staff_id: "s1" }] })
    );
    const res = await fetchPublicAvailableSlots("shop-1", 60, date, ["s2"], "svc-1");
    expect(res).toEqual({ success: true, data: [] });
  });

  it("genera la grilla completa para el horario por defecto (multi-staff)", async () => {
    const res = await fetchPublicAvailableSlots("shop-1", 60, date);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(21);
    expect(res.data![0].start).toBe(isoAt(date, 9, 0));
    expect(res.data![res.data!.length - 1].start).toBe(isoAt(date, 19, 0));
    expect(res.data!.every((s) => s.staffIds.length === 2)).toBe(true);
  });

  it("narrow por serviceId: solo staff capaces del servicio", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({ ...defaultRoutes(), staff_services: [{ staff_id: "s1" }] })
    );
    const res = await fetchPublicAvailableSlots("shop-1", 60, date, undefined, "svc-1");
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(21);
    expect(res.data!.every((s) => s.staffIds.length === 1 && s.staffIds[0] === "s1")).toBe(true);
  });

  it("consulta staff_schedules con el day_of_week correcto para la fecha (bug #5)", async () => {
    await fetchPublicAvailableSlots("shop-1", 60, date);
    const chain = queryChains["staff_schedules"] as { eq: ReturnType<typeof vi.fn> };
    expect(chain).toBeDefined();
    expect(chain.eq).toHaveBeenCalledWith("day_of_week", 2);
  });

  it("aplica override del local: cerrado devuelve vacio", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...defaultRoutes(),
        shop_date_overrides: [{ id: "o1", staff_id: null, date, is_closed: true, start_time: null, end_time: null, break_start: null, break_end: null }],
      })
    );
    const res = await fetchPublicAvailableSlots("shop-1", 60, date);
    expect(res).toEqual({ success: true, data: [] });
  });

  it("aplica override del local: recorta el horario", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...defaultRoutes(),
        shop_memberships: memberships("s1"),
        shop_date_overrides: [{ id: "o1", staff_id: null, date, is_closed: false, start_time: "12:00", end_time: "17:00", break_start: null, break_end: null }],
      })
    );
    const res = await fetchPublicAvailableSlots("shop-1", 60, date);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(9);
    expect(res.data![0].start).toBe(isoAt(date, 12, 0));
    expect(res.data![res.data!.length - 1].start).toBe(isoAt(date, 16, 0));
  });

  it("aplica override del local: el break afecta la grilla", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...defaultRoutes(),
        shop_date_overrides: [{ id: "o1", staff_id: null, date, is_closed: false, start_time: null, end_time: null, break_start: "13:00", break_end: "14:00" }],
      })
    );
    const res = await fetchPublicAvailableSlots("shop-1", 60, date);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(18);
    expect(res.data!.some((s) => s.start === isoAt(date, 13, 0) || s.start === isoAt(date, 13, 30))).toBe(false);
  });

  it("el turno pending_payment reciente bloquea el slot", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...defaultRoutes(),
        shop_memberships: memberships("s1"),
        appointments: [{ start_time: isoAt(date, 12, 0), end_time: isoAt(date, 13, 0), staff_id: "s1", status: "pending_payment", created_at: new Date().toISOString() }],
      })
    );
    const res = await fetchPublicAvailableSlots("shop-1", 60, date);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(18);
    expect(res.data!.some((s) => s.start === isoAt(date, 12, 0))).toBe(false);
  });

  it("el turno pending_payment viejo no bloquea el slot", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...defaultRoutes(),
        shop_memberships: memberships("s1"),
        appointments: [{ start_time: isoAt(date, 12, 0), end_time: isoAt(date, 13, 0), staff_id: "s1", status: "pending_payment", created_at: "2020-01-01T00:00:00.000Z" }],
      })
    );
    const res = await fetchPublicAvailableSlots("shop-1", 60, date);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(21);
  });

  it("un turno confirmado de un staff lo excluye de ese slot", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...defaultRoutes(),
        shop_memberships: memberships("s1"),
        appointments: [{ start_time: isoAt(date, 12, 0), end_time: isoAt(date, 13, 0), staff_id: "s1", status: "scheduled", created_at: null }],
      })
    );
    const res = await fetchPublicAvailableSlots("shop-1", 60, date);
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(18);
  });
});

describe("fetchPublicCombos", () => {
  it("calcula total_duration como suma de los servicios (bug #2)", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        combos: [{ id: "c1", name: "Combo", description: null, price: 100, duration_minutes: 40 }],
        combo_services: [
          { combo_id: "c1", service_id: "sv1" },
          { combo_id: "c1", service_id: "sv2" },
        ],
        services: [
          { id: "sv1", name: "Corte", duration_minutes: 30, price: 10, pay_at_shop: false },
          { id: "sv2", name: "Barba", duration_minutes: 20, price: 15, pay_at_shop: true },
        ],
      })
    );
    const res = await fetchPublicCombos("shop-1");
    expect(res.success).toBe(true);
    expect(res.data![0].total_duration).toBe(50);
    expect(res.data![0].duration_minutes).toBe(40);
  });

  it("combos sin servicios tienen total_duration 0", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        combos: [{ id: "c1", name: "Combo", description: null, price: 100, duration_minutes: 40 }],
        combo_services: [],
        services: [],
      })
    );
    const res = await fetchPublicCombos("shop-1");
    expect(res.success).toBe(true);
    expect(res.data![0].total_duration).toBe(0);
  });

  it("devuelve vacio cuando no hay combos activos", async () => {
    adminClientMock.mockResolvedValue(makeAdmin({ combos: [] }));
    const res = await fetchPublicCombos("shop-1");
    expect(res).toEqual({ success: true, data: [] });
  });
});
