import { describe, it, expect, vi, afterEach } from "vitest";
import { logError } from "@/lib/api-logger";

const ctx = { requestId: "req-1", method: "POST", path: "/api/payments/mercadopago-webhook", startTime: Date.now() };

afterEach(() => vi.restoreAllMocks());

function capture(fn: () => void): string {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  fn();
  return spy.mock.calls.map((call) => String(call[0])).join("\n");
}

describe("logError", () => {
  it("loguea el mensaje de un Error normal", () => {
    const out = capture(() => logError(ctx, "Webhook processing failed", new Error("MP 401")));

    expect(out).toContain("MP 401");
  });

  it("no pierde el error cuando el valor lanzado es un objeto plano", () => {
    // El cliente de MP tira objetos con response/status/data, no Error. Con
    // String(error) el log salia como "[object Object]" y no habia forma de
    // saber que habia fallado en produccion.
    const out = capture(() =>
      logError(ctx, "Webhook processing failed", {
        response: { status: 404, data: { message: "Payment not found", code: 2002 } },
      }),
    );

    expect(out).not.toContain("[object Object]");
    expect(out).toContain("response.status=404");
    expect(out).toContain("Payment not found");
  });

  it("serializa un objeto plano sin response", () => {
    const out = capture(() => logError(ctx, "Webhook processing failed", { code: "ECONNREFUSED", message: "connect failed" }));

    expect(out).toContain("code=ECONNREFUSED");
    expect(out).toContain("message=connect failed");
  });

  it("trunca un body enorme en vez de reventar el log", () => {
    const out = capture(() =>
      logError(ctx, "Webhook processing failed", { response: { data: { blob: "x".repeat(5000) } } }),
    );

    expect(out).toContain("…");
    expect(out.length).toBeLessThan(1500);
  });

  it("no rompe con Error", () => {
    const out = capture(() => logError(ctx, "Webhook processing failed", new Error("boom")));

    expect(out).toContain("boom");
  });
});
