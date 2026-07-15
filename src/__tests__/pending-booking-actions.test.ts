import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPendingBankTransfers,
  confirmBankTransferBooking,
  rejectBankTransferBooking,
} from "@/lib/dashboard/appointments/pending-booking-actions";
import { createServiceRoleClient as mockCreateServiceRole } from "@/lib/dashboard/auth/server";
import { mockQueryResult, supabaseStub } from "@/__tests__/setup";

let stub: ReturnType<typeof supabaseStub>;

beforeEach(() => {
  vi.clearAllMocks();
  stub = supabaseStub();
  vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);
});

// ---------------------------------------------------------------------------
// getPendingBankTransfers
// ---------------------------------------------------------------------------
describe("getPendingBankTransfers", () => {
  it("returns empty array when no pending transfers", async () => {
    stub.from.mockReturnValue(mockQueryResult([]));

    const result = await getPendingBankTransfers("shop-123");
    expect(result).toEqual({ success: true, data: [] });
  });

  it("returns typed pending transfers", async () => {
    const bookings = [
      {
        id: "bk-1",
        customer_name: "Juan",
        customer_phone: "+5491112345678",
        service_id: "svc-1",
        start_time: "2030-06-15T10:00:00Z",
        end_time: "2030-06-15T11:00:00Z",
        payment_amount: 3000,
        expires_at: "2030-06-15T22:00:00Z",
        created_at: "2030-06-15T09:00:00Z",
      },
    ];

    const services = [{ id: "svc-1", name: "Corte" }];

    stub.from.mockImplementation((table: string) => {
      if (table === "pending_bookings") return mockQueryResult(bookings);
      if (table === "services") return mockQueryResult(services);
      return mockQueryResult([]);
    });

    const result = await getPendingBankTransfers("shop-123");
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0]).toEqual({
      id: "bk-1",
      customerName: "Juan",
      customerPhone: "+5491112345678",
      serviceName: "Corte",
      startTime: "2030-06-15T10:00:00Z",
      endTime: "2030-06-15T11:00:00Z",
      paymentAmount: 3000,
      expiresAt: "2030-06-15T22:00:00Z",
      createdAt: "2030-06-15T09:00:00Z",
    });
  });

  it("handles service lookup failure gracefully", async () => {
    const bookings = [
      {
        id: "bk-1",
        customer_name: "Ana",
        customer_phone: "+5491199999999",
        service_id: "svc-missing",
        start_time: "2030-06-15T10:00:00Z",
        end_time: "2030-06-15T11:00:00Z",
        payment_amount: 2500,
        expires_at: "2030-06-15T22:00:00Z",
        created_at: "2030-06-15T09:00:00Z",
      },
    ];

    stub.from.mockImplementation((table: string) => {
      if (table === "pending_bookings") return mockQueryResult(bookings);
      if (table === "services") return mockQueryResult([]);
      return mockQueryResult([]);
    });

    const result = await getPendingBankTransfers("shop-123");
    expect(result.success).toBe(true);
    expect(result.data![0].serviceName).toBe("Servicio");
  });

  it("returns error on DB failure", async () => {
    stub.from.mockReturnValue(mockQueryResult(null, { message: "db down" }));

    const result = await getPendingBankTransfers("shop-123");
    expect(result).toEqual({ success: false, error: "db down" });
  });
});

