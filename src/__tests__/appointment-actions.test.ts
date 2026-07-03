import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createAppointment,
  createCustomerAndAppointment,
  updateAppointmentStatus,
  redeemLoyaltyReward,
  deleteAppointment,
} from "@/lib/dashboard/appointment-actions";
import { fetchAppointments } from "@/lib/dashboard/appointment-queries";
import { createServerClient as mockCreateServerClient } from "@/lib/supabase/server";
import { canAccessShopId as mockCanAccessShopId, createServiceRoleClient as mockCreateServiceRole, requireShopId as mockRequireShopId } from "@/lib/dashboard/auth-server";
import { sendEmailWithResend as mockSendEmail } from "@/lib/email/resend";
import { supabaseStub, chainableQuery } from "@/__tests__/setup";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockRequireShopId).mockResolvedValue({ success: true, data: "shop-123" });
  vi.mocked(mockCanAccessShopId).mockResolvedValue(true);
  vi.mocked(mockSendEmail).mockResolvedValue({ success: true } as never);
  vi.mocked(mockCreateServerClient).mockResolvedValue(supabaseStub());
  vi.mocked(mockCreateServiceRole).mockResolvedValue(supabaseStub());
});

function createFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("customer_id", overrides.customer_id ?? "cust-1");
  fd.set("staff_id", overrides.staff_id ?? "staff-1");
  fd.set("service_id", overrides.service_id ?? "svc-1");
  fd.set("start_date", overrides.start_date ?? "2030-06-15");
  fd.set("start_time", overrides.start_time ?? "10:00");
  fd.set("notes", overrides.notes ?? "");
  fd.set("deposit_amount", overrides.deposit_amount ?? "");
  fd.set("recurring_frequency", overrides.recurring_frequency ?? "none");
  fd.set("recurring_until", overrides.recurring_until ?? "");
  return fd;
}

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------
describe("createAppointment — validation", () => {
  it("returns error when shopId is empty", async () => {
    const fd = createFormData();
    const result = await createAppointment(fd, "");
    expect(result).toEqual({ success: false, error: "LOCAL_INVALIDO" });
  });

  it("returns error when customer_id is missing", async () => {
    const fd = createFormData({ customer_id: "" });
    const result = await createAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "Faltan campos obligatorios: cliente" });
  });

  it("returns error when service_id is missing", async () => {
    const fd = createFormData({ service_id: "" });
    const result = await createAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "Faltan campos obligatorios: servicio" });
  });

  it("returns error when start_date is missing", async () => {
    const fd = createFormData({ start_date: "" });
    const result = await createAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "Faltan campos obligatorios: fecha" });
  });

  it("returns error when start_time is missing", async () => {
    const fd = createFormData({ start_time: "" });
    const result = await createAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "Faltan campos obligatorios: hora" });
  });

  it("returns error for negative deposit amount", async () => {
    const fd = createFormData({ deposit_amount: "-100" });
    const result = await createAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "La seña debe ser un monto válido" });
  });

  it("returns error for NaN deposit amount", async () => {
    const fd = createFormData({ deposit_amount: "abc" });
    const result = await createAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "La seña debe ser un monto válido" });
  });
});

