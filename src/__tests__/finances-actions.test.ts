import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchFinanceData,
  openCashSession,
  closeCashSession,
  createCashMovement,
  createExpense,
  deleteExpense,
  fetchStaffProduction,
  upsertStaffCompensationRule,
  createStaffPreLiquidation,
  markStaffLiquidationPaid,
  fetchCashMovements,
  fetchStaffLiquidations,
  fetchStaffLiquidationsHistory,
  fetchCashSessionsHistory,
} from "@/lib/dashboard/finances/finances-actions";
import { getCurrentUserRole as mockGetCurrentUserRole, requireOwnerShopId as mockRequireOwnerShopId, requireShopId as mockRequireShopId, createServiceRoleClient as mockCreateServiceRole } from "@/lib/dashboard/auth/server";
import { createServerClient as mockCreateServerClient } from "@/lib/supabase/server";
import { revalidateDashboardSegments as mockRevalidate } from "@/lib/dashboard/shared/revalidate-dashboard";
import { supabaseStub, chainableQuery } from "@/__tests__/setup";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockRequireShopId).mockResolvedValue({ success: true, data: "shop-123" });
  vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: true, data: "shop-123" });
  vi.mocked(mockGetCurrentUserRole).mockResolvedValue({ success: true, data: { role: "owner", userId: "user-1" } });
  vi.mocked(mockCreateServerClient).mockResolvedValue(supabaseStub());
  vi.mocked(mockCreateServiceRole).mockResolvedValue(supabaseStub());
});

// ---------------------------------------------------------------------------
// fetchFinanceData
// ---------------------------------------------------------------------------
describe("fetchFinanceData", () => {
  function makeFinanceMock(
    appointmentsData: unknown[],
    expensesData: unknown[] = [],
    cashData: unknown[] = [],
  ) {
    const appointmentChain = chainableQuery();
    const financeChain = chainableQuery();
    const cashChain = chainableQuery();

    // Override then to resolve to desired data
    appointmentChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: appointmentsData, error: null }).then(onfulfilled);
    financeChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: expensesData, error: null }).then(onfulfilled);
    cashChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: cashData, error: null }).then(onfulfilled);

    return {
      from: vi.fn((table: string) => {
        if (table === "appointments") return appointmentChain;
        if (table === "finances") return financeChain;
        if (table === "cash_movements") return cashChain;
        return chainableQuery();
      }),
    } as never;
  }

  it("returns success with computed totals", async () => {
    const incomeData = [
      { id: "apt-1", start_time: "2030-06-15T10:00:00", status: "completed", services: { price: 1500, name: "Corte" } },
      { id: "apt-2", start_time: "2030-06-15T11:00:00", status: "completed", services: { price: 2000, name: "Tinte" } },
    ];
    vi.mocked(mockCreateServiceRole).mockResolvedValue(makeFinanceMock(incomeData));

    const result = await fetchFinanceData("2030-06-15", "2030-06-15");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.totalIncome).toBe(3500);
    expect(result.data.totalExpenses).toBe(0);
    expect(result.data.netBalance).toBe(3500);
    expect(result.data.appointmentsCount).toBe(2);
  });

  it("includes cash movements in totals", async () => {
    const cashData = [
      { id: "cm-1", movement_type: "income", amount: 500, category: "Venta", description: "Venta producto", happened_at: "2030-06-15T12:00:00" },
      { id: "cm-2", movement_type: "expense", amount: 200, category: "Insumos", description: "Compra insumos", happened_at: "2030-06-15T13:00:00" },
    ];
    vi.mocked(mockCreateServiceRole).mockResolvedValue(makeFinanceMock([], [], cashData));

    const result = await fetchFinanceData("2030-06-15", "2030-06-15");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.totalIncome).toBe(500);
    expect(result.data.totalExpenses).toBe(200);
    expect(result.data.netBalance).toBe(300);
  });

  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await fetchFinanceData();
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("returns error on appointments query failure", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
      })),
    } as never);

    const result = await fetchFinanceData("2030-06-15", "2030-06-15", "shop-123");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// openCashSession
