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
    expect(result.data).toEqual([]);
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
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
    } as never);

    const result = await markStaffLiquidationPaid("liq-1", 5000);
    expect(result).toEqual({ success: true });
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await markStaffLiquidationPaid("liq-1", 5000);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
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
        ], error: null }),
      })),
    } as never);

    const result = await fetchCashMovements("2030-06-15", "2030-06-15", "shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].movementType).toBe("income");
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
