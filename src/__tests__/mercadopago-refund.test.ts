import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireOwnerShopId as mockRequireOwnerShopId, createServiceRoleClient as mockCreateServiceRole } from "@/lib/dashboard/auth/server";
import { createServerClient as mockCreateServerClient } from "@/lib/supabase/server";
import { supabaseStub } from "@/__tests__/setup";
import { PaymentRefund } from "mercadopago";

/**
 * Reembolso de un pago de Mercado Pago.
 *
 * Los tres bugs que cubren:
 *
 *  1. UN pago puede cubrir VARIOS turnos. `refund.total()` devuelve el 100% del
 *     pago, asi que antes de desmarcar solo el turno principal se devolvia la
 *     plata de todos y los demas seguian contando como cobrados.
 *  2. El read-then-write (`if (!is_paid) return` y despues el refund) no tenia
 *     barrera: dos clics o dos pestanas reembolsaban dos veces.
 *  3. Sin egreso contable el Balance del local no veia la plata que salio.
 */

const mockRefundTotal = vi.hoisted(() => vi.fn());
vi.mock("mercadopago", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    MercadoPagoConfig: vi.fn(function () {
      return {};
    }),
    PaymentRefund: vi.fn(function () {
      return { total: mockRefundTotal };
    }),
  };
});

vi.mock("@/lib/dashboard/finances/finances-actions", () => ({
  createExpense: vi.fn(),
}));

const { refundMpPayment } = await import("@/lib/payments/mercadopago-actions");
const { resolveRefundAppointmentIds } = await import("@/lib/payments/refund-targets");
const { createExpense: mockCreateExpense } = await import("@/lib/dashboard/finances/finances-actions");

type Tabla = {
  /** Lo que devuelve el `select` de esa tabla. */
  select?: unknown;
  /** Errores de los write, por tabla. */
  writeError?: { code?: string; message?: string } | null;
};

type Escritura = {
  tabla: string;
  payload: Record<string, unknown>;
  /** Los `.eq()` / `.in()` que se encadenaron antes del write. */
  filtros: Record<string, unknown>;
};

/**
 * Stub que ademas de resolver los selects registra el write y los filtros que
 * se le encadenaron. Hace falta para poder afirmar QUE turnos se desmarcan: con
 * un `.eq("id", principal)` el pago de un combo devuelve la plata de los tres
 * turnos y solo desmarca uno, y un `update` que exista no lo detecta.
 */
function adminStub(overrides: Record<string, Tabla> = {}) {
  const escrituras: Escritura[] = [];
  const deletes: Escritura[] = [];
  const from = vi.fn((tabla: string) => {
    const cfg = overrides[tabla] ?? {};
    const filtros: Record<string, unknown> = {};
    // El source encadena `.update(...).in(...).eq(...)`: los filtros se agregan
    // DESPUES del write, asi que hay que copiarlos al awaitear, no cuando se
    // llama al write.
    let pendiente: Escritura | null = null;
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (campo: string, valor: unknown) => {
        filtros[campo] = valor;
        return chain;
      },
      in: (campo: string, valores: unknown) => {
        filtros[campo] = valores;
        return chain;
      },
      is: () => chain,
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => chain,
      single: () => chain,
      delete: () => {
        deletes.push({ tabla, payload: {}, filtros: { ...filtros } });
        return chain;
      },
      then: (onFulfilled: (v: unknown) => unknown) => {
        if (pendiente) pendiente.filtros = { ...filtros };
        return Promise.resolve({ data: cfg.select ?? null, error: null }).then(onFulfilled);
      },
    };
    const registrar =
      (fn: "update" | "insert") =>
      (payload: Record<string, unknown>) => {
        pendiente = { tabla, payload, filtros: { ...filtros } };
        escrituras.push(pendiente);
        return escrituraResuelve(cfg, chain);
      };
    chain.update = registrar("update");
    chain.insert = registrar("insert");
    return chain;
  });
  return { from, escrituras, deletes, stub: { from } as never };
}

function escrituraResuelve(cfg: Tabla, chain: Record<string, unknown>) {
  if (cfg.writeError) {
    const conError: Record<string, unknown> = { ...chain };
    conError.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: cfg.writeError }).then(onFulfilled);
    return conError;
  }
  return chain;
}

const ENV_STUBS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service-role",
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const [k, v] of Object.entries(ENV_STUBS)) process.env[k] = v;
  vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: true, data: "shop-123" } as never);
  vi.mocked(mockCreateServerClient).mockResolvedValue(supabaseStub());
  mockRefundTotal.mockResolvedValue({ id: "refund-1", amount: 9000 });
  mockCreateExpense.mockResolvedValue({ success: true });
});