// ---------------------------------------------------------------------------
describe("openCashSession", () => {
  function createFormData(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("opening_amount", overrides.opening_amount ?? "1000");
    return fd;
  }

  it("returns success when session is opened", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn(() => chainableQuery({ insert: vi.fn().mockReturnThis() })),
    } as never);
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery()),
    } as never);

    const fd = createFormData();
    const result = await openCashSession(fd);
    expect(result).toEqual({ success: true });
  });

  it("returns error when no user", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    const fd = createFormData();
    const result = await openCashSession(fd);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const fd = createFormData();
    const result = await openCashSession(fd);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// closeCashSession
// ---------------------------------------------------------------------------
describe("closeCashSession", () => {
  function createFormData(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("session_id", overrides.session_id ?? "session-1");
    fd.set("counted_amount", overrides.counted_amount ?? "5000");
    return fd;
  }

  it("returns success when session is closed", async () => {
    const cashMovesChain = chainableQuery();
    cashMovesChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: [], error: null }).then(onfulfilled);

    const sessionChain = chainableQuery();
    sessionChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: null, error: null }).then(onfulfilled);

    const sessionDataChain = chainableQuery();
    sessionDataChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: { opening_amount: 1000 }, error: null }).then(onfulfilled);

    const updateChain = chainableQuery();
    updateChain.then = (onfulfilled: any) =>
      Promise.resolve({ error: null }).then(onfulfilled);

    let callIndex = 0;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => {
        callIndex++;
        if (callIndex === 1) return cashMovesChain;    // cash_movements SELECT
        if (callIndex === 2) return sessionDataChain;    // cash_sessions SELECT .single()
        if (callIndex === 3) return updateChain;         // cash_sessions UPDATE
        return chainableQuery();
      }),
    } as never);
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    } as never);

    const fd = createFormData();
    const result = await closeCashSession(fd);
    expect(result).toEqual({ success: true });
  });

  it("returns error when session_id is missing", async () => {
    const fd = createFormData({ session_id: "" });
    const result = await closeCashSession(fd);
    expect(result).toEqual({ success: false, error: "Sesion de caja invalida" });
  });

  it("returns error when no user", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    const fd = createFormData();
    const result = await closeCashSession(fd);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// createCashMovement
// ---------------------------------------------------------------------------
describe("createCashMovement", () => {
  function createFormData(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("amount", overrides.amount ?? "500");
    fd.set("movement_type", overrides.movement_type ?? "income");
    fd.set("payment_method", overrides.payment_method ?? "cash");
    fd.set("category", overrides.category ?? "General");
    return fd;
  }

  it("returns success when movement is created", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    } as never);
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockReturnThis(),
      })),
    } as never);

    const fd = createFormData();
    const result = await createCashMovement(fd);
    expect(result).toEqual({ success: true });
  });

  it("returns error when no user", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    const fd = createFormData();
    const result = await createCashMovement(fd);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// createExpense
// ---------------------------------------------------------------------------
describe("createExpense", () => {
  function createFormData(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("amount", overrides.amount ?? "1500");
    fd.set("category", overrides.category ?? "Insumos");
    fd.set("description", overrides.description ?? "Compra de tijeras");
    return fd;
  }

  it("returns success when expense is created", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ insert: vi.fn().mockReturnThis() })),
    } as never);

    const fd = createFormData();
    const result = await createExpense(fd);
    expect(result).toEqual({ success: true });
  });

  it("returns error when amount is NaN", async () => {
    const fd = createFormData({ amount: "abc" });
    const result = await createExpense(fd);
    expect(result).toEqual({ success: false, error: "El monto debe ser un número positivo" });
  });

  it("returns error when amount is zero", async () => {
    const fd = createFormData({ amount: "0" });
    const result = await createExpense(fd);
    expect(result).toEqual({ success: false, error: "El monto debe ser un número positivo" });
  });

  it("returns error when amount is negative", async () => {
    const fd = createFormData({ amount: "-100" });
    const result = await createExpense(fd);
    expect(result).toEqual({ success: false, error: "El monto debe ser un número positivo" });
  });

  it("returns error when category is missing", async () => {
    const fd = createFormData({ amount: "500", category: "" });
    const result = await createExpense(fd);
    expect(result).toEqual({ success: false, error: "La categoría es obligatoria" });
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const fd = createFormData();
    const result = await createExpense(fd);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// deleteExpense
// ---------------------------------------------------------------------------
describe("deleteExpense", () => {
  it("returns success when expense is deleted", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ delete: vi.fn().mockReturnThis() })),
    } as never);

    const result = await deleteExpense("exp-1");
    expect(result).toEqual({ success: true });
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await deleteExpense("exp-1");
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// fetchStaffProduction
// ---------------------------------------------------------------------------
describe("fetchStaffProduction", () => {
  it("returns empty list when no staff", async () => {
    const chain = chainableQuery();
    (chain as any).then = ((onfulfilled: any) =>
      Promise.resolve({ data: [], error: null }).then(onfulfilled));
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chain),
    } as never);

    const result = await fetchStaffProduction("2030-06-15", "2030-06-15", "shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.rows).toEqual([]);
    expect(result.data.truncated).toBe(false);
  });

  it("marca truncated cuando el rango tiene mas turnos que el limite", async () => {
    const chain = chainableQuery();
    (chain as any).then = ((onfulfilled: any) =>
      Promise.resolve({ data: [], count: 9000, error: null }).then(onfulfilled));
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chain),
    } as never);

    const result = await fetchStaffProduction("2030-06-01", "2030-06-30", "shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.truncated).toBe(true);
  });

  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await fetchStaffProduction();
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// upsertStaffCompensationRule
// ---------------------------------------------------------------------------
describe("upsertStaffCompensationRule", () => {
  function createFormData(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("staff_user_id", overrides.staff_user_id ?? "staff-1");
    fd.set("starts_on", overrides.starts_on ?? "2030-06-01");
    fd.set("percentage_rate", overrides.percentage_rate ?? "30");
    return fd;
  }

  it("returns success when rule is created", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        is: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      })),
    } as never);

    const fd = createFormData();
    const result = await upsertStaffCompensationRule(fd);
    expect(result).toEqual({ success: true });
  });

  it("returns error when staff_user_id is missing", async () => {
    const fd = createFormData({ staff_user_id: "" });
    const result = await upsertStaffCompensationRule(fd);
    expect(result).toEqual({ success: false, error: "Staff invalido" });
  });

  it("returns error when starts_on is missing", async () => {
    const fd = createFormData({ starts_on: "" });
    const result = await upsertStaffCompensationRule(fd);
    expect(result).toEqual({ success: false, error: "Fecha de inicio requerida" });
  });

  it("returns error when percentage_rate is over 100", async () => {
    const fd = createFormData({ percentage_rate: "150" });
    const result = await upsertStaffCompensationRule(fd);
    expect(result).toEqual({ success: false, error: "Porcentaje invalido" });
  });

  it("returns error when percentage_rate is negative", async () => {
    const fd = createFormData({ percentage_rate: "-10" });
    const result = await upsertStaffCompensationRule(fd);
    expect(result).toEqual({ success: false, error: "Porcentaje invalido" });
  });
});

