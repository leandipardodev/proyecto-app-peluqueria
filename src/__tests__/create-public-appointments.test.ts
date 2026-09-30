import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPublicAppointment,
  createPublicComboAppointment,
} from "@/lib/dashboard/booking/public-booking-actions";
import { getArgentinaDateKey, getArgentinaMinutesSinceMidnight } from "@/lib/argentina-time";
import { mockQueryResult } from "@/__tests__/setup";

const { cacheHasMock, cacheSetMock, adminClientMock } = vi.hoisted(() => ({
  cacheHasMock: vi.fn(),
  cacheSetMock: vi.fn(),
  adminClientMock: vi.fn(),
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

/**
 * Stub que ademas resuelve el combo contra la base.
 *
 * createPublicComboAppointment no confía en comboPrice ni en los precios que
 * manda el cliente: los relee de `combos` + `combo_services` + `services`. Sin
 * estas tres rutas, la funcion cortaria antes de la validacion que cada test
 * quiere verificar.
 */
function makeComboAdmin(routes: Record<string, unknown> = {}): never {
  return makeAdmin({
    combos: { id: "combo-1", name: "Corte + Barba", price: 100, active: true, shop_id: "shop-1" },
    combo_services: [{ combo_id: "combo-1", service_id: "svc-1" }, { combo_id: "combo-1", service_id: "svc-2" }],
    services: [
      { id: "svc-1", name: "Corte", duration_minutes: 30, price: 50, pay_at_shop: false, shop_id: "shop-1" },
      { id: "svc-2", name: "Barba", duration_minutes: 30, price: 50, pay_at_shop: false, shop_id: "shop-1" },
    ],
    ...routes,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cacheHasMock.mockReturnValue(false);
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
    const res = await createPublicAppointment({ ...baseAppointment, staffId: "s1", customerEmail: undefined, status: "confirmed", skipRepeatCache: true });
    expect(res.success).toBe(true);
    expect(cacheSetMock).not.toHaveBeenCalled();
  });

  it("marca el booking como completado para un turno pagado en local (confirmed)", async () => {
    adminClientMock.mockResolvedValue(makeSuccessAdmin());
    const res = await createPublicAppointment({ ...baseAppointment, staffId: "s1", customerEmail: undefined, status: "confirmed" });
    expect(res.success).toBe(true);
    expect(cacheSetMock).toHaveBeenCalledTimes(1);
  });
});

describe("doble booking — exclusion constraint (migracion 109)", () => {
  // Los chequeos de conflicto son check-then-insert en dos viajes: dos requests
  // concurrentes para el mismo horario pasan los dos chequeos. La constraint
  // no_overlap_appointments_confirmed cierra esa ventana y Postgres devuelve
  // 23P01, que hay que traducir a slot_taken para no cambiar la UI.

  function makeOverlapAdmin(): never {
    const base = makeSuccessAdmin();
    const innerFrom = (base as unknown as { from: (t: string) => unknown }).from;
    return {
      from: vi.fn((table: string) => {
        if (table !== "appointments") return innerFrom(table);
        const cq = mockQueryResult([] as unknown[], null);
        cq.insert = vi.fn(() =>
          mockQueryResult(null, { code: "23P01", message: "conflicting key value violates exclusion constraint \"no_overlap_appointments_confirmed\"" })
        );
        cq.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        return cq;
      }),
    } as never;
  }

  it("createPublicAppointment devuelve slot_taken cuando choca la constraint", async () => {
    adminClientMock.mockResolvedValue(makeOverlapAdmin());
    const res = await createPublicAppointment({ ...baseAppointment, staffId: "s1", customerEmail: undefined });
    expect(res).toEqual({ success: false, error: "slot_taken" });
  });

  it("createPublicComboAppointment devuelve slot_taken cuando choca la constraint", async () => {
    // En el combo el error sale del insert del segundo servicio; el primero ya
    // fue creado y tiene que hacer rollback.
    const created: string[] = [];
    const comboBase = makeComboAdmin();
    const innerFrom = (comboBase as unknown as { from: (t: string) => unknown }).from;
    const from = vi.fn((table: string) => {
      if (table === "customers") {
        const cq = mockQueryResult(null, null);
        cq.single = vi.fn().mockResolvedValue({ data: { id: "cust-1" }, error: null });
        cq.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        return cq;
      }
      if (table === "appointments") {
        const cq = mockQueryResult([] as unknown[], null);
        cq.insert = vi.fn(() => {
          created.push("apt");
          return mockQueryResult(
            null,
            { code: "23P01", message: "conflicting key value violates exclusion constraint \"no_overlap_appointments_confirmed\"" }
          );
        });
        cq.delete = vi.fn(() => mockQueryResult(null, null));
        cq.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        return cq;
      }
      return innerFrom(table);
    });
    adminClientMock.mockResolvedValue({ from } as never);

    const res = await createPublicComboAppointment({ ...baseCombo, staffId: "s1" });
    expect(res).toEqual({ success: false, error: "slot_taken" });
  });

  it("no traduce otros errores de Postgres a slot_taken", async () => {
    // Si se tradujera cualquier error, un problema real (columna inexistente,
    // conexion caida) se leeria como "horario ocupado" y el usuario no sabria
    // que algo esta roto.
    const base = makeSuccessAdmin();
    const innerFrom = (base as unknown as { from: (t: string) => unknown }).from;
    adminClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== "appointments") return innerFrom(table);
        const cq = mockQueryResult([] as unknown[], null);
        cq.insert = vi.fn(() => mockQueryResult(null, { code: "42703", message: 'column "foo" does not exist' }));
        cq.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        return cq;
      }),
    } as never);

    const res = await createPublicAppointment({ ...baseAppointment, staffId: "s1", customerEmail: undefined });
    expect(res).toEqual({ success: false, error: 'column "foo" does not exist' });
  });
});

