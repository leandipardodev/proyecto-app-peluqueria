import { describe, it, expect, vi, beforeEach } from "vitest";

const preApprovalGet = vi.fn();
const paymentSearch = vi.fn();

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: vi.fn(function (this: { accessToken?: string }, config: { accessToken: string }) {
    this.accessToken = config.accessToken;
  }),
  PreApproval: vi.fn(function (this: unknown) {
    this.get = (args: { id: string }) => preApprovalGet(args);
  }),
  Payment: vi.fn(function (this: unknown) {
    this.search = (args: unknown) => paymentSearch(args);
  }),
}));

import { resolveAutoChargeAmounts } from "@/lib/payments/mp-auto-charge";

const ARG = {
  accessToken: "APP_USR-test",
  preapprovalId: "pre-1",
  externalReference: "shop_sub_auto:shop-1",
};

function preapproval(overrides: Record<string, unknown> = {}) {
  return {
    summarized: { last_charged_date: "2030-03-15T12:00:00.000Z" },
    auto_recurring: { transaction_amount: 40000 },
    ...overrides,
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    status: "approved",
    date_approved: "2030-03-15T12:00:00.000Z",
    transaction_amount: 40000,
    net_amount: 38600,
    live_mode: true,
    ...overrides,
  };
}

beforeEach(() => {
  preApprovalGet.mockReset().mockResolvedValue(preapproval());
  paymentSearch.mockReset().mockResolvedValue({ results: [payment()] });
});

describe("resolveAutoChargeAmounts", () => {
  it("devuelve los montos reales del pago del cobro", async () => {
    const result = await resolveAutoChargeAmounts(ARG);

    expect(result.paymentId).toBe("pay-1");
    expect(result.amounts).toEqual({
      gross_amount: 40000,
      mp_fee: 1400,
      net_amount: 38600,
      source: "mp_net_amount",
    });
    expect(result.liveMode).toBe(true);
  });

  it("busca por external_reference y acotado a la ventana del cobro", async () => {
    await resolveAutoChargeAmounts(ARG);

    const options = paymentSearch.mock.calls[0][0].options;
    expect(options.external_reference).toBe("shop_sub_auto:shop-1");
    expect(options.sort).toBe("date_approved");
    expect(options.criteria).toBe("desc");
    // Ventana de +/- 6h alrededor de summarized.last_charged_date.
    expect(Date.parse(options.begin_date)).toBeLessThan(Date.parse("2030-03-15T12:00:00.000Z"));
    expect(Date.parse(options.end_date)).toBeGreaterThan(Date.parse("2030-03-15T12:00:00.000Z"));
  });

  it("devuelve null si el pago no coincide con el monto recurrente del plan", async () => {
    // Es el pago de otro local o de otro importe. Cobrar la comision sobre el
    // seria inventar plata: preferimos needs_review.
    paymentSearch.mockResolvedValue({ results: [payment({ transaction_amount: 9500, net_amount: 9300 })] });

    const result = await resolveAutoChargeAmounts(ARG);

    expect(result.amounts).toBeNull();
    expect(result.paymentId).toBeNull();
  });

  it("devuelve null si no se puede determinar el neto del pago", async () => {
    paymentSearch.mockResolvedValue({
      results: [payment({ transaction_amount: 40000, net_amount: undefined, fee_details: null })],
    });

    const result = await resolveAutoChargeAmounts(ARG);

    expect(result.amounts).toBeNull();
  });

  it("marca live_mode false para no tomar un pago de prueba por uno real", async () => {
    paymentSearch.mockResolvedValue({ results: [payment({ live_mode: false })] });

    const result = await resolveAutoChargeAmounts(ARG);

    expect(result.liveMode).toBe(false);
  });

  it("no explota si el preapproval no responde: sigue buscando sin ventana", async () => {
    preApprovalGet.mockRejectedValue(new Error("404"));

    const result = await resolveAutoChargeAmounts(ARG);

    expect(paymentSearch.mock.calls[0][0].options.begin_date).toBeUndefined();
    expect(result.amounts).not.toBeNull();
  });

  it("no explota si la busqueda de pagos falla", async () => {
    paymentSearch.mockRejectedValue(new Error("500"));

    const result = await resolveAutoChargeAmounts(ARG);

    expect(result).toEqual({ paymentId: null, amounts: null, liveMode: null });
  });

  it("no explota si la busqueda viene vacia", async () => {
    paymentSearch.mockResolvedValue({});

    const result = await resolveAutoChargeAmounts(ARG);

    expect(result).toEqual({ paymentId: null, amounts: null, liveMode: null });
  });

  it("tolera una tolerancia de 1 centavo en el monto", async () => {
    paymentSearch.mockResolvedValue({
      results: [payment({ transaction_amount: 40000.4, net_amount: 38600.4 })],
    });

    const result = await resolveAutoChargeAmounts(ARG);

    expect(result.amounts).not.toBeNull();
  });

  it("elige el cobro de ESTE evento entre todos los de la suscripcion", async () => {
    // La suscripcion comparte external_reference entre meses, asi que la busqueda
    // devuelve todos. Si se tomara el equivocado, el mes se liquida dos veces y
    // otro queda sin pagar.
    paymentSearch.mockResolvedValue({
      results: [
        payment({ id: "pay-mar", date_approved: "2030-03-15T12:00:00.000Z" }),
        payment({ id: "pay-abr", date_approved: "2030-04-15T12:00:00.000Z" }),
        payment({ id: "pay-feb", date_approved: "2030-02-15T12:00:00.000Z" }),
      ],
    });

    const result = await resolveAutoChargeAmounts(ARG);

    expect(result.paymentId).toBe("pay-mar");
  });
});
