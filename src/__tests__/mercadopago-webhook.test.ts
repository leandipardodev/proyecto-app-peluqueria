import { describe, it, expect, vi, beforeAll } from "vitest";
import crypto from "crypto";
import { POST } from "@/app/api/payments/mercadopago-webhook/route";
import { createServiceRoleClient as mockCreateServiceRole } from "@/lib/dashboard/auth/server";
import { requireShopId as mockRequireShopId } from "@/lib/dashboard/auth/server";
import { supabaseStub, chainableQuery } from "@/__tests__/setup";

const { mockPaymentGet, mockRateCheck } = vi.hoisted(() => {
  process.env.MP_WEBHOOK_SECRET = "test-secret-123";
  process.env.MP_ACCESS_TOKEN = "test-mp-access-token";
  return {
    mockPaymentGet: vi.fn(),
    mockRateCheck: vi.fn(),
  };
});

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: vi.fn(),
  Payment: vi.fn(function () { return { get: mockPaymentGet }; }),
}));

vi.mock("@/lib/rate-limiter", () => ({
  createRateLimiter: vi.fn(() => ({ check: mockRateCheck })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/argentina-time", () => ({
  getArgentinaDateKey: vi.fn(() => "2026-06-02"),
}));

vi.mock("@/lib/email/booking-emails", () => ({
  sendAppointmentConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api-logger", () => ({
  createLogContext: vi.fn(() => ({ requestId: "test", method: "POST", path: "/test", startTime: 0 })),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/billing/plans", () => ({
  cycleMonths: vi.fn(() => 1),
}));

function validSignature(body: unknown): string {
  const ts = "1717286400";
  const rawBody = JSON.stringify(body);
  const secret = process.env.MP_WEBHOOK_SECRET || "";
  const hmac = crypto.createHmac("sha256", secret).update(`${rawBody}|${ts}`, "utf8").digest("hex");
  return `ts=${ts}&v1=${hmac}`;
}

function createNextRequest(body: unknown, opts?: { url?: string }): Request {
  const url = opts?.url ?? "http://localhost/api/payments/mercadopago-webhook";
  const bodyStr = JSON.stringify(body);
  const sig = validSignature(body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-signature": sig,
  };
  const req = new Request(url, { method: "POST", body: bodyStr, headers });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), writable: false });
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateCheck.mockResolvedValue({ allowed: true });
  mockPaymentGet.mockResolvedValue({
    status: "approved",
    external_reference: "",
    metadata: {},
    order: null,
  });
  vi.mocked(mockCreateServiceRole).mockResolvedValue(supabaseStub());
  vi.mocked(mockRequireShopId).mockResolvedValue({ success: true, data: "shop-123" });
});

