import { describe, it, expect } from "vitest";
import { extractMpAppliedAmounts, pickAutoChargePayment } from "@/lib/payments/mp-amounts";

describe("extractMpAppliedAmounts", () => {
  it("prefiere net_amount cuando viene", () => {
    const result = extractMpAppliedAmounts({
      transaction_amount: 40000,
      net_amount: 38600,
      fee_details: [{ type: "mp_fee", amount: 1400, fee_payer: "collector" }],
    });

    expect(result).toEqual({
      gross_amount: 40000,
      mp_fee: 1400,
      net_amount: 38600,
      source: "mp_net_amount",
    });
  });

  it("cae a fee_details cuando no hay net_amount", () => {
    const result = extractMpAppliedAmounts({
      transaction_amount: 25000,
      fee_details: [{ type: "mp_fee", amount: 1000, fee_payer: "collector" }],
    });

    expect(result).toEqual({
      gross_amount: 25000,
      mp_fee: 1000,
      net_amount: 24000,
      source: "mp_fee_details",
    });
  });

  it("no descuenta las comisiones que paga la plataforma", () => {
    const result = extractMpAppliedAmounts({
      transaction_amount: 25000,
      fee_details: [
        { type: "mp_fee", amount: 1000, fee_payer: "collector" },
        { type: "discount_fee", amount: 500, fee_payer: "platform" },
      ],
    });

    expect(result!.mp_fee).toBe(1000);
    expect(result!.net_amount).toBe(24000);
  });

  it("suma varias comisiones del cobrador", () => {
    const result = extractMpAppliedAmounts({
      transaction_amount: 40000,
      fee_details: [
        { type: "mp_fee", amount: 1200, fee_payer: "collector" },
        { type: "other_fee", amount: 200, fee_payer: "collector" },
      ],
    });

    expect(result!.mp_fee).toBe(1400);
    expect(result!.net_amount).toBe(38600);
  });

  it("el ejemplo del user: 40.000 con 1.400 de fee dejan 38.600", () => {
    const result = extractMpAppliedAmounts({
      transaction_amount: 40000,
      fee_details: [{ type: "mp_fee", amount: 1400, fee_payer: "collector" }],
    });

    // Al 100% el vendedor cobra exactamente lo que entro a Klip.
    expect(result!.net_amount * 1).toBe(38600);
  });

  it("nunca devuelve un neto negativo", () => {
    const result = extractMpAppliedAmounts({
      transaction_amount: 1000,
      fee_details: [{ type: "mp_fee", amount: 1500, fee_payer: "collector" }],
    });

    expect(result!.net_amount).toBe(0);
    expect(result!.mp_fee).toBe(1500);
  });

  it("ignora net_amount incoherente (mayor que el bruto)", () => {
    const result = extractMpAppliedAmounts({
      transaction_amount: 25000,
      net_amount: 99000,
      fee_details: [{ type: "mp_fee", amount: 1000, fee_payer: "collector" }],
    });

    expect(result!.source).toBe("mp_fee_details");
    expect(result!.net_amount).toBe(24000);
  });

  it("devuelve null si no hay dato de fee: usa el fallback del sync", () => {
    expect(extractMpAppliedAmounts({ transaction_amount: 25000 })).toBeNull();
    expect(extractMpAppliedAmounts({ transaction_amount: 25000, fee_details: [] })).toBeNull();
    expect(
      extractMpAppliedAmounts({
        transaction_amount: 25000,
        fee_details: [{ type: "x", amount: 0, fee_payer: "collector" }],
      }),
    ).toBeNull();
    expect(
      extractMpAppliedAmounts({
        transaction_amount: 25000,
        fee_details: [{ type: "x", amount: 900, fee_payer: "platform" }],
      }),
    ).toBeNull();
  });

  it("devuelve null si no hay monto usable", () => {
    expect(extractMpAppliedAmounts({})).toBeNull();
    expect(extractMpAppliedAmounts({ transaction_amount: 0 })).toBeNull();
    expect(extractMpAppliedAmounts({ transaction_amount: -100 })).toBeNull();
  });

  it("usa amount como respaldo de transaction_amount", () => {
    const result = extractMpAppliedAmounts({
      amount: 25000,
      fee_details: [{ type: "mp_fee", amount: 1000, fee_payer: "collector" }],
    });

    expect(result!.gross_amount).toBe(25000);
  });

  it("redondea a 2 decimales", () => {
    const result = extractMpAppliedAmounts({
      transaction_amount: 25000.555,
      fee_details: [{ type: "mp_fee", amount: 1000.333, fee_payer: "collector" }],
    });

    expect(result!.gross_amount).toBe(25000.56);
    expect(result!.mp_fee).toBe(1000.33);
    // El neto sale de la resta sin redondear primero: 25000.555 - 1000.333.
    expect(result!.net_amount).toBe(24000.22);
  });

  it("acepta un net_amount real de 0 como dato valido", () => {
    // Bug previo: la guarda era `explicitNet > 0`, asi que un neto de 0 caia a
    // fee_details y terminaba en null, que el sync traducía a "usar el precio
    // del plan" y a pagar de mas. Con el fee al 100% la comision es 0 y punto.
    const result = extractMpAppliedAmounts({
      transaction_amount: 25000,
      net_amount: 0,
      fee_details: [{ type: "mp_fee", amount: 25000, fee_payer: "collector" }],
    });

    expect(result).not.toBeNull();
    expect(result!.net_amount).toBe(0);
    expect(result!.mp_fee).toBe(25000);
    expect(result!.source).toBe("mp_net_amount");
  });

  it("sigue tratando la ausencia de net_amount como ausencia", () => {
    // El otro lado de la moneda: con la guarda >= 0, `null` (que Number()
    // convierte en 0) pasaria como un neto de 0 legitimo.
    expect(extractMpAppliedAmounts({ transaction_amount: 25000, net_amount: null })).toBeNull();
    expect(extractMpAppliedAmounts({ transaction_amount: 25000 })).toBeNull();
  });
});