// ---------------------------------------------------------------------------
// markStaffLiquidationPaid
// ---------------------------------------------------------------------------
describe("markStaffLiquidationPaid", () => {
  it("returns success when liquidation is marked paid", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), select: vi.fn().mockResolvedValue({ data: [{ id: "liq-1" }], error: null }) })),
    } as never);

    const result = await markStaffLiquidationPaid("liq-1", 5000);
    expect(result).toEqual({ success: true });
  });

  it("no vuelve a pagar una liquidacion que ya estaba pagada", async () => {
    // El update lleva `.neq("status","paid")` + `select("id")`: si no vuelve
    // ninguna fila, el filtro_no_ matcheó y la liquidacion ya estaba paga.
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), select: vi.fn().mockResolvedValue({ data: [], error: null }) })),
    } as never);

    const result = await markStaffLiquidationPaid("liq-1", 5000);
    expect(result).toEqual({ success: false, error: "Esta liquidacion ya estaba pagada" });
  });

  it("asienta el pago de la comision como Gasto", async () => {
    // Pagar al profesional es plata que sale del local. Antes no dejaba ningun
    // rastro, asi que el Balance no lo veia.
    const gastos: Record<string, unknown>[] = [];
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "staff_liquidations") {
          return chainableQuery({
            update: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            select: vi.fn().mockResolvedValue({
              data: [{ id: "liq-1", staff_user_id: "staff-1", period_start: "2030-06-01", period_end: "2030-06-14", final_payable: 4000, paid_amount: 4000 }],
              error: null,
            }),
          });
        }
        if (table === "shop_memberships") {
          const chain = chainableQuery();
          chain.then = ((f: (v: unknown) => unknown) =>
            Promise.resolve({ data: [{ user_id: "staff-1", role: "staff" }], error: null }).then(f)) as never;
          return chain;
        }
        if (table === "user_profiles") {
          const chain = chainableQuery();
          chain.then = ((f: (v: unknown) => unknown) =>
            Promise.resolve({ data: [{ user_id: "staff-1", name: "Ana" }], error: null }).then(f)) as never;
          return chain;
        }
        if (table === "finances") {
          return chainableQuery({
            insert: vi.fn((row: Record<string, unknown>) => {
              gastos.push(row);
              return chainableQuery();
            }),
          });
        }
        return chainableQuery();
      }),
    } as never);

    const result = await markStaffLiquidationPaid("liq-1", 4000);

    expect(result).toEqual({ success: true });
    expect(gastos).toHaveLength(1);
    expect(gastos[0]).toMatchObject({ type: "expense", category: "Comisiones", amount: 4000 });
    expect(String(gastos[0].description)).toContain("Ana");
    // Sin appointment_id: Inicio filtra las filas de `finances` por
    // `appointment_id IS NULL` y Caja no. Con el id puesto, Inicio no lo
    // contaria y Caja si.
    expect(gastos[0].appointment_id).toBeUndefined();
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await markStaffLiquidationPaid("liq-1", 5000);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// createStaffPreLiquidation
// ---------------------------------------------------------------------------
describe("createStaffPreLiquidation", () => {
  /**
   * `staff_liquidations` se consulta dos veces en el camino nuevo: primero el
   * `select` de la liquidacion existente y despues el `insert`. El stub lleva la
   * cuenta para que cada cadena resuelva lo suyo.
   */
  function makeMock(opts: { existing: { id: string; status: string } | null; appointments?: unknown[] }) {
    const calls: Record<string, number> = {};
    const liqInserts: Record<string, unknown>[] = [];

    const client = {
      from: vi.fn((table: string) => {
        calls[table] = (calls[table] ?? 0) + 1;
        const chain = chainableQuery();
        const resolve = (data: unknown) =>
          ((onfulfilled: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(onfulfilled)) as never;

        if (table === "shop_memberships") chain.then = resolve([{ user_id: "staff-1", role: "staff" }]);
        else if (table === "user_profiles") {
          chain.then = resolve([{ user_id: "staff-1", name: "Ana", email: "ana@test.com" }]);
        } else if (table === "staff_compensation_rules") {
          chain.then = resolve({ id: "rule-1", percentage_rate: 40, fixed_amount: 0, overrides_enabled: false });
        } else if (table === "appointments") {
          chain.then = resolve(opts.appointments ?? []);
        } else if (table === "staff_liquidations") {
          if (calls[table] === 1) {
            chain.then = resolve(opts.existing);
            chain.neq = vi.fn(() => chain);
          } else {
            chain.insert = vi.fn((payload: Record<string, unknown>) => {
              liqInserts.push(payload);
              return chain;
            });
            chain.then = resolve({ id: "liq-nueva" });
          }
        } else if (table === "staff_liquidation_items") {
          chain.delete = vi.fn(() => chain);
        }
        return chain;
      }),
    };

    return { client: client as never, liqInserts };
  }

  const formData = () => {
    const fd = new FormData();
    fd.set("staff_user_id", "staff-1");
    fd.set("period_start", "2030-06-01");
    fd.set("period_end", "2030-06-30");
    return fd;
  };

  const oneAppointment = [
    {
      id: "apt-1",
      service_id: "srv-1",
      start_time: "2030-06-15T10:00:00",
      service_price: 10000,
      services: { price: 10000, name: "Corte" },
    },
  ];

  it("inserta cuando no hay liquidacion para ese profesional y periodo", async () => {
    const { client, liqInserts } = makeMock({ existing: null, appointments: oneAppointment });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(client);

    const result = await createStaffPreLiquidation(formData(), "shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.liquidationId).toBe("liq-nueva");
    expect(result.data.alreadyPaid).toBeFalsy();
    // 40% de $10.000
    expect(result.data.commissionAmount).toBe(4000);
    expect(result.data.finalPayable).toBe(4000);
    expect(result.data.itemsCount).toBe(1);
    expect(liqInserts).toHaveLength(1);
    expect(liqInserts[0]).toMatchObject({ staff_user_id: "staff-1", status: "draft", final_payable: 4000 });
  });

  it("actualiza la existente en vez de chocar con el indice unico", async () => {
    const { client, liqInserts } = makeMock({
      existing: { id: "liq-vieja", status: "draft" },
      appointments: oneAppointment,
    });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(client);

    const result = await createStaffPreLiquidation(formData(), "shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Reusa el id: el indice unico (shop, profesional, periodo) no se toca.
    expect(result.data.liquidationId).toBe("liq-vieja");
    expect(liqInserts).toHaveLength(0);
  });

  it("no toca una liquidacion ya pagada y avisa con alreadyPaid", async () => {
    const { client, liqInserts } = makeMock({
      existing: { id: "liq-paga", status: "paid" },
      appointments: oneAppointment,
    });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(client);

    const result = await createStaffPreLiquidation(formData(), "shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.alreadyPaid).toBe(true);
    expect(result.data.liquidationId).toBe("liq-paga");
    expect(liqInserts).toHaveLength(0);
  });

  it("busca la regla que estaba vigente EN EL PERIODO, no la de hoy", async () => {
    // El bug: la regla se buscaba con `is_active = true AND ends_on IS NULL`,
    // o sea la vigente ahora. Subir a alguien de 40% a 50% el 15 de octubre
    // re-preciaba setiembre, que ya estaba liquidado. El modelo tiene
    // starts_on/ends_on justamente para esto.
    const filtros: Record<string, unknown>[] = [];
    let insercionHecha = false;
    const client = {
      from: vi.fn((table: string) => {
        const chain = chainableQuery();
        chain.eq = vi.fn(() => chain);
        chain.lte = vi.fn((campo: string, valor: unknown) => {
          filtros.push({ tipo: "lte", campo, valor });
          return chain;
        });
        chain.or = vi.fn((valor: unknown) => {
          filtros.push({ tipo: "or", valor });
          return chain;
        });
        chain.order = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(() => chain);
        chain.select = vi.fn(() => chain);
        chain.single = vi.fn(() => chain);

        const resolve = (data: unknown) =>
          ((onfulfilled: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(onfulfilled)) as never;
        if (table === "shop_memberships") {
          chain.then = resolve([{ user_id: "staff-1", role: "staff" }]);
        } else if (table === "user_profiles") {
          chain.then = resolve([{ user_id: "staff-1", name: "Ana" }]);
        } else if (table === "staff_compensation_rules") {
          chain.then = resolve({ id: "rule-septiembre", percentage_rate: 30, fixed_amount: 0, overrides_enabled: false });
        } else if (table === "appointments") {
          chain.then = resolve([]);
        } else if (table === "staff_liquidations") {
          // La primera llamada es el select de la existente (null), la segunda
          // el insert. Un unico `then` para las dos.
          chain.then = ((onfulfilled: (v: unknown) => unknown) =>
            Promise.resolve({ data: insercionHecha ? { id: "liq-nueva" } : null, error: null }).then(onfulfilled)) as never;
          chain.insert = vi.fn(() => {
            insercionHecha = true;
            return chain;
          });
        }
        return chain;
      }),
    };
    vi.mocked(mockCreateServiceRole).mockResolvedValue(client as never);

    const result = await createStaffPreLiquidation(formData(), "shop-123");
    expect(result.success).toBe(true);

    // La ventana del periodo, no "la de hoy".
    expect(filtros).toContainEqual({ tipo: "lte", campo: "starts_on", valor: "2030-06-30" });
    expect(filtros).toContainEqual({
      tipo: "or",
      valor: "ends_on.is.null,ends_on.gte.2030-06-01",
    });
  });

  it("se corta en seco si el profesional tiene mas turnos que el limite", async () => {
    // Un bruto parcial es peor que no liquidar: el monto a pagar no seria el que
    // dice. El calculo tiene que fallar, no devolver un numero mas bajo.
    const client = {
      from: vi.fn((table: string) => {
        const chain = chainableQuery();
        const resolve = (data: unknown, count?: number) =>
          ((onfulfilled: (v: unknown) => unknown) => Promise.resolve({ data, count, error: null }).then(onfulfilled)) as never;
        if (table === "shop_memberships") chain.then = resolve([{ user_id: "staff-1", role: "staff" }]);
        else if (table === "user_profiles") chain.then = resolve([{ user_id: "staff-1", name: "Ana", email: "ana@test.com" }]);
        else if (table === "staff_compensation_rules") chain.then = resolve({ id: "r", percentage_rate: 40, fixed_amount: 0, overrides_enabled: false });
        else if (table === "appointments") chain.then = resolve([], 9999);
        return chain;
      }),
    };
    vi.mocked(mockCreateServiceRole).mockResolvedValue(client as never);

    const result = await createStaffPreLiquidation(formData(), "shop-123");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/no se puede liquidar con el rango tan largo/i);
  });

  it("si el insert choca con el indice unico cae al update en vez de fallar", async () => {
    // Dos "Calcular" del mismo profesional y periodo a la vez: los dos leen
    // "no existe" y los dos insertan. El que pierde recibe 23505 y en vez de
    // mostrar un error crudo de Postgres actualiza la fila del otro.
    const calls: Record<string, number> = {};
    let updatePayload: Record<string, unknown> | null = null;
    const client = {
      from: vi.fn((table: string) => {
        calls[table] = (calls[table] ?? 0) + 1;
        const chain = chainableQuery();
        const resolve = (data: unknown) =>
          ((onfulfilled: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(onfulfilled)) as never;
        if (table === "shop_memberships") chain.then = resolve([{ user_id: "staff-1", role: "staff" }]);
        else if (table === "user_profiles") chain.then = resolve([{ user_id: "staff-1", name: "Ana", email: "ana@test.com" }]);
        else if (table === "staff_compensation_rules") chain.then = resolve({ id: "r", percentage_rate: 40, fixed_amount: 0, overrides_enabled: false });
        else if (table === "appointments") chain.then = resolve(oneAppointment);
        else if (table === "staff_liquidations") {
          if (calls[table] === 1) {
            // La busqueda inicial: no existe todavia.
            chain.then = resolve(null);
            chain.neq = vi.fn(() => chain);
          } else if (calls[table] === 2) {
            // El insert que se come el indice unico.
            chain.insert = vi.fn(() => chain);
            chain.select = vi.fn(() => chain);
            chain.single = vi.fn().mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
          } else if (calls[table] === 3) {
            // La fila que gano la carrera.
            chain.then = resolve({ id: "liq-ganadora" });
            chain.neq = vi.fn(() => chain);
          } else {
            chain.update = vi.fn((payload: Record<string, unknown>) => {
              updatePayload = payload;
              return chain;
            });
            chain.eq = vi.fn(() => chain);
          }
        }
        return chain;
      }),
    };
    vi.mocked(mockCreateServiceRole).mockResolvedValue(client as never);

    const result = await createStaffPreLiquidation(formData(), "shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.liquidationId).toBe("liq-ganadora");
    expect(updatePayload).toMatchObject({ final_payable: 4000 });
  });
});

// ---------------------------------------------------------------------------
// fetchStaffLiquidationsHistory
// ---------------------------------------------------------------------------
describe("fetchStaffLiquidationsHistory", () => {
  it("trae las liquidaciones de cualquier periodo", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        const chain = chainableQuery();
        if (table === "staff_liquidations") {
          chain.then = ((f: (v: unknown) => unknown) =>
            Promise.resolve({
              data: [
                {
                  id: "liq-1",
                  staff_user_id: "staff-1",
                  period_start: "2030-05-01",
                  period_end: "2030-05-31",
                  status: "paid",
                  gross_revenue: 100000,
                  commission_amount: 40000,
                  final_payable: 40000,
                  paid_amount: 40000,
                  paid_at: "2030-06-01T10:00:00",
                  created_at: "2030-05-31T22:00:00",
                },
              ],
              error: null,
            }).then(f)) as never;
        }
        if (table === "shop_memberships") {
          chain.then = ((f: (v: unknown) => unknown) =>
            Promise.resolve({ data: [{ user_id: "staff-1", role: "staff" }], error: null }).then(f)) as never;
        }
        if (table === "user_profiles") {
          chain.then = ((f: (v: unknown) => unknown) =>
            Promise.resolve({ data: [{ user_id: "staff-1", name: "Ana", email: "ana@test.com" }], error: null }).then(f)) as never;
        }
        return chain;
      }),
    } as never);

    const result = await fetchStaffLiquidationsHistory("shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "liq-1", staffName: "Ana", grossRevenue: 100000, commissionAmount: 40000 });
  });

  it("no le muestra liquidaciones a un empleado", async () => {
    vi.mocked(mockGetCurrentUserRole).mockResolvedValue({ success: true, data: { role: "staff", userId: "staff-1" } });
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery()),
    } as never);

    const result = await fetchStaffLiquidationsHistory("shop-123");
    expect(result).toEqual({ success: true, data: [] });
  });
});