describe("resolveRefundAppointmentIds", () => {
  it("junta el turno principal con los que el webhook guardo para ese pago", () => {
    const ids = resolveRefundAppointmentIds({
      paymentId: "pay-1",
      principalId: "apt-main",
      logs: [
        { payload: { payment_id: "pay-1", paid_appointment_ids: ["apt-main", "apt-2", "apt-3"] } },
      ],
    });
    expect(ids.sort()).toEqual(["apt-2", "apt-3", "apt-main"]);
  });

  it("ignora los logs de OTRO pago", () => {
    const ids = resolveRefundAppointmentIds({
      paymentId: "pay-1",
      principalId: "apt-main",
      logs: [
        { payload: { payment_id: "pay-OTRO", paid_appointment_ids: ["apt-ajeno"] } },
        { payload: { payment_id: "pay-1", paid_appointment_ids: ["apt-main", "apt-2"] } },
      ],
    });
    expect(ids.sort()).toEqual(["apt-2", "apt-main"]);
  });

  it("cae en el turno solo si el pago viejo no tiene el set guardado", () => {
    const ids = resolveRefundAppointmentIds({
      paymentId: "pay-1",
      principalId: "apt-main",
      logs: [{ payload: { payment_id: "pay-1" } }],
    });
    expect(ids).toEqual(["apt-main"]);
  });

  it("no se rompe con payloads raros", () => {
    const ids = resolveRefundAppointmentIds({
      paymentId: "pay-1",
      principalId: "apt-main",
      logs: [null, { payload: "basura" }, { payload: { payment_id: "pay-1", paid_appointment_ids: "no-es-lista" } }],
    });
    expect(ids).toEqual(["apt-main"]);
  });
});

/** Log de webhook con el set completo, como lo deja el webhook de hoy. */
const logDePago = (paymentId: string, ids: string[]) => ({
  payload: { payment_id: paymentId, paid_appointment_ids: ids },
});

