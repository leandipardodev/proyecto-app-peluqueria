import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCustomersOverview } from "@/lib/dashboard/customers-actions";
import { requireShopId as mockRequireShopId, createServiceRoleClient as mockCreateServiceRole } from "@/lib/dashboard/auth-server";
import { chainableQuery } from "@/__tests__/setup";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockRequireShopId).mockResolvedValue({ success: true, data: "shop-123" });
});

function makeAdminMock(customers: unknown[], appointments: unknown[]) {
  const customerChain = chainableQuery();
  customerChain.then = (onfulfilled: any) =>
    Promise.resolve({ data: customers, error: null }).then(onfulfilled);

  const apptChain = chainableQuery();
  apptChain.then = (onfulfilled: any) =>
    Promise.resolve({ data: appointments, error: null }).then(onfulfilled);

  return {
    from: vi.fn((table: string) => {
      if (table === "customers") return customerChain;
      if (table === "appointments") return apptChain;
      return chainableQuery();
    }),
    auth: { getUser: vi.fn() },
  } as never;
}

// ---------------------------------------------------------------------------
// fetchCustomersOverview
// ---------------------------------------------------------------------------
describe("fetchCustomersOverview", () => {
  it("returns sorted customers with computed loyalty", async () => {
    const customers = [
      { id: "c1", nombre: "Pedro", email: "pedro@test.com", telefono: "111", birthday: null, observations: null },
      { id: "c2", nombre: "Ana", email: "ana@test.com", telefono: "222", birthday: "1990-05-10", observations: "Cliente frecuente" },
    ];
    const appointments = [
      // Ana has 15 completed appointments → VIP
      ...Array.from({ length: 15 }, (_, i) => ({
        customer_id: "c2",
        start_time: `2030-0${(i % 9) + 1}-15T10:00:00`,
        status: "completed",
        services: { name: "Corte", price: 1500 },
      })),
      // Pedro has 3 appointments → Nuevo
      ...Array.from({ length: 3 }, (_, i) => ({
        customer_id: "c1",
        start_time: `2030-0${(i % 9) + 1}-20T10:00:00`,
        status: "completed",
        services: { name: "Corte", price: 1500 },
      })),
    ];

    vi.mocked(mockCreateServiceRole).mockResolvedValue(makeAdminMock(customers, appointments));

    const result = await fetchCustomersOverview();
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Sorted by name: Ana, Pedro
    expect(result.data).toHaveLength(2);
    expect(result.data[0].nombre).toBe("Ana");
    expect(result.data[0].loyalty).toBe("VIP");
    expect(result.data[0].accumulatedSpend).toBeGreaterThanOrEqual(1500 * 15);

    expect(result.data[1].nombre).toBe("Pedro");
    expect(result.data[1].loyalty).toBe("Nuevo");
    expect(result.data[1].accumulatedSpend).toBe(1500 * 3);
  });

  it("returns Recurrente for 4-11 visits", async () => {
    const customers = [{ id: "c1", nombre: "Juan" }];
    const appointments = Array.from({ length: 6 }, (_, i) => ({
      customer_id: "c1",
      start_time: `2030-0${(i % 9) + 1}-15T10:00:00`,
      status: "completed",
      services: { name: "Corte", price: 1000 },
    }));

    vi.mocked(mockCreateServiceRole).mockResolvedValue(makeAdminMock(customers, appointments));

    const result = await fetchCustomersOverview();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].loyalty).toBe("Recurrente");
  });

  it("handles fallback field names for birthday and observations", async () => {
    const customers = [
      { id: "c1", nombre: "Test", birth_date: "1995-03-20", notes: "Nota desde notes", email: "" },
    ];
    vi.mocked(mockCreateServiceRole).mockResolvedValue(makeAdminMock(customers, []));

    const result = await fetchCustomersOverview();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].birthday).toBe("1995-03-20");
    expect(result.data[0].observations).toBe("Nota desde notes");
  });

  it("returns empty list when no customers", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue(makeAdminMock([], []));

    const result = await fetchCustomersOverview();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
  });

  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await fetchCustomersOverview();
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("returns error on customers query failure", async () => {
    const customerChain = chainableQuery();
    customerChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: null, error: { message: "DB error" } }).then(onfulfilled);

    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "customers") return customerChain;
        return chainableQuery();
      }),
    } as never);

    const result = await fetchCustomersOverview();
    expect(result).toEqual({ success: false, error: "DB error" });
  });
});