// ---------------------------------------------------------------------------
// fetchStaffLiquidations
// ---------------------------------------------------------------------------
describe("fetchStaffLiquidations", () => {
  it("returns list of liquidations", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [
          { id: "liq-1", staff_user_id: "staff-1", period_start: "2030-06-01", period_end: "2030-06-15", status: "draft", final_payable: 3000, paid_amount: 0, created_at: "2030-06-15T10:00:00" },
        ], error: null }),
      })),
    } as never);

    const result = await fetchStaffLiquidations("2030-06-01", "2030-06-30", "shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe("liq-1");
  });
});

// ---------------------------------------------------------------------------
// fetchCashMovements
// ---------------------------------------------------------------------------
describe("fetchCashMovements", () => {
  it("returns list of cash movements", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [
          { id: "cm-1", movement_type: "income", payment_method: "cash", amount: 500, category: "Venta", description: null, happened_at: "2030-06-15T12:00:00" },
        ], count: 1, error: null }),
      })),
    } as never);

    const result = await fetchCashMovements("2030-06-15", "2030-06-15", "shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.rows).toHaveLength(1);
    expect(result.data.rows[0].movementType).toBe("income");
    expect(result.data.totalCount).toBe(1);
    expect(result.data.truncated).toBe(false);
  });

  it("avisa que la lista esta recortada cuando hay mas movimientos que los que trae", async () => {
    // `count` cuenta los que pasan los filtros ignorando el `limit`. Si supera
    // lo que volvio, el listado es una parte del periodo y el contador de la UI
    // tiene que decir el total, no el limite.
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [
          { id: "cm-1", movement_type: "income", payment_method: "cash", amount: 500, category: "Venta", description: null, happened_at: "2030-06-15T12:00:00" },
        ], count: 80, error: null }),
      })),
    } as never);

    const result = await fetchCashMovements("2030-06-15", "2030-06-15", "shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.totalCount).toBe(80);
    expect(result.data.truncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchCashSessionsHistory
// ---------------------------------------------------------------------------
describe("fetchCashSessionsHistory", () => {
  it("returns list of closed sessions", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [
          { id: "cs-1", status: "closed", opened_at: "2030-06-15T08:00:00", opening_amount: 1000, expected_amount: 5000, counted_amount: 4800, difference_amount: -200 },
        ], error: null }),
      })),
    } as never);

    const result = await fetchCashSessionsHistory("2030-06-15", "2030-06-15", "shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe("closed");
  });

  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await fetchCashSessionsHistory();
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});