describe("createPublicComboAppointment - validacion", () => {
  beforeEach(() => {
    adminClientMock.mockResolvedValue(makeComboAdmin());
  });

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

  it("rechaza un set de servicios vacio", async () => {
    // Antes caia en el guard de "Duracion invalida". Ahora la lista vacia se
    // rechaza antes: el set de servicios se contrasta contra combo_services, y
    // vacio no coincide con los servicios que el combo tiene de verdad.
    const res = await createPublicComboAppointment({ ...baseCombo, services: [] });
    expect(res).toEqual({ success: false, error: "El combo no esta disponible" });
  });

  it("rechaza un combo con duracion cero en la base", async () => {
    // El guard de "Duracion invalida" sigue existiendo como defensa en
    // profundidad, pero hoy es inalcanzable desde el cliente: un servicio de
    // duracion 0 o null hace fallar resolveComboFromDb antes.
    adminClientMock.mockResolvedValue(
      makeComboAdmin({
        services: [
          { id: "svc-1", name: "Corte", duration_minutes: 0, price: 50, pay_at_shop: false, shop_id: "shop-1" },
          { id: "svc-2", name: "Barba", duration_minutes: 30, price: 50, pay_at_shop: false, shop_id: "shop-1" },
        ],
      })
    );
    const res = await createPublicComboAppointment(baseCombo);
    expect(res).toEqual({ success: false, error: "El combo no esta disponible" });
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
      makeComboAdmin({
        staff_schedules: { is_active: false, start_time: "09:00:00", end_time: "18:00:00", break_start: null, break_end: null },
      })
    );
    const res = await createPublicComboAppointment({ ...baseCombo, staffId: "s1" });
    expect(res).toEqual({ success: false, error: "El profesional no trabaja este dia" });
  });

  it("rechaza cuando el local esta cerrado ese dia", async () => {
    adminClientMock.mockResolvedValue(
      makeComboAdmin({ shops: { business_hours: { saturday: { open: false, start: "09:00", end: "20:00" } } } })
    );
    const res = await createPublicComboAppointment(baseCombo);
    expect(res).toEqual({ success: false, error: "El local esta cerrado en ese horario" });
  });
});