// ---------------------------------------------------------------------------
// confirmBankTransferBooking
// ---------------------------------------------------------------------------
describe("confirmBankTransferBooking", () => {
  const booking = {
    id: "bk-1",
    shop_id: "shop-123",
    status: "pending",
    customer_phone: "+5491112345678",
    customer_email: "juan@test.com",
    customer_name: "Juan",
    service_id: "svc-1",
    start_time: "2030-06-15T10:00:00Z",
    end_time: "2030-06-15T11:00:00Z",
    staff_id: "staff-1",
    deposit_amount: null,
    payment_amount: 3000,
    expires_at: "2030-06-15T22:00:00Z",
  };

  function setupStubs(options: { bookingData?: typeof booking | null; statusOverride?: string } = {}) {
    const bookingData = options.bookingData !== undefined ? options.bookingData : booking;

    stub.from.mockImplementation((table: string) => {
      if (table === "pending_bookings") {
        if (options.statusOverride === "not_found") {
          return mockQueryResult(null);
        }
        return mockQueryResult(bookingData ? { ...bookingData, status: options.statusOverride || bookingData.status } : null);
      }
      if (table === "services") return mockQueryResult({ name: "Corte", price: 3000 });
      if (table === "appointments") {
        // First call: conflict check returns no conflict. Second call: insert succeeds.
        return mockQueryResult(null);
      }
      if (table === "customers") return mockQueryResult({ id: "cust-1" });
      if (table === "shops") return mockQueryResult({ nombre: "Test Shop" });
      if (table === "shop_billing_events") return mockQueryResult(null);
      return mockQueryResult(null);
    });
  }

  it("returns error when booking not found", async () => {
    setupStubs({ statusOverride: "not_found" });

    const result = await confirmBankTransferBooking("bk-missing", "shop-123");
    expect(result).toEqual({ success: false, error: "La reserva ya no esta pendiente" });
  });

  it("returns error when booking already completed", async () => {
    setupStubs({ statusOverride: "completed" });

    const result = await confirmBankTransferBooking("bk-1", "shop-123");
    expect(result).toEqual({ success: false, error: "La reserva ya no esta pendiente" });
  });

  it("returns error when booking expired", async () => {
    stub.from.mockImplementation((table: string) => {
      if (table === "pending_bookings") {
        return mockQueryResult({ ...booking, expires_at: "2020-01-01T00:00:00Z" });
      }
      return mockQueryResult(null);
    });

    const result = await confirmBankTransferBooking("bk-1", "shop-123");
    expect(result).toEqual({ success: false, error: "La reserva expiro" });
  });

  it("creates appointment on successful confirmation", async () => {
    setupStubs();

    const result = await confirmBankTransferBooking("bk-1", "shop-123");
    expect(result).toEqual({ success: true });

    const fromCalls = stub.from.mock.calls.map((c) => c[0]);
    expect(fromCalls).toContain("appointments");
    expect(fromCalls).toContain("shop_billing_events");
  });

  it("creates new customer when none exists", async () => {
    let customersCallCount = 0;
    stub.from.mockImplementation((table: string) => {
      if (table === "pending_bookings") return mockQueryResult(booking);
      if (table === "services") return mockQueryResult({ name: "Corte", price: 3000 });
      if (table === "appointments") return mockQueryResult(null);
      if (table === "customers") {
        customersCallCount++;
        if (customersCallCount === 1) return mockQueryResult(null);
        return mockQueryResult({ id: "cust-new" });
      }
      if (table === "shops") return mockQueryResult({ nombre: "Test Shop" });
      if (table === "shop_billing_events") return mockQueryResult(null);
      return mockQueryResult(null);
    });

    const result = await confirmBankTransferBooking("bk-1", "shop-123");
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// rejectBankTransferBooking
// ---------------------------------------------------------------------------
describe("rejectBankTransferBooking", () => {
  it("deletes the pending booking", async () => {
    stub.from.mockReturnValue(mockQueryResult(null));

    const result = await rejectBankTransferBooking("bk-1", "shop-123");
    expect(result).toEqual({ success: true });
    expect(stub.from).toHaveBeenCalledWith("pending_bookings");
  });

  it("returns error on DB failure", async () => {
    stub.from.mockReturnValue(mockQueryResult(null, { message: "delete failed" }));

    const result = await rejectBankTransferBooking("bk-1", "shop-123");
    expect(result).toEqual({ success: false, error: "Error al rechazar transferencia" });
  });
});
