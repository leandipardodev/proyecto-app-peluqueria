import { describe, it, expect } from "vitest";
import {
  amountPaidFor,
  collectedAmount,
  fullServiceAmount,
  withAmountPaid,
} from "@/lib/dashboard/appointments/paid-amount";

/**
 * "Ingreso = plata efectivamente cobrada".
 *
 * Antes todos los agregados sumaban `service_price`: el precio de lista de los
 * turnos marcados como pagados. Con seña de $3.000 sobre un servicio de $40.000
 * eso reportaba $40.000 de ingreso y pagaba la comisión sobre $40.000.
 */
describe("fullServiceAmount", () => {
  it("es el precio de lista cuando no hay descuento", () => {
    expect(fullServiceAmount(40000, 0)).toBe(40000);
    expect(fullServiceAmount(40000, null)).toBe(40000);
    expect(fullServiceAmount(40000, undefined)).toBe(40000);
  });

  it("descuenta el porcentaje de fidelidad", () => {
    expect(fullServiceAmount(40000, 10)).toBe(36000);
    expect(fullServiceAmount(20000, 25)).toBe(15000);
  });

  it("acota el descuento a 0..100", () => {
    expect(fullServiceAmount(40000, 150)).toBe(0);
    expect(fullServiceAmount(40000, -20)).toBe(40000);
  });

  it("no rompe con precio null", () => {
    expect(fullServiceAmount(null, 10)).toBe(0);
    expect(fullServiceAmount(undefined, 0)).toBe(0);
  });
});

describe("amountPaidFor", () => {
  it("un turno terminado suma el total: el salon tiene la seña MAS el saldo", () => {
    expect(amountPaidFor({ settled: true, servicePrice: 40000, depositAmount: 3000, loyaltyDiscountPercent: 0 })).toBe(40000);
  });

  it("un turno terminado con descuento de fidelidad suma el precio menos el descuento", () => {
    expect(amountPaidFor({ settled: true, servicePrice: 40000, depositAmount: 3000, loyaltyDiscountPercent: 10 })).toBe(36000);
  });

  it("un turno solo reservado suma SOLO la seña", () => {
    // Este es el bug: antes sumaba $40.000 cuando habian entrado $3.000.
    expect(amountPaidFor({ settled: false, servicePrice: 40000, depositAmount: 3000, loyaltyDiscountPercent: 0 })).toBe(3000);
  });

  it("un turno sin seña y sin cobrar suma 0", () => {
    expect(amountPaidFor({ settled: false, servicePrice: 40000, depositAmount: null, loyaltyDiscountPercent: 0 })).toBe(0);
    expect(amountPaidFor({ settled: false, servicePrice: 40000, depositAmount: 0 })).toBe(0);
  });

  it("nunca negativo", () => {
    expect(amountPaidFor({ settled: false, depositAmount: -500 })).toBe(0);
  });
});

describe("collectedAmount", () => {
  it("usa amount_paid cuando ya esta escrito", () => {
    expect(collectedAmount({ amount_paid: 3000, service_price: 40000 })).toBe(3000);
  });

  it("cae a service_price mientras la migracion 112 no este aplicada", () => {
    // `amount_paid` viene en null para toda fila hasta que se corra la
    // migracion. Sin este fallback la app muestra $0 en todos lados.
    expect(collectedAmount({ amount_paid: null, service_price: 40000 })).toBe(40000);
    expect(collectedAmount({ amount_paid: null, service_price: 40000, loyalty_discount_percent_applied: 10 })).toBe(36000);
  });

  it("cae al precio del servicio si no hay service_price", () => {
    expect(collectedAmount({ amount_paid: null, service_price: null, services: { price: 15000 } })).toBe(15000);
    expect(collectedAmount({ amount_paid: null, services: [{ price: 15000 }] })).toBe(15000);
  });

  it("respeta amount_paid = 0 (no es falsy)", () => {
    // Un turno con seña registrada pero no cobrada tiene amount_paid = 0 y NO
    // debe caer al precio de lista.
    expect(collectedAmount({ amount_paid: 0, service_price: 40000 })).toBe(0);
  });
});

describe("withAmountPaid", () => {
  it("agrega la clave cuando el monto es positivo", () => {
    expect(withAmountPaid({ is_paid: true }, 3000)).toEqual({ is_paid: true, amount_paid: 3000 });
  });

  it("no agrega la clave si el monto es 0 o null", () => {
    // Un pago pendiente o cancelado no aumento la plata cobrada: mandar
    // amount_paid = 0 seria peor que no mandar nada, porque pisa el valor real.
    expect(withAmountPaid({ is_paid: false }, 0)).toEqual({ is_paid: false });
    expect(withAmountPaid({ is_paid: false }, null)).toEqual({ is_paid: false });
  });

  it("no muta el payload original", () => {
    const original = { is_paid: true };
    withAmountPaid(original, 500);
    expect(original).toEqual({ is_paid: true });
  });
});