describe("refundMpPayment", () => {
  it("desmarca TODOS los turnos del combo, no solo el principal", async () => {
    const { escrituras, stub } = adminStub({
      appointments: { select: { id: "apt-main", is_paid: true, mp_preference_id: "pref-1", shop_id: "shop-123" } },
      shops: { select: { mp_access_token: "APP_USR-x" } },
      mercadopago_logs: { select: [logDePago("pay-1", ["apt-main", "apt-2", "apt-3"])] },
    });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);

    const result = await refundMpPayment("apt-main");

    expect(result).toEqual({ success: true });
    expect(mockRefundTotal).toHaveBeenCalledWith({ payment_id: "pay-1" });

    const update = escrituras.find((e) => e.tabla === "appointments");
    expect(update).toBeDefined();
    // El bug era un `.eq("id", principal)`: con un pago de combo se devolvia la
    // plata de los tres turnos y solo se desmarcaba el principal. Un `update` que
    // exista no alcanza para detectarlo: hay que mirar A QUE se desmarca.
    expect([...(update!.filtros.id as string[])].sort()).toEqual(["apt-2", "apt-3", "apt-main"]);
    expect(update!.filtros.id).not.toBe("apt-main");

    // El claim va al ledger y ANTES de tocar los turnos.
    const claim = escrituras.find((e) => e.tabla === "shop_billing_events");
    expect(claim?.payload).toMatchObject({
      event_type: "appointment_refund_applied",
      payload: { payment_id: "pay-1" },
    });
    expect(escrituras.indexOf(claim!)).toBeLessThan(escrituras.indexOf(update!));
  });

  it("asienta el egreso con el monto que devolvio Mercado Pago", async () => {
    const { stub } = adminStub({
      appointments: { select: { id: "apt-main", is_paid: true, mp_preference_id: "pref-1", shop_id: "shop-123" } },
      shops: { select: { mp_access_token: "APP_USR-x" } },
      mercadopago_logs: { select: [logDePago("pay-1", ["apt-main", "apt-2"])] },
    });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);
    mockRefundTotal.mockResolvedValue({ id: "refund-1", amount: 9000 });

    await refundMpPayment("apt-main");

    expect(mockCreateExpense).toHaveBeenCalledTimes(1);
    const fd = mockCreateExpense.mock.calls[0][0] as FormData;
    expect(fd.get("amount")).toBe("9000");
    expect(fd.get("category")).toBe("Reembolso");
    expect(String(fd.get("description"))).toContain("pay-1");
    // `createExpense` no setea appointment_id: si lo seteáramos, Inicio (que
    // filtra por appointment_id IS NULL) no contaria el egreso y Caja si.
    expect(fd.get("appointment_id")).toBeNull();
  });

  it("un segundo intento del mismo pago dice que ya fue reembolsado", async () => {
    const { stub } = adminStub({
      appointments: { select: { id: "apt-main", is_paid: true, mp_preference_id: "pref-1", shop_id: "shop-123" } },
      shops: { select: { mp_access_token: "APP_USR-x" } },
      mercadopago_logs: { select: [logDePago("pay-1", ["apt-main"])] },
      // El indice unico de la migracion 111.
      shop_billing_events: { writeError: { code: "23505", message: "duplicate key" } },
    });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);

    const result = await refundMpPayment("apt-main");

    expect(result).toEqual({ success: false, error: "Este pago ya fue reembolsado" });
    // Y lo importante: NO se le devolvio la plata a MP una segunda vez.
    expect(mockRefundTotal).not.toHaveBeenCalled();
  });

  it("si Mercado Pago falla, libera el claim para poder reintentar", async () => {
    const { escrituras, deletes, stub } = adminStub({
      appointments: { select: { id: "apt-main", is_paid: true, mp_preference_id: "pref-1", shop_id: "shop-123" } },
      shops: { select: { mp_access_token: "APP_USR-x" } },
      mercadopago_logs: { select: [logDePago("pay-1", ["apt-main"])] },
    });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);
    mockRefundTotal.mockRejectedValue(new Error("MP dice que ya no se puede"));

    const result = await refundMpPayment("apt-main");

    expect(result.success).toBe(false);
    expect(String((result as { error: string }).error)).toContain("MP dice que ya no se puede");
    // El claim se borra: si no, el pago queda bloqueado para siempre.
    expect(deletes.some((d) => d.tabla === "shop_billing_events")).toBe(true);
    // Y no se desmarco ningun turno ni se asento nada.
    expect(escrituras.some((e) => e.tabla === "appointments")).toBe(false);
    expect(mockCreateExpense).not.toHaveBeenCalled();
  });

  it("no reembolsa un turno que nunca tuvo un pago registrado", async () => {
    // El rechazo ya NO es por `is_paid`: un turno que perdio el solape en el
    // webhook queda en `pending_payment` con `is_paid = false` pero CON la plata
    // adentro, y ese es justo el caso que hay que dejar reembolsable. Lo que sigue
    // mandando es que exista un pago registrado.
    const { stub } = adminStub({
      appointments: { select: { id: "apt-main", is_paid: false, mp_preference_id: "pref-1", shop_id: "shop-123" } },
      shops: { select: { mp_access_token: "APP_USR-x" } },
      mercadopago_logs: { select: [] },
    });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);

    const result = await refundMpPayment("apt-main");

    expect(result.success).toBe(false);
    expect(mockRefundTotal).not.toHaveBeenCalled();
  });

  it("SI reembolsa un turno pending_payment con el pago registrado (perdio el solape)", async () => {
    // Este es el bug que se cerro. La constraint de la migracion 109 cubre
    // `confirmed` y NO `pending_payment` (la retencion del carrito son 10 min y
    // un CHECK no puede mirar el reloj). Dos carritos sobre el mismo slot se
    // confirman los dos: el segundo queda en `pending_payment` con `is_paid = false`
    // pero con el pago aplicado. Con el chequeo por `is_paid` el local no tenia
    // ninguna forma de devolver esa plata desde la app.
    const { stub } = adminStub({
      appointments: { select: { id: "apt-main", is_paid: false, mp_preference_id: "pref-1", shop_id: "shop-123" } },
      shops: { select: { mp_access_token: "APP_USR-x" } },
      mercadopago_logs: { select: [{ payload: { payment_id: "pay-1", paid_appointment_ids: ["apt-main"] } }] },
    });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);

    const result = await refundMpPayment("apt-main");

    expect(result).toEqual({ success: true });
    expect(mockRefundTotal).toHaveBeenCalledWith({ payment_id: "pay-1" });
  });

  it("no toca nada de otro local", async () => {
    const { stub } = adminStub({});
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);

    const result = await refundMpPayment("apt-de-otro-local");

    // El select del turno viene con `.eq("shop_id", shopId)`, asi que un turno
    // ajeno no existe para esta accion.
    expect(result).toEqual({ success: false, error: "Turno no encontrado" });
    expect(mockRefundTotal).not.toHaveBeenCalled();
  });
});

describe("PaymentRefund se instancia con el token del local", () => {
  it("usa mp_access_token del local, no el de la plataforma", async () => {
    const { stub } = adminStub({
      appointments: { select: { id: "apt-main", is_paid: true, mp_preference_id: "pref-1", shop_id: "shop-123" } },
      shops: { select: { mp_access_token: "APP_USR-del-local" } },
      mercadopago_logs: { select: [logDePago("pay-1", ["apt-main"])] },
    });
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);

    await refundMpPayment("apt-main");

    // El pago vive en la cuenta del local, asi que un token distinto devuelve
    // un pago inexistente y el reembolso falla en MP.
    const { MercadoPagoConfig } = await import("mercadopago");
    expect(vi.mocked(MercadoPagoConfig).mock.calls.at(-1)?.[0]).toMatchObject({
      accessToken: "APP_USR-del-local",
    });
    expect(PaymentRefund).toHaveBeenCalled();
  });
});