import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPublicAppointment,
  createPublicComboAppointment,
} from "@/lib/dashboard/booking/public-booking-actions";
import { getArgentinaDateKey, getArgentinaMinutesSinceMidnight } from "@/lib/argentina-time";
import { mockQueryResult } from "@/__tests__/setup";

const { cacheHasMock, cacheSetMock, adminClientMock, overridesMock } = vi.hoisted(() => ({
  cacheHasMock: vi.fn(),
  cacheSetMock: vi.fn(),
  adminClientMock: vi.fn(),
  overridesMock: vi.fn(),
}));

vi.mock("@/lib/booking-cache", () => ({
  completedBookingCache: { has: cacheHasMock, set: cacheSetMock },
}));

vi.mock("@/lib/rate-limiter", () => ({
  createRateLimiter: vi.fn(() => ({ check: vi.fn() })),
}));

vi.mock("@/lib/dashboard/appointments/shared", () => ({
  createAdminClient: adminClientMock,
}));

vi.mock("@/lib/dashboard/shop/business-actions", () => ({
  fetchShopDateOverrides: overridesMock,
}));

const baseAppointment = {
  shopId: "shop-1",
  serviceId: "svc-1",
  customerName: "Juan Perez",
  customerEmail: "juan@example.com",
  customerPhone: "1155551234",
  startTime: "2026-08-04T15:00:00-03:00",
  endTime: "2026-08-04T16:00:00-03:00",
};

const baseCombo = {
  shopId: "shop-1",
  comboId: "combo-1",
  comboName: "Corte + Barba",
  comboPrice: 100,
  services: [
    { id: "svc-1", name: "Corte", duration_minutes: 30, price: 50 },
    { id: "svc-2", name: "Barba", duration_minutes: 30, price: 50 },
  ],
  customerName: "Juan Perez",
  customerEmail: "juan@example.com",
  customerPhone: "1155551234",
  startTime: "2026-08-04T15:00:00-03:00",
};

function makeAdmin(routes: Record<string, unknown> = {}): never {
  const client = {
    from: vi.fn((table: string) => {
      const data = Object.prototype.hasOwnProperty.call(routes, table) ? routes[table] : null;
      const chain = mockQueryResult(data);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
      return chain;
    }),
  };
  return client as never;
}

// Admin stub that drives createPublicAppointment through a full SUCCESS path.
// Each table's response is selected by call number, so we can simulate the
// SELECT -> INSERT race on "customers" (23505) and the final appointments insert.
function makeSuccessAdmin(): never {
  const counters: Record<string, number> = {};
  return {
    from: vi.fn((table: string) => {
      counters[table] = (counters[table] ?? 0) + 1;
      const call = counters[table];

      if (table === "customers") {
        if (call === 1) return mockQueryResult(null, null);
        if (call === 2) return mockQueryResult(null, { code: "23505", message: 'duplicate key value violates unique constraint "unique_customer_phone_per_shop"' });
        if (call === 3) return mockQueryResult({ id: "cust-1" }, null);
        return mockQueryResult(null, null);
      }

      if (table === "appointments") {
        if (call === 3) return mockQueryResult({ id: "apt-1" }, null);
        return mockQueryResult([], null);
      }

      if (table === "pending_bookings") return mockQueryResult([], null);

      if (table === "shops") {
        return mockQueryResult({ business_hours: { saturday: { open: true, start: "09:00", end: "20:00" } } }, null);
      }

      if (table === "staff_schedules") {
        return mockQueryResult({ is_active: true, start_time: "09:00:00", end_time: "20:00:00", break_start: null, break_end: null }, null);
      }

      if (table === "staff_services") return mockQueryResult([{ service_id: "svc-1" }], null);
      if (table === "services") return mockQueryResult({ price: 100 }, null);

      return mockQueryResult(null, null);
    }),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  cacheHasMock.mockReturnValue(false);
  overridesMock.mockResolvedValue({ success: true, data: [] });
  adminClientMock.mockReset();
  adminClientMock.mockResolvedValue(makeAdmin({}));
  vi.mocked(getArgentinaDateKey).mockImplementation(() => "2030-06-15");
  vi.mocked(getArgentinaMinutesSinceMidnight).mockImplementation(() => 600);
});

describe("createPublicAppointment - validacion", () => {
  it("devuelve login_required cuando hay booking repetido sin sesion", async () => {
    cacheHasMock.mockReturnValue(true);
    const res = await createPublicAppointment(baseAppointment);
    expect(res).toEqual({ success: false, error: "login_required" });
  });

  it("no pide login cuando hay booking repetido pero hay usuario autenticado", async () => {
    cacheHasMock.mockReturnValue(true);
    const res = await createPublicAppointment({ ...baseAppointment, authenticatedUserId: "user-1" });
    expect(res.error).not.toBe("login_required");
    expect(res.error).toBe("No hay profesionales disponibles para este turno");
  });

  it("rechaza horario con endTime menor o igual a startTime", async () => {
    const res = await createPublicAppointment({ ...baseAppointment, endTime: "2026-08-04T14:00:00-03:00" });
    expect(res).toEqual({ success: false, error: "Horario invalido" });
  });

  it("rechaza startTime invalido", async () => {
    const res = await createPublicAppointment({ ...baseAppointment, startTime: "no-es-fecha" });
    expect(res).toEqual({ success: false, error: "Horario invalido" });
  });

  it("rechaza email mal formado", async () => {
    const res = await createPublicAppointment({ ...baseAppointment, customerEmail: "mal-email" });
    expect(res).toEqual({ success: false, error: "Email inválido" });
  });

  it("rechaza telefono demasiado corto", async () => {
    const res = await createPublicAppointment({ ...baseAppointment, customerPhone: "123" });
    expect(res).toEqual({ success: false, error: "Teléfono inválido" });
  });

  it("rechaza telefono demasiado largo", async () => {
    const res = await createPublicAppointment({ ...baseAppointment, customerPhone: "1234567890123456" });
    expect(res).toEqual({ success: false, error: "Teléfono inválido" });
  });

  it("rechaza nombre muy corto", async () => {
    const res = await createPublicAppointment({ ...baseAppointment, customerName: "A" });
    expect(res).toEqual({ success: false, error: "Nombre inválido" });
  });

  it("rechaza reservar en una fecha pasada", async () => {
    vi.mocked(getArgentinaDateKey).mockReturnValue("2020-01-01");
    const res = await createPublicAppointment(baseAppointment);
    expect(res).toEqual({ success: false, error: "No se puede reservar en una fecha pasada" });
  });

  it("rechaza reservar en un horario pasado hoy", async () => {
    vi.mocked(getArgentinaMinutesSinceMidnight).mockReturnValueOnce(600).mockReturnValueOnce(300);
    const res = await createPublicAppointment(baseAppointment);
    expect(res).toEqual({ success: false, error: "No se puede reservar en un horario pasado" });
  });

  it("rechaza staff inactivo para el dia (bug #3, defensa en profundidad)", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        staff_schedules: { is_active: false, start_time: "09:00:00", end_time: "18:00:00", break_start: null, break_end: null },
      })
    );
    const res = await createPublicAppointment({ ...baseAppointment, staffId: "s1" });
    expect(res).toEqual({ success: false, error: "El profesional no trabaja este dia" });
  });

  it("rechaza cuando el local esta cerrado ese dia", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({ shops: { business_hours: { saturday: { open: false, start: "09:00", end: "20:00" } } } })
    );
    const res = await createPublicAppointment(baseAppointment);
    expect(res).toEqual({ success: false, error: "El local esta cerrado en ese horario" });
  });

  it("rechaza turnos fuera del horario de atencion", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({ shops: { business_hours: { saturday: { open: true, start: "12:00", end: "13:00" } } } })
    );
    const res = await createPublicAppointment(baseAppointment);
    expect(res).toEqual({ success: false, error: "El horario seleccionado esta fuera del horario de atencion" });
  });

  it("rechaza turnos que coinciden con el descanso (bug #4, defensa en profundidad)", async () => {
    vi.mocked(getArgentinaMinutesSinceMidnight).mockImplementation((d: Date | string) => {
      if (typeof d !== "string") return 600;
      const m = d.match(/T(\d{2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : 600;
    });
    adminClientMock.mockResolvedValue(
      makeAdmin({ shops: { business_hours: { saturday: { open: true, start: "09:00", end: "20:00", break_start: "15:00", break_end: "17:00" } } } })
    );
    const res = await createPublicAppointment(baseAppointment);
    expect(res).toEqual({ success: false, error: "El horario seleccionado coincide con el descanso" });
  });
});

describe("createPublicAppointment - cliente atomico y cache", () => {
  it("resuelve una carrera de insercion de cliente (23505) reusando el registro existente", async () => {
    adminClientMock.mockResolvedValue(makeSuccessAdmin());
    const res = await createPublicAppointment({ ...baseAppointment, staffId: "s1", customerEmail: undefined });
    expect(res).toEqual({ success: true, data: { customerId: "cust-1", appointmentId: "apt-1" } });
  });

  it("no marca el booking como repetido cuando el turno queda pending_payment", async () => {
    adminClientMock.mockResolvedValue(makeSuccessAdmin());
    const res = await createPublicAppointment({ ...baseAppointment, staffId: "s1", customerEmail: undefined, status: "pending_payment" });
    expect(res.success).toBe(true);
    expect(cacheSetMock).not.toHaveBeenCalled();
  });

  it("no marca el booking como repetido para items intermedios del carrito (skipRepeatCache)", async () => {
    adminClientMock.mockResolvedValue(makeSuccessAdmin());
    const res = await createPublicAppointment({ ...baseAppointment, staffId: "s1", customerEmail: undefined, status: "scheduled", skipRepeatCache: true });
    expect(res.success).toBe(true);
    expect(cacheSetMock).not.toHaveBeenCalled();
  });

  it("marca el booking como completado para un turno pagado en local (scheduled)", async () => {
    adminClientMock.mockResolvedValue(makeSuccessAdmin());
    const res = await createPublicAppointment({ ...baseAppointment, staffId: "s1", customerEmail: undefined, status: "scheduled" });
    expect(res.success).toBe(true);
    expect(cacheSetMock).toHaveBeenCalledTimes(1);
  });
});

describe("createPublicComboAppointment - validacion", () => {
  it("devuelve login_required cuando hay booking repetido sin sesion", async () => {
    cacheHasMock.mockReturnValue(true);
    const res = await createPublicComboAppointment(baseCombo);
    expect(res).toEqual({ success: false, error: "login_required" });
  });

  it("rechaza startTime invalido", async () => {
    const res = await createPublicComboAppointment({ ...baseCombo, startTime: "no-es-fecha" });
    expect(res).toEqual({ success: false, error: "Horario invalido" });
  });

  it("rechaza email mal formado", async () => {
    const res = await createPublicComboAppointment({ ...baseCombo, customerEmail: "mal-email" });
    expect(res).toEqual({ success: false, error: "Email inválido" });
  });

  it("rechaza telefono invalido", async () => {
    const res = await createPublicComboAppointment({ ...baseCombo, customerPhone: "12" });
    expect(res).toEqual({ success: false, error: "Teléfono inválido" });
  });

  it("rechaza nombre invalido", async () => {
    const res = await createPublicComboAppointment({ ...baseCombo, customerName: "" });
    expect(res).toEqual({ success: false, error: "Nombre inválido" });
  });

  it("rechaza duracion total invalida (bug #2, defensa en profundidad)", async () => {
    const res = await createPublicComboAppointment({ ...baseCombo, services: [] });
    expect(res).toEqual({ success: false, error: "Duracion invalida" });
  });

  it("rechaza reservar en una fecha pasada", async () => {
    vi.mocked(getArgentinaDateKey).mockReturnValue("2020-01-01");
    const res = await createPublicComboAppointment(baseCombo);
    expect(res).toEqual({ success: false, error: "No se puede reservar en una fecha pasada" });
  });

  it("rechaza reservar en un horario pasado hoy", async () => {
    vi.mocked(getArgentinaMinutesSinceMidnight).mockReturnValueOnce(600).mockReturnValueOnce(300);
    const res = await createPublicComboAppointment(baseCombo);
    expect(res).toEqual({ success: false, error: "No se puede reservar en un horario pasado" });
  });

  it("rechaza staff inactivo para el dia", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        staff_schedules: { is_active: false, start_time: "09:00:00", end_time: "18:00:00", break_start: null, break_end: null },
      })
    );
    const res = await createPublicComboAppointment({ ...baseCombo, staffId: "s1" });
    expect(res).toEqual({ success: false, error: "El profesional no trabaja este dia" });
  });

  it("rechaza cuando el local esta cerrado ese dia", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({ shops: { business_hours: { saturday: { open: false, start: "09:00", end: "20:00" } } } })
    );
    const res = await createPublicComboAppointment(baseCombo);
    expect(res).toEqual({ success: false, error: "El local esta cerrado en ese horario" });
  });
});