describe("mercadopago-webhook POST — validation", () => {
  it("returns 429 when rate limited", async () => {
    mockRateCheck.mockResolvedValue({ allowed: false });
    const req = createNextRequest({ type: "payment", data: { id: "pay-1" } });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe("too_many_requests");
  });

  it("returns 400 for invalid JSON body", async () => {
    const url = "http://localhost/api/payments/mercadopago-webhook";
    const bodyStr = "not json";
    const req = new Request(url, { method: "POST", body: bodyStr, headers: { "content-type": "application/json" } });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when signature is missing", async () => {
    const url = "http://localhost/api/payments/mercadopago-webhook";
    const bodyStr = JSON.stringify({ type: "payment", data: { id: "pay-1" } });
    const req = new Request(url, { method: "POST", body: bodyStr, headers: { "content-type": "application/json" } });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns ok for non-payment type", async () => {
    const req = createNextRequest({ type: "merchant_order", data: { id: "ord-1" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns ok when payment has no id", async () => {
    const req = createNextRequest({ type: "payment", data: {} });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe("mercadopago-webhook POST — billing flow", () => {
  it("processes approved subscription payment", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "approved",
      external_reference: "shop_sub:shop-abc:monthly:sub_1",
      metadata: {},
      order: null,
    });

    let shopUpdated = false;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "shop_billing_events") return chainableQuery({ insert: vi.fn(() => chainableQuery()) });
        if (table === "shops") return chainableQuery({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "shop-abc", plan_expiry: null }, error: null }),
          update: vi.fn(() => { shopUpdated = true; return chainableQuery(); }),
        });
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest(
      { type: "payment", data: { id: "pay-123" } },
      { url: "http://localhost/api/payments/mercadopago-webhook?scope=billing" }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(shopUpdated).toBe(true);
  });

  it("skips shop update for non-approved subscription", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "rejected",
      external_reference: "shop_sub:shop-abc:monthly:sub_1",
      metadata: {},
      order: null,
    });

    let shopUpdated = false;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "shop_billing_events") return chainableQuery({ insert: vi.fn(() => ({ data: null, error: null })) });
        if (table === "shops") return chainableQuery({ update: vi.fn(() => { shopUpdated = true; return chainableQuery(); }) });
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest(
      { type: "payment", data: { id: "pay-123" } },
      { url: "http://localhost/api/payments/mercadopago-webhook?scope=billing" }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(shopUpdated).toBe(false);
  });

  it("handles idempotent subscription billing event", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "approved",
      external_reference: "shop_sub:shop-abc:monthly:sub_1",
      metadata: {},
      order: null,
    });

    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "shop_billing_events") {
          return chainableQuery({
            insert: vi.fn(() => chainableQuery()),
          });
        }
        if (table === "shops") return chainableQuery({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "shop-abc", plan_expiry: null }, error: null }),
          update: vi.fn(() => chainableQuery()),
        });
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest(
      { type: "payment", data: { id: "pay-123" } },
      { url: "http://localhost/api/payments/mercadopago-webhook?scope=billing" }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe("mercadopago-webhook POST — pending booking flow", () => {
  it("creates customer and appointment for approved payment", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "approved",
      external_reference: "pending_booking:booking-1",
      metadata: {},
      order: null,
    });

    let appointmentInserted = false;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "pending_bookings") {
          return chainableQuery({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "booking-1", shop_id: "shop-123",
                customer_name: "Juan", customer_phone: "1112345678",
                customer_email: "juan@test.com", service_id: "svc-1",
                staff_id: "staff-1",
                start_time: "2026-06-02T14:00:00.000Z",
                end_time: "2026-06-02T15:00:00.000Z",
                deposit_amount: 5000, mp_preference_id: "pref-1",
                status: "pending",
              },
              error: null,
            }),
          });
        }
        if (table === "shop_billing_events") return chainableQuery({ insert: vi.fn(() => ({ data: null, error: null })) });
        if (table === "customers") return chainableQuery({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn(() => chainableQuery({ single: vi.fn().mockResolvedValue({ data: { id: "cust-new" }, error: null }) })),
        });
        if (table === "services") return chainableQuery({ maybeSingle: vi.fn().mockResolvedValue({ data: { name: "Corte" }, error: null }) });
        if (table === "shops") return chainableQuery({ maybeSingle: vi.fn().mockResolvedValue({ data: { nombre: "Mi Local", email: "local@test.com" }, error: null }) });
        if (table === "appointments") return chainableQuery({
          insert: vi.fn(() => { appointmentInserted = true; return chainableQuery({ select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: "apt-new" }, error: null }) }); }),
        });
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest({ type: "payment", data: { id: "pay-456" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(appointmentInserted).toBe(true);
  });

  it("updates existing customer instead of creating new one", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "approved",
      external_reference: "pending_booking:booking-2",
      metadata: {},
      order: null,
    });

    let customerUpdated = false;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "pending_bookings") {
          return chainableQuery({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "booking-2", shop_id: "shop-123",
                customer_name: "Juan", customer_phone: "1112345678",
                customer_email: "juan@test.com", service_id: "svc-1",
                staff_id: null,
                start_time: "2026-06-02T14:00:00.000Z",
                end_time: "2026-06-02T15:00:00.000Z",
                deposit_amount: 0, mp_preference_id: "pref-2",
                status: "pending",
              },
              error: null,
            }),
          });
        }
        if (table === "shop_billing_events") return chainableQuery({ insert: vi.fn(() => ({ data: null, error: null })) });
        if (table === "customers") return chainableQuery({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "cust-existing" }, error: null }),
          update: vi.fn(() => { customerUpdated = true; return chainableQuery(); }),
        });
        if (table === "services") return chainableQuery({ maybeSingle: vi.fn().mockResolvedValue({ data: { name: "Corte" }, error: null }) });
        if (table === "shops") return chainableQuery({ maybeSingle: vi.fn().mockResolvedValue({ data: { nombre: "Mi Local" }, error: null }) });
        if (table === "appointments") return chainableQuery({
          insert: vi.fn(() => chainableQuery({ select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: "apt-new" }, error: null }) })),
        });
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest({ type: "payment", data: { id: "pay-456" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(customerUpdated).toBe(true);
  });

  it("marks booking as expired for rejected payment", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "rejected",
      external_reference: "pending_booking:booking-3",
      metadata: {},
      order: null,
    });

    let bookingUpdateStatus: string | undefined;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "pending_bookings") {
          return chainableQuery({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "booking-3", status: "pending" },
              error: null,
            }),
            update: vi.fn((updates: Record<string, unknown>) => {
              bookingUpdateStatus = updates.status as string;
              return chainableQuery();
            }),
          });
        }
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest({ type: "payment", data: { id: "pay-456" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(bookingUpdateStatus).toBe("expired");
  });

  it("marks booking as cancelled when payment is cancelled", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "cancelled",
      external_reference: "pending_booking:booking-4",
      metadata: {},
      order: null,
    });

    let bookingUpdateStatus: string | undefined;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "pending_bookings") {
          return chainableQuery({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "booking-4", status: "pending" },
              error: null,
            }),
            update: vi.fn((updates: Record<string, unknown>) => {
              bookingUpdateStatus = updates.status as string;
              return chainableQuery();
            }),
          });
        }
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest({ type: "payment", data: { id: "pay-456" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(bookingUpdateStatus).toBe("cancelled");
  });

  it("skips processing when booking is already completed", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "approved",
      external_reference: "pending_booking:booking-5",
      metadata: {},
      order: null,
    });

    const appointmentInsert = vi.fn();
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "pending_bookings") {
          return chainableQuery({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "booking-5", status: "completed" },
              error: null,
            }),
          });
        }
        if (table === "appointments") return chainableQuery({ insert: appointmentInsert });
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest({ type: "payment", data: { id: "pay-456" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(appointmentInsert).not.toHaveBeenCalled();
  });
});

