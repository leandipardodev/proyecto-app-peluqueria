import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchVouchers,
  fetchTodayVoucherAlerts,
  fetchVoucherWhatsappTemplate,
  updateVoucherWhatsappTemplate,
  createVoucher,
  markVoucherReminderSent,
  markVoucherRedeemed,
  runVoucherReminderSweep,
} from "@/lib/dashboard/vouchers/voucher-actions";
import { getCachedUser as mockGetCachedUser, requireShopId as mockRequireShopId, canAccessShopId as mockCanAccessShop } from "@/lib/dashboard/auth/server";
import { createServerClient as mockCreateServerClient } from "@/lib/supabase/server";
import { revalidateDashboardSegments as mockRevalidate } from "@/lib/dashboard/shared/revalidate-dashboard";
import { DEFAULT_VOUCHER_WHATSAPP_TEMPLATE } from "@/lib/dashboard/vouchers/voucher-constants";
import { supabaseStub, chainableQuery } from "@/__tests__/setup";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockRequireShopId).mockResolvedValue({ success: true, data: "shop-123" });
  vi.mocked(mockGetCachedUser).mockResolvedValue({ id: "user-1" });
  vi.mocked(mockCanAccessShop).mockResolvedValue(true);
  vi.mocked(mockCreateServerClient).mockResolvedValue(supabaseStub());
});