describe("pickAutoChargePayment", () => {
  const charge = (id: string, at: string) => ({ id, date_approved: at, status: "approved" });

  it("devuelve null si no hay candidatos", () => {
    expect(pickAutoChargePayment([], "2030-03-15T00:00:00Z")).toBeNull();
  });

  it("elige el pago aprobado mas cercano a la fecha del cobro", () => {
    // Todas las suscripciones de un local comparten external_reference, asi que
    // la busqueda devuelve TODOS sus cobros. Elegir el equivocado hace que el
    // vendedor cobre la comision sobre otro mes.
    const result = pickAutoChargePayment(
      [
        charge("p-old", "2029-03-15T10:00:00Z"),
        charge("p-near", "2030-03-15T12:00:00Z"),
        charge("p-new", "2030-04-15T12:00:00Z"),
      ],
      "2030-03-15T10:00:00Z",
    );

    expect(result!.id).toBe("p-near");
  });

  it("descarta pagos que no estan aprobados", () => {
    const result = pickAutoChargePayment(
      [
        { id: "p-pending", date_approved: "2030-03-15T10:00:00Z", status: "pending" },
        charge("p-ok", "2030-03-15T12:00:00Z"),
      ],
      "2030-03-15T10:00:00Z",
    );

    expect(result!.id).toBe("p-ok");
  });

  it("ignora candidatos sin id", () => {
    const result = pickAutoChargePayment(
      [{ date_approved: "2030-03-15T10:00:00Z" }, charge("p-ok", "2030-03-15T12:00:00Z")],
      "2030-03-15T10:00:00Z",
    );

    expect(result!.id).toBe("p-ok");
  });

  it("sin fecha de cobro conocida, se queda con el aprobado mas reciente", () => {
    const result = pickAutoChargePayment(
      [charge("p-old", "2030-03-15T10:00:00Z"), charge("p-new", "2030-04-15T10:00:00Z")],
      null,
    );

    expect(result!.id).toBe("p-new");
  });

  it("no se rompe si el webhook no trae fecha", () => {
    const result = pickAutoChargePayment(
      [charge("p-a", "2030-03-15T10:00:00Z"), charge("p-b", "2030-04-15T10:00:00Z")],
      undefined,
    );

    expect(result!.id).toBe("p-b");
  });

  it("con un solo candidato lo devuelve sin comparar fechas", () => {
    const result = pickAutoChargePayment([{ id: "p-unico", status: "approved" }], "2030-03-15T10:00:00Z");

    expect(result!.id).toBe("p-unico");
  });

  it("cae al mas reciente si ningun candidato tiene fecha parseable", () => {
    const result = pickAutoChargePayment(
      [
        { id: "p-sin-fecha-a", status: "approved" },
        { id: "p-sin-fecha-b", status: "approved" },
      ],
      "2030-03-15T10:00:00Z",
    );

    expect(result).not.toBeNull();
  });
});