// ---------------------------------------------------------------------------
// createAppointment — auth & conflict detection
// ---------------------------------------------------------------------------
describe("createAppointment — auth & conflict", () => {
  it("returns SESION_EXPIRADA when no user", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    const fd = createFormData();
    const result = await createAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("returns SIN_ACCESO_LOCAL when user lacks access", async () => {
    vi.mocked(mockCanAccessShopId).mockResolvedValue(false);
    vi.mocked(mockCreateServerClient).mockResolvedValue(supabaseStub());

    const fd = createFormData();
    const result = await createAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
  });

  it("returns Servicio no encontrado when service does not exist", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn((table: string) => {
        if (table === "services") return chainableQuery({ single: vi.fn().mockResolvedValue({ data: null, error: null }) });
        return chainableQuery({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
      }),
    } as never);

    const fd = createFormData();
    const result = await createAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "Uno o más servicios no encontrados" });
  });

  it("creates appointment successfully without staff assigned", async () => {
    let insertCalled = false;
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn((table: string) => {
        if (table === "services") {
          const svcChain = chainableQuery();
          svcChain.then = (onfulfilled?: ((value: SupabaseResult) => unknown) | null) =>
            Promise.resolve({ data: [{ id: "svc-1", duration_minutes: 45, price: 1000, name: "Corte" }], error: null }).then(onfulfilled);
          return svcChain;
        }
        if (table === "appointments") return chainableQuery({
          insert: vi.fn((rows: unknown[]) => {
            insertCalled = true;
            return chainableQuery();
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        });
        if (table === "customers") return chainableQuery({ maybeSingle: vi.fn().mockResolvedValue({ data: { nombre: "Test", email: "test@test.com" }, error: null }) });
        return chainableQuery({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
      }),
    } as never);

    vi.mocked(mockCreateServiceRole).mockResolvedValue(supabaseStub());

    const fd = createFormData({ staff_id: "" });
    const result = await createAppointment(fd, "shop-123");
    expect(result).toEqual({ success: true });
    expect(insertCalled).toBe(true);
  });

  it("detects slot conflict when staff is occupied", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn((table: string) => {
        if (table === "services") {
          const svcChain = chainableQuery();
          svcChain.then = (onfulfilled?: ((value: SupabaseResult) => unknown) | null) =>
            Promise.resolve({ data: [{ id: "svc-1", duration_minutes: 45, price: 1000, name: "Corte" }], error: null }).then(onfulfilled);
          return svcChain;
        }
        if (table === "appointments") {
          const aptChain = chainableQuery({
            insert: vi.fn(() => chainableQuery()),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "conflicting-apt" }, error: null }),
          });
          // The conflict query uses .limit(1), not .maybeSingle(), so override then
          aptChain.then = (onfulfilled) =>
            Promise.resolve({ data: [{ id: "conflicting-apt" }], error: null }).then(onfulfilled);
          return aptChain;
        }
        return chainableQuery({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
      }),
    } as never);

    vi.mocked(mockCreateServiceRole).mockResolvedValue(supabaseStub());

    const fd = createFormData();
    const result = await createAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "slot_taken" });
  });
});

// ---------------------------------------------------------------------------
// updateAppointmentStatus tests
// ---------------------------------------------------------------------------
describe("updateAppointmentStatus", () => {
  it("returns error when shopId is empty", async () => {
    const result = await updateAppointmentStatus("apt-1", "confirmed", undefined, "");
    expect(result).toEqual({ success: false, error: "LOCAL_INVALIDO" });
  });

  it("returns SESION_EXPIRADA when no user", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    const result = await updateAppointmentStatus("apt-1", "confirmed", undefined, "shop-123");
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("marks is_paid true when status is completed and isPaid not specified", async () => {
    let updatedFields: Record<string, unknown> | undefined;
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn((table: string) => {
        if (table === "appointments") {
          return chainableQuery({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "apt-1", status: "confirmed", customer_id: "cust-1" },
              error: null,
            }),
            update: vi.fn((updates: Record<string, unknown>) => {
              updatedFields = updates;
              return chainableQuery();
            }),
          });
        }
        return chainableQuery({ single: vi.fn().mockResolvedValue({ data: null, error: null }) });
      }),
    } as never);

    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        maybeSingle: vi.fn().mockResolvedValue({ data: { loyalty_enabled: false, loyalty_cuts_required: 5 }, error: null }),
      })),
    } as never);

    const result = await updateAppointmentStatus("apt-1", "completed", undefined, "shop-123");
    expect(result).toEqual({ success: true });
    expect(updatedFields?.is_paid).toBe(true);
  });

  it("returns error for invalid deposit amount", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn(() => chainableQuery({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: "apt-1", status: "scheduled", customer_id: "cust-1" },
          error: null,
        }),
      })),
    } as never);

    const result = await updateAppointmentStatus("apt-1", "scheduled", undefined, "shop-123", -100);
    expect(result).toEqual({ success: false, error: "La seña debe ser un monto válido" });
  });
});