// ---------------------------------------------------------------------------
// fetchVouchers
// ---------------------------------------------------------------------------
describe("fetchVouchers", () => {
  it("returns vouchers sorted by birthday", async () => {
    const vouchers = [
      { id: "v1", gifted_to_name: "Ana", gifted_to_birthday: "1990-03-15" },
      { id: "v2", gifted_to_name: "Bob", gifted_to_birthday: "1985-07-20" },
    ];

    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({ data: vouchers, error: null }).then(onfulfilled);
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await fetchVouchers("shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(2);
  });

  it("returns error on query failure", async () => {
    const chain = chainableQuery();
    chain.then = (onfulfilled: any, onrejected: any) =>
      Promise.resolve({ data: null, error: { message: "DB fail" } }).then(onfulfilled, onrejected);
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await fetchVouchers("shop-123");
    expect(result).toEqual({ success: false, error: "DB fail" });
  });

  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await fetchVouchers();
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// fetchTodayVoucherAlerts
// ---------------------------------------------------------------------------
describe("fetchTodayVoucherAlerts", () => {
  it("filters vouchers whose birthday matches today", async () => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const vouchers = [
      { id: "v1", gifted_to_name: "Ana", gifted_to_birthday: `1990-${mm}-${dd}`, service_name: "Corte", gifted_by_name: null, status: "pending" },
      { id: "v2", gifted_to_name: "Bob", gifted_to_birthday: "1990-01-01", service_name: "Tinte", gifted_by_name: "Juan", status: "pending" },
    ];

    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({ data: vouchers, error: null }).then(onfulfilled);
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await fetchTodayVoucherAlerts("shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].gifted_to_name).toBe("Ana");
  });

  it("returns empty when no birthdays today", async () => {
    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({ data: [{ id: "v1", gifted_to_birthday: "1990-01-01", gifted_to_name: "X", service_name: "Corte", gifted_by_name: null, status: "pending" }], error: null }).then(onfulfilled);
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await fetchTodayVoucherAlerts("shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchVoucherWhatsappTemplate
// ---------------------------------------------------------------------------
describe("fetchVoucherWhatsappTemplate", () => {
  it("returns template from DB", async () => {
    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({ data: { voucher_whatsapp_template: "Hola {{name}}!" }, error: null }).then(onfulfilled);
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await fetchVoucherWhatsappTemplate("shop-123");
    expect(result).toEqual({ success: true, data: "Hola {{name}}!" });
  });

  it("returns default template when DB returns null", async () => {
    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({ data: { voucher_whatsapp_template: null }, error: null }).then(onfulfilled);
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await fetchVoucherWhatsappTemplate("shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toBe(DEFAULT_VOUCHER_WHATSAPP_TEMPLATE);
  });
});

// ---------------------------------------------------------------------------
// updateVoucherWhatsappTemplate
// ---------------------------------------------------------------------------
describe("updateVoucherWhatsappTemplate", () => {
  it("updates and revalidates", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        update: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
      })),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await updateVoucherWhatsappTemplate("shop-123", "Nueva plantilla");
    expect(result).toEqual({ success: true });
    expect(mockRevalidate).toHaveBeenCalledWith("shop-123", ["/vouchers"]);
  });
});

// ---------------------------------------------------------------------------
// createVoucher
// ---------------------------------------------------------------------------
describe("createVoucher", () => {
  function makeForm(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("gifted_to_name", overrides.gifted_to_name ?? "Ana");
    fd.set("gifted_to_birthday", overrides.gifted_to_birthday ?? "1990-06-15");
    fd.set("service_name", overrides.service_name ?? "Corte");
    fd.set("gifted_to_phone", overrides.gifted_to_phone ?? "");
    fd.set("gifted_by_name", overrides.gifted_by_name ?? "");
    fd.set("voucher_message", overrides.voucher_message ?? "");
    return fd;
  }

  beforeEach(() => {
    vi.mocked(mockCanAccessShop).mockResolvedValue(true);
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn(() => chainableQuery({ insert: vi.fn().mockReturnThis() })),
    } as never);
  });

  it("returns error when shopId is empty", async () => {
    const result = await createVoucher(makeForm(), "");
    expect(result).toEqual({ success: false, error: "LOCAL_INVALIDO" });
  });

  it("returns error when not authenticated", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      from: vi.fn(),
    } as never);
    const result = await createVoucher(makeForm(), "shop-123");
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("returns error when access denied", async () => {
    vi.mocked(mockCanAccessShop).mockResolvedValue(false);
    const result = await createVoucher(makeForm(), "shop-123");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
  });

  it("returns error when name missing", async () => {
    const result = await createVoucher(makeForm({ gifted_to_name: "" }), "shop-123");
    expect(result).toEqual({ success: false, error: "Completá los campos obligatorios" });
  });

  it("returns error when birthday missing", async () => {
    const result = await createVoucher(makeForm({ gifted_to_birthday: "" }), "shop-123");
    expect(result).toEqual({ success: false, error: "Completá los campos obligatorios" });
  });

  it("returns error when service missing", async () => {
    const result = await createVoucher(makeForm({ service_name: "" }), "shop-123");
    expect(result).toEqual({ success: false, error: "Completá los campos obligatorios" });
  });

  it("creates voucher successfully", async () => {
    const result = await createVoucher(makeForm(), "shop-123");
    expect(result).toEqual({ success: true });
    expect(mockRevalidate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// markVoucherReminderSent / markVoucherRedeemed
// ---------------------------------------------------------------------------
describe("markVoucherReminderSent", () => {
  it("updates and revalidates", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
      auth: { getUser: vi.fn() },
    } as never);
    const result = await markVoucherReminderSent("v-1", "shop-123");
    expect(result).toEqual({ success: true });
    expect(mockRevalidate).toHaveBeenCalled();
  });
});

describe("markVoucherRedeemed", () => {
  it("updates and revalidates", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
      auth: { getUser: vi.fn() },
    } as never);
    const result = await markVoucherRedeemed("v-1", "shop-123");
    expect(result).toEqual({ success: true });
    expect(mockRevalidate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runVoucherReminderSweep
// ---------------------------------------------------------------------------
describe("runVoucherReminderSweep", () => {
  it("updates vouchers whose birthday matches today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T00:00:00.000Z"));

    const shopsChain = chainableQuery();
    shopsChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: [{ id: "shop-123" }], error: null }).then(onfulfilled);

    const selectChain = chainableQuery();
    selectChain.then = (onfulfilled: any) =>
      Promise.resolve({
        data: [
          { id: "v1", gifted_to_birthday: "1990-06-15", status: "pending" },
          { id: "v2", gifted_to_birthday: "1990-01-01", status: "pending" },
        ],
        error: null,
      }).then(onfulfilled);

    const updateChain = chainableQuery();
    updateChain.in = vi.fn().mockResolvedValue({ data: null, error: null });
    (updateChain as any).then = ((onfulfilled: any) =>
      Promise.resolve({ data: null, error: null }).then(onfulfilled));

    let callCount = 0;
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn((_table: string) => {
        callCount++;
        if (callCount === 1) return shopsChain;
        if (callCount === 2) return selectChain;
        return updateChain;
      }),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await runVoucherReminderSweep();
    vi.useRealTimers();
    expect(result).toEqual({ success: true, data: { updated: 1 } });
  });

  it("returns 0 when no vouchers due today", async () => {
    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({
        data: [{ id: "v1", gifted_to_birthday: "1990-01-01", status: "pending" }],
        error: null,
      }).then(onfulfilled);

    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await runVoucherReminderSweep();
    expect(result).toEqual({ success: true, data: { updated: 0 } });
  });

  it("returns zero when select fails", async () => {
    const shopsChain = chainableQuery();
    shopsChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: [{ id: "shop-123" }], error: null }).then(onfulfilled);

    const voucherChain = chainableQuery();
    voucherChain.then = (onfulfilled: any, onrejected: any) =>
      Promise.resolve({ data: null, error: { message: "DB error" } }).then(onfulfilled, onrejected);

    let callCount = 0;
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn((_table: string) => {
        callCount++;
        if (callCount === 1) return shopsChain;
        return voucherChain;
      }),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await runVoucherReminderSweep();
    expect(result).toEqual({ success: true, data: { updated: 0 } });
  });
});
