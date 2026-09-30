import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStoreOrder, createStoreOrderRecord } from "@/lib/dashboard/store/public-store-actions";

const { rateLimitCheck, adminClientMock, resolveShopMpToken, preferenceCreate } = vi.hoisted(() => ({
  rateLimitCheck: vi.fn(),
  adminClientMock: vi.fn(),
  resolveShopMpToken: vi.fn(),
  preferenceCreate: vi.fn(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  createRateLimiter: vi.fn(() => ({ check: rateLimitCheck })),
}));

vi.mock("@/lib/dashboard/appointments/shared", () => ({
  createAdminClient: adminClientMock,
}));

vi.mock("@/lib/payments/shop-mp", () => ({
  resolveShopMpToken: resolveShopMpToken,
  buildShopNotificationUrl: vi.fn(() => "https://demo.klip.com.ar/book/demo"),
}));

vi.mock("@/lib/payments/mp-payment-config", () => ({
  buildMpPaymentMethods: vi.fn(() => ({ payment_methods: [] })),
  fetchShopMpPaymentConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/dashboard/store/stock", () => ({
  restoreOrderStock: vi.fn(),
}));

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {},
  Preference: class {
    create = preferenceCreate;
  },
}));

const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";

const products = [
  {
    id: PRODUCT_ID,
    nombre_producto: "Shampoo",
    price: 5000,
    quantity: 10,
  },
];

const baseInput = {
  shopId: SHOP_ID,
  shopSlug: "demo",
  items: [{ productId: PRODUCT_ID, quantity: 2 }],
  customerName: "Ana Diaz",
  customerEmail: "ana@example.com",
  customerPhone: "11 1234-5678",
};

interface AdminStub {
  client: never;
  inserted: Record<string, unknown>[];
  shopSelects: number;
}

function makeAdmin(opts: { shop?: Record<string, unknown> | null } = {}): AdminStub {
  const inserted: Record<string, unknown>[] = [];
  const shopRow = opts.shop === undefined ? { mp_access_token: "token-local" } : opts.shop;
  const stub: { shopSelects: number } = { shopSelects: 0 };

  const client = {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "update", "delete", "eq", "in", "order", "limit"]) {
        chain[m] = vi.fn().mockImplementation(self);
      }
      chain.insert = vi.fn((payload: Record<string, unknown>) => {
        inserted.push({ table, payload });
        return chain;
      });
      if (table === "orders") {
        chain.select = vi.fn().mockImplementation(self);
        chain.single = vi.fn().mockResolvedValue({ data: { id: "order-1", shop_id: SHOP_ID }, error: null });
      } else {
        chain.select = vi.fn().mockImplementation(self);
        chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
      }
      if (table === "shops") {
        chain.maybeSingle = vi.fn().mockImplementation(() => {
          stub.shopSelects += 1;
          return Promise.resolve({ data: shopRow, error: null });
        });
      } else {
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      }
      const result =
        table === "stock" ? { data: products, error: null } : { data: null, error: null };
      chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled, onRejected);
      return chain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
  };

  return { client: client as never, inserted, get shopSelects() { return stub.shopSelects; } };
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitCheck.mockResolvedValue({ allowed: true });
  resolveShopMpToken.mockReturnValue({ ok: true, accessToken: "token-local" });
  preferenceCreate.mockResolvedValue({ id: "pref-1", init_point: "https://mp.example/pref" });
});

describe("createStoreOrderRecord", () => {
  it("guarda el metodo de pago que le pasan", async () => {
    const admin = makeAdmin();
    adminClientMock.mockResolvedValue(admin.client);

    const res = await createStoreOrderRecord({ ...baseInput, paymentMethod: "cash" });

    expect(res.success).toBe(true);
    const order = admin.inserted.find((row) => row.table === "orders");
    expect(order?.payload).toMatchObject({
      payment_method: "cash",
      status: "pending_payment",
      total_amount: 10000,
    });
  });

  it("mantiene 'mp' como default cuando no le pasan metodo", async () => {
    const admin = makeAdmin();
    adminClientMock.mockResolvedValue(admin.client);

    await createStoreOrderRecord(baseInput);

    const order = admin.inserted.find((row) => row.table === "orders");
    expect(order?.payload).toMatchObject({ payment_method: "mp" });
  });
});

describe("createStoreOrder con pago en el local", () => {
  it("registra el pedido sin preference de MP ni datos bancarios", async () => {
    const admin = makeAdmin();
    adminClientMock.mockResolvedValue(admin.client);

    const res = await createStoreOrder({ ...baseInput, paymentMethod: "cash" });

    expect(res).toEqual({ success: true, data: { orderId: "order-1", totalAmount: 10000 } });
    expect(resolveShopMpToken).not.toHaveBeenCalled();
    expect(preferenceCreate).not.toHaveBeenCalled();
    expect(admin.shopSelects).toBe(0);
  });

  it("funciona aunque el local no tenga Mercado Pago conectado", async () => {
    const admin = makeAdmin({ shop: null });
    adminClientMock.mockResolvedValue(admin.client);
    resolveShopMpToken.mockReturnValue({ ok: false, error: "El local no tiene Mercado Pago conectado" });

    const res = await createStoreOrder({ ...baseInput, paymentMethod: "cash" });

    expect(res.success).toBe(true);
    expect(resolveShopMpToken).not.toHaveBeenCalled();
  });

  it("sigue armando la preference cuando el pago es online", async () => {
    const admin = makeAdmin();
    adminClientMock.mockResolvedValue(admin.client);

    const res = await createStoreOrder({ ...baseInput, paymentMethod: "mp" });

    expect(res.success).toBe(true);
    expect(resolveShopMpToken).toHaveBeenCalled();
    expect(preferenceCreate).toHaveBeenCalled();
    expect(admin.inserted.find((row) => row.table === "orders")?.payload).toMatchObject({
      payment_method: "mp",
    });
  });
});