// ---------------------------------------------------------------------------
// redeemLoyaltyReward tests
// ---------------------------------------------------------------------------
describe("redeemLoyaltyReward", () => {
  it("returns error when appointment has no customer", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue(supabaseStub());
    // Override the first maybeSingle() call to return an appointment without customer
    const svcRoleStub = supabaseStub();
    svcRoleStub.from = vi.fn(() => chainableQuery({
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "apt-1", customer_id: null }, error: null }),
    }));
    vi.mocked(mockCreateServiceRole).mockResolvedValue(svcRoleStub as never);

    const result = await redeemLoyaltyReward("apt-1");
    expect(result).toEqual({ success: false, error: "El turno no tiene cliente asignado" });
  });

  it("returns error when reward already applied", async () => {
    const svcRoleStub = supabaseStub();
    svcRoleStub.from = vi.fn(() => chainableQuery({
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "apt-1", customer_id: "cust-1", service_id: "svc-1", is_paid: false, loyalty_reward_applied: true }, error: null }),
    }));
    vi.mocked(mockCreateServiceRole).mockResolvedValue(svcRoleStub as never);

    const result = await redeemLoyaltyReward("apt-1");
    expect(result).toEqual({ success: false, error: "Este turno ya tiene un canje aplicado" });
  });

  it("returns error when customer has no rewards available", async () => {
    let callCount = 0;
    const svcRoleStub = supabaseStub();
    svcRoleStub.from = vi.fn(() => chainableQuery({
      maybeSingle: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: { id: "apt-1", customer_id: "cust-1", service_id: "svc-1", is_paid: false, loyalty_reward_applied: false }, error: null });
        if (callCount === 2) return Promise.resolve({ data: { loyalty_enabled: true, loyalty_discount_percent: 50 }, error: null });
        return Promise.resolve({ data: null, error: null });
      }),
    }));
    svcRoleStub.rpc = vi.fn().mockResolvedValue({ data: { success: false }, error: null });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(svcRoleStub as never);

    const result = await redeemLoyaltyReward("apt-1");
    expect(result).toEqual({ success: false, error: "El cliente no tiene canjes disponibles" });
  });

  it("marks is_paid true when discount is 100%", async () => {
    let callCount = 0;
    const svcRoleStub = supabaseStub();
    svcRoleStub.from = vi.fn(() => chainableQuery({
      maybeSingle: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: { id: "apt-1", customer_id: "cust-1", service_id: "svc-1", is_paid: false, loyalty_reward_applied: false }, error: null });
        if (callCount === 2) return Promise.resolve({ data: { loyalty_enabled: true, loyalty_discount_percent: 100 }, error: null });
        return Promise.resolve({ data: null, error: null });
      }),
      update: vi.fn(() => chainableQuery()),
    }));
    svcRoleStub.rpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(svcRoleStub as never);

    const result = await redeemLoyaltyReward("apt-1");
    expect(result).toEqual({ success: true, data: { discountPercent: 100 } });
  });
});

// ---------------------------------------------------------------------------
// deleteAppointment tests
// ---------------------------------------------------------------------------
describe("deleteAppointment", () => {
  it("returns success when appointment is deleted", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn(() => chainableQuery({ delete: vi.fn().mockReturnThis() })),
    } as never);

    const result = await deleteAppointment("apt-1");
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// createCustomerAndAppointment validation
// ---------------------------------------------------------------------------
describe("createCustomerAndAppointment — validation", () => {
  it("returns error when customer_name missing", async () => {
    const fd = createFormData({ customer_id: "x" });
    const result = await createCustomerAndAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "Faltan campos obligatorios: nombre del cliente" });
  });

  it("returns error when services are not found (email is optional)", async () => {
    const fd = new FormData();
    fd.set("customer_name", "Juan");
    fd.set("customer_email", "");
    fd.set("service_id", "svc-1");
    fd.set("start_date", "2030-06-15");
    fd.set("start_time", "10:00");
    const result = await createCustomerAndAppointment(fd, "shop-123");
    expect(result).toEqual({ success: false, error: "Uno o más servicios no encontrados" });
  });
});

// ---------------------------------------------------------------------------
// fetchAppointments error handling
// ---------------------------------------------------------------------------
describe("fetchAppointments", () => {
  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await fetchAppointments("2024-01-01", "2024-01-31");
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});