describe("createPublicComboAppointment - precio controlado por el cliente", () => {
  // El Server Action es publico: sin sesion ni firma. Antes tomaba comboPrice y
  // services[].price del cliente, y esos valores se prorrateaban a cada turno
  // (service_price) y de ahi salia el monto cobrado. Mandar comboPrice: 1
  // compraba un combo de 100 por 1 peso.

  /**
   * Admin que llega hasta el insert y captura los service_price prorrateados.
   *
   * `appointments` aparece en dos roles distintos dentro de la misma funcion: los
   * SELECT de chequeo de conflictos tienen que devolver un array, y el INSERT
   * tiene que devolver la fila creada. Un unico mock no sirve para los dos.
   */
  function makeInsertingAdmin(): { inserted: Array<Record<string, unknown>> } {
    const inserted: Array<Record<string, unknown>> = [];
    const base = makeComboAdmin();
    const innerFrom = (base as unknown as { from: (t: string) => unknown }).from;
    adminClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "customers") {
          // resolveCustomer inserta y hace .select("id").single().
          const cq = mockQueryResult(null, null);
          cq.single = vi.fn().mockResolvedValue({ data: { id: "cust-1" }, error: null });
          cq.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          return cq;
        }
        if (table !== "appointments") return innerFrom(table);
        const cq = mockQueryResult([] as unknown[], null);
        cq.insert = vi.fn((row: Record<string, unknown>) => {
          inserted.push(row);
          return mockQueryResult({ id: `apt-${inserted.length}` }, null);
        });
        cq.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        return cq;
      }),
    } as never);
    return { inserted };
  }

  beforeEach(() => {
    // El flujo llega hasta el insert: hay profesional, horario abierto y sin conflictos.
    vi.mocked(getArgentinaMinutesSinceMidnight).mockReturnValue(600);
  });

  it("ignora comboPrice y usa el precio del combo en la base", async () => {
    const { inserted } = makeInsertingAdmin();

    const res = await createPublicComboAppointment({ ...baseCombo, comboPrice: 1, staffId: "s1" });

    expect(res.success).toBe(true);
    // Combo de la base: 100. Prorrateado 50/50 entre los dos servicios.
    expect(inserted).toHaveLength(2);
    for (const row of inserted) {
      expect(row.service_price).toBe(50);
    }
  });

  it("ignora los precios por servicio que manda el cliente", async () => {
    const { inserted } = makeInsertingAdmin();

    const res = await createPublicComboAppointment({
      ...baseCombo,
      staffId: "s1",
      services: [
        { id: "svc-1", name: "Corte", duration_minutes: 30, price: 1 },
        { id: "svc-2", name: "Barba", duration_minutes: 30, price: 1 },
      ],
    });

    expect(res.success).toBe(true);
    for (const row of inserted) {
      expect(row.service_price).toBe(50);
    }
  });

  it("rechaza un combo inactivo", async () => {
    adminClientMock.mockResolvedValue(
      makeComboAdmin({ combos: { id: "combo-1", name: "Corte + Barba", price: 100, active: false, shop_id: "shop-1" } })
    );
    const res = await createPublicComboAppointment({ ...baseCombo, staffId: "s1" });
    expect(res).toEqual({ success: false, error: "El combo no esta disponible" });
  });

  it("rechaza un combo de otro local", async () => {
    // comboId de otro local: la consulta filtra por shop_id, asi que no existe.
    adminClientMock.mockResolvedValue(makeComboAdmin({ combos: null }));
    const res = await createPublicComboAppointment({ ...baseCombo, staffId: "s1" });
    expect(res).toEqual({ success: false, error: "El combo no esta disponible" });
  });

  it("rechaza agregar un servicio que el combo no incluye", async () => {
    // El cliente no puede meter un servicio barato/superlujo fuera del combo.
    const res = await createPublicComboAppointment({
      ...baseCombo,
      staffId: "s1",
      services: [
        { id: "svc-1", name: "Corte", duration_minutes: 30, price: 50 },
        { id: "svc-2", name: "Barba", duration_minutes: 30, price: 50 },
        { id: "svc-3", name: "Coloracion", duration_minutes: 90, price: 5000 },
      ],
    });
    expect(res).toEqual({ success: false, error: "El combo no esta disponible" });
  });

  it("rechaza quitar un servicio que el combo si incluye", async () => {
    const res = await createPublicComboAppointment({
      ...baseCombo,
      staffId: "s1",
      services: [{ id: "svc-1", name: "Corte", duration_minutes: 30, price: 50 }],
    });
    expect(res).toEqual({ success: false, error: "El combo no esta disponible" });
  });

  it("rechaza un servicio del combo que pertenece a otro local", async () => {
    adminClientMock.mockResolvedValue(
      makeComboAdmin({
        services: [
          { id: "svc-1", name: "Corte", duration_minutes: 30, price: 50, pay_at_shop: false, shop_id: "shop-1" },
          { id: "svc-2", name: "Barba", duration_minutes: 30, price: 50, pay_at_shop: false, shop_id: "OTRO-LOCAL" },
        ],
      })
    );
    const res = await createPublicComboAppointment({ ...baseCombo, staffId: "s1" });
    expect(res).toEqual({ success: false, error: "El combo no esta disponible" });
  });
});