describe("mercadopago-webhook POST — regular appointment flow", () => {
  it("updates appointment status to confirmed when payment is approved", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "approved",
      external_reference: "apt-existing-1",
      metadata: {},
      order: null,
    });

    let updateStatus: string | undefined;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "appointments") {
          return chainableQuery({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "apt-existing-1", shop_id: "shop-123" }, error: null }),
            update: vi.fn((updates: Record<string, unknown>) => {
              updateStatus = updates.status as string;
              return chainableQuery();
            }),
          });
        }
        if (table === "shop_billing_events") return chainableQuery({ insert: vi.fn(() => chainableQuery()) });
        if (table === "mercadopago_logs") return chainableQuery({ insert: vi.fn(() => chainableQuery()) });
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest({ type: "payment", data: { id: "pay-789" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(updateStatus).toBe("confirmed");
  });

  it("sets status to pending_payment when payment is pending", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "pending",
      external_reference: "apt-existing-2",
      metadata: {},
      order: null,
    });

    let updateStatus: string | undefined;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "appointments") {
          return chainableQuery({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "apt-existing-2", shop_id: "shop-123" }, error: null }),
            update: vi.fn((updates: Record<string, unknown>) => {
              updateStatus = updates.status as string;
              return chainableQuery();
            }),
          });
        }
        if (table === "mercadopago_logs") return chainableQuery({ insert: vi.fn(() => ({ data: null, error: null })) });
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest({ type: "payment", data: { id: "pay-789" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(updateStatus).toBe("pending_payment");
  });

  it("sets status to cancelled when payment is rejected", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "rejected",
      external_reference: "apt-existing-3",
      metadata: {},
      order: null,
    });

    let updateStatus: string | undefined;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "appointments") {
          return chainableQuery({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "apt-existing-3", shop_id: "shop-123" }, error: null }),
            update: vi.fn((updates: Record<string, unknown>) => {
              updateStatus = updates.status as string;
              return chainableQuery();
            }),
          });
        }
        if (table === "mercadopago_logs") return chainableQuery({ insert: vi.fn(() => ({ data: null, error: null })) });
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest({ type: "payment", data: { id: "pay-789" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(updateStatus).toBe("cancelled");
  });

  it("returns ok when appointment is not found", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "approved",
      external_reference: "apt-nonexistent",
      metadata: {},
      order: null,
    });

    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "appointments") return chainableQuery({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest({ type: "payment", data: { id: "pay-789" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("handles idempotent billing event (already processed)", async () => {
    mockPaymentGet.mockResolvedValue({
      status: "approved",
      external_reference: "apt-existing-4",
      metadata: {},
      order: null,
    });

    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "appointments") {
          return chainableQuery({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "apt-existing-4", shop_id: "shop-123" }, error: null }),
            update: vi.fn(() => chainableQuery()),
          });
        }
        if (table === "shop_billing_events") {
          return chainableQuery({ insert: vi.fn(() => {
            const cq = chainableQuery();
            cq.then = ((onfulfilled) => Promise.resolve({ data: null, error: { code: "23505" } }).then(onfulfilled)) as Promise<SupabaseResult>["then"];
            return cq;
          }) });
        }
        if (table === "mercadopago_logs") return chainableQuery({ insert: vi.fn(() => ({ data: null, error: null })) });
        return chainableQuery();
      }),
    } as never);

    const req = createNextRequest({ type: "payment", data: { id: "pay-789" } });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns 500 when payment API throws", async () => {
    mockPaymentGet.mockRejectedValue(new Error("MP API timeout"));

    const req = createNextRequest({ type: "payment", data: { id: "pay-789" } });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
