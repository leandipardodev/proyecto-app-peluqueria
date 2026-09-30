import { describe, it, expect, vi, beforeEach } from "vitest";
import { chainableQuery } from "./setup";
import type { SupabaseResult } from "./setup";

type Awaitable = (value: SupabaseResult) => unknown;

const upserted: unknown[][] = [];
const upsertOptions: Record<string, unknown>[] = [];

function stubClient(tables: Record<string, unknown[]>) {
  return {
    from: vi.fn((table: string) => {
      const chain = chainableQuery();
      const data = tables[table] ?? [];
      chain.then = ((onfulfilled?: Awaitable, onrejected?: (reason: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)) as never;
      chain.upsert = vi.fn((rows: unknown[], options?: Record<string, unknown>) => {
        upserted.push(rows);
        upsertOptions.push(options ?? {});
        return chain;
      });
      return chain;
    }),
  } as never;
}

function partner(overrides: Record<string, unknown> = {}) {
  return {
    id: "partner-1",
    name: "Juan",
    email: null,
    phone: null,
    referral_code: "JUAN123",
    commission_percent_override: null,
    commission_months_override: null,
    is_active: true,
    pin_hash: null,
    pin_last4: null,
    payout_alias: null,
    payout_cbu: null,
    ...overrides,
  };
}

function attribution(overrides: Record<string, unknown> = {}) {
  return {
    id: "attr-1",
    shop_id: "shop-1",
    partner_id: "partner-1",
    attributed_at: "2030-01-01T00:00:00.000Z",
    commission_percent_snapshot: 100,
    commission_months_snapshot: 2,
    ...overrides,
  };
}

function appliedEvent(id: string, createdAt: string, payload: Record<string, unknown> = {}) {
  return {
    id,
    shop_id: "shop-1",
    created_at: createdAt,
    event_type: "subscription_payment_applied",
    payload: { payment_id: `pay-${id}`, ...payload },
  };
}

/**
 * Cobro automatico mensual. Comparte external_reference con todos los demas
 * cobros de la misma suscripcion, por eso el helper lo impone.
 */
function autoChargeEvent(id: string, createdAt: string, payload: Record<string, unknown> = {}) {
  return {
    id,
    shop_id: "shop-1",
    created_at: createdAt,
    event_type: "subscription_auto_charge_applied",
    payload: {
      preapproval_id: "pre-1",
      external_reference: "shop_sub_auto:shop-1",
      ...payload,
    },
  };
}

function checkoutEvent(id: string, createdAt: string, amount: number, ref: string) {
  return {
    id,
    shop_id: "shop-1",
    created_at: createdAt,
    event_type: "subscription_checkout_created",
    payload: { amount, external_reference: ref },
  };
}

const SETTINGS = {
  default_commission_percent: 100,
  default_commission_months: 2,
  fallback_mp_fee_percent: 4,
};

async function runSync(tables: Record<string, unknown[]>, options?: { dryRun?: boolean }) {
  upserted.length = 0;
  const { createServiceRoleClient } = await import("@/lib/dashboard/auth/server");
  vi.mocked(createServiceRoleClient).mockResolvedValue(stubClient(tables));

  const { syncReferralLedgerInternal } = await import("@/lib/admin/referrals");
  return syncReferralLedgerInternal(options);
}

beforeEach(() => {
  upserted.length = 0;
  upsertOptions.length = 0;
  vi.resetModules();
  // Ya NO se mockea getBillingPrice: el sync no consulta el precio del plan para
  // calcular comisiones. Si alguien lo vuelve a importar, el test tiene que
  // romper, porque reintroduciria el pago sobre el precio vigente.
});

describe("sync del ledger de comisiones", () => {
  it("solo cuenta los pagos posteriores a la atribucion", async () => {
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution({ attributed_at: "2030-03-01T00:00:00.000Z" })],
      shop_billing_events: [
        appliedEvent("e1", "2030-01-15T00:00:00.000Z"),
        appliedEvent("e2", "2030-02-15T00:00:00.000Z"),
        appliedEvent("e3", "2030-03-15T00:00:00.000Z", {
          gross_amount: 40000,
          mp_fee: 1400,
          net_amount: 38600,
        }),
        appliedEvent("e4", "2030-04-15T00:00:00.000Z", {
          gross_amount: 40000,
          mp_fee: 1400,
          net_amount: 38600,
        }),
      ],
      referral_commission_ledger: [],
    });

    // Los dos pagos previos NO consumen los 2 cupos.
    expect(result.drafts.map((d) => d.billing_event_id)).toEqual(["e3", "e4"]);
    expect(result.drafts[0].payment_sequence).toBe(1);
    expect(result.drafts[1].payment_sequence).toBe(2);
  });

  it("no genera nada para el tercer pago", async () => {
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution({ attributed_at: "2030-03-01T00:00:00.000Z" })],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 0, net_amount: 40000 }),
        appliedEvent("e2", "2030-04-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 0, net_amount: 40000 }),
        appliedEvent("e3", "2030-05-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 0, net_amount: 40000 }),
      ],
      referral_commission_ledger: [],
    });

    expect(result.drafts).toHaveLength(2);
  });

  it("calcula la comision sobre el neto, no sobre el bruto", async () => {
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", {
          gross_amount: 40000,
          mp_fee: 1400,
          net_amount: 38600,
        }),
      ],
      referral_commission_ledger: [],
    });

    const row = result.drafts[0];
    expect(row.base_amount).toBe(40000);
    expect(row.mp_fee).toBe(1400);
    expect(row.net_amount).toBe(38600);
    // Al 100% gana lo que entro: 40.000 - 1.400.
    expect(row.commission_amount).toBe(38600);
    expect(row.amount_source).toBe("payment_event");
  });

  it("un 50% se aplica sobre el neto", async () => {
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner({ commission_percent_override: 50 })],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", {
          gross_amount: 40000,
          mp_fee: 1400,
          net_amount: 38600,
        }),
      ],
      referral_commission_ledger: [],
    });

    expect(result.drafts[0].commission_percent).toBe(50);
    expect(result.drafts[0].commission_amount).toBe(19300);
  });

  it("un 0% de override NO cae al default de 100", async () => {
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner({ commission_percent_override: 0 })],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", {
          gross_amount: 40000,
          mp_fee: 1400,
          net_amount: 38600,
        }),
      ],
      referral_commission_ledger: [],
    });

    expect(result.drafts[0].commission_percent).toBe(0);
    expect(result.drafts[0].commission_amount).toBe(0);
  });

  it("0 meses de comision no genera nada (y no cae al default de 2)", async () => {
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner({ commission_months_override: 0 })],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 0, net_amount: 40000 }),
        appliedEvent("e2", "2030-04-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 0, net_amount: 40000 }),
      ],
      referral_commission_ledger: [],
    });

    expect(result.drafts).toHaveLength(0);
  });

  it("los overrides infinitely editables se reflejan al recalcular", async () => {
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner({ commission_percent_override: 30, commission_months_override: 5 })],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 0, net_amount: 40000 }),
        appliedEvent("e2", "2030-04-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 0, net_amount: 40000 }),
        appliedEvent("e3", "2030-05-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 0, net_amount: 40000 }),
      ],
      referral_commission_ledger: [],
    });

    expect(result.drafts).toHaveLength(3);
    expect(result.drafts.map((d) => d.commission_amount)).toEqual([12000, 12000, 12000]);
  });

  it("si el monto sale del checkout, la fee se estima con el porcentaje configurado", async () => {
    // El checkout SI conoce el importe que se cobro. Lo que no se sabe es la fee,
    // y para eso esta el porcentaje de fallback (4%): sobreestimar la fee
    // protege a Klip, que es quien paga.
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", { external_reference: "shop_sub:shop-1:1" }),
        checkoutEvent("c1", "2030-03-15T00:00:00.000Z", 40000, "shop_sub:shop-1:1"),
      ],
      referral_commission_ledger: [],
    });

    const row = result.drafts[0];
    expect(row.base_amount).toBe(40000);
    expect(row.mp_fee).toBe(1600);
    expect(row.net_amount).toBe(38400);
    expect(row.amount_source).toBe("checkout_join");
    expect(row.status).toBe("pending");
  });

  it("sin ningun dato de monto crea la fila needs_review con comision 0", async () => {
    // ANTES: multiplicaba el precio vigente (25000) por la fee y pagaba 24000 de
    // comision sobre un pago que nunca ocurrio con ese importe. Con precios de
    // 25.000 / 9.500 / 15.000 en la base, eso es plata que salia de Klip.
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", { external_reference: "shop_sub:shop-1:1" }),
      ],
      referral_commission_ledger: [],
    });

    const row = result.drafts[0];
    expect(row.amount_source).toBe("unknown");
    expect(row.status).toBe("needs_review");
    expect(row.base_amount).toBe(0);
    expect(row.net_amount).toBe(0);
    expect(row.commission_amount).toBe(0);
  });

  it("needs_review igual cuenta en la secuencia, para no regalar el mes siguiente", async () => {
    // Si la fila sin dato se omitiera, el siguiente pago entraria como numero 1
    // cuando en realidad es el 2, y el vendedor cobraria 3 meses de comision.
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        autoChargeEvent("e1", "2030-03-15T00:00:00.000Z"),
        appliedEvent("e2", "2030-04-15T00:00:00.000Z", {
          external_reference: "shop_sub:shop-1:1",
          gross_amount: 40000,
          mp_fee: 1400,
          net_amount: 38600,
        }),
        checkoutEvent("c1", "2030-04-15T00:00:00.000Z", 40000, "shop_sub:shop-1:1"),
        autoChargeEvent("e3", "2030-05-15T00:00:00.000Z", {
          payment_id: "pay-3",
          gross_amount: 40000,
          mp_fee: 1400,
          net_amount: 38600,
        }),
      ],
      referral_commission_ledger: [],
    });

    expect(result.drafts.map((d) => d.payment_sequence)).toEqual([1, 2]);
    expect(result.drafts[0].status).toBe("needs_review");
    expect(result.drafts[1].status).toBe("pending");
    // El tercero no entra: los 2 cupos ya se usaron.
    expect(result.drafts).toHaveLength(2);
  });

  it("un neto real de 0 da comision 0 y NO necesita revision", async () => {
    // Fee del 100% (pago con octogonal o credito total). El dato es VALIDO: si se
    // tratara como "ausente", la fila caeria en needs_review y quedaria pendiente
    // de una carga manual que nunca hace falta.
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", {
          gross_amount: 40000,
          mp_fee: 40000,
          net_amount: 0,
        }),
      ],
      referral_commission_ledger: [],
    });

    const row = result.drafts[0];
    expect(row.base_amount).toBe(40000);
    expect(row.mp_fee).toBe(40000);
    expect(row.net_amount).toBe(0);
    expect(row.commission_amount).toBe(0);
    expect(row.amount_source).toBe("payment_event");
    expect(row.status).toBe("pending");
  });

  it("montos parciales o invalidos en el evento van a needs_review", async () => {
    // Presencia parcial = dato no confiable. Y un NaN tambien: no se puede
    // calcular nada sobre el.
    const parcial = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", { gross_amount: 40000, net_amount: 0 }),
      ],
      referral_commission_ledger: [],
    });

    expect(parcial.drafts[0].amount_source).toBe("unknown");
    expect(parcial.drafts[0].status).toBe("needs_review");
    expect(parcial.drafts[0].commission_amount).toBe(0);

    const nan = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", {
          gross_amount: 40000,
          mp_fee: 0,
          net_amount: "no-es-un-numero",
        }),
      ],
      referral_commission_ledger: [],
    });

    expect(nan.drafts[0].amount_source).toBe("unknown");
    expect(nan.drafts[0].status).toBe("needs_review");
  });

  it("el auto-cargo nunca hace join con un checkout (los external_reference difieren)", async () => {
    // El checkout manual usa "shop_sub:<shop>:<ciclo>:<ts>" y la suscripcion
    // "shop_sub_auto:<shop>". Si se cruzaran por descuido, el auto-cargo tomaria
    // como suyo el monto de otro pago.
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        autoChargeEvent("e1", "2030-03-15T00:00:00.000Z"),
        checkoutEvent("c1", "2030-02-15T00:00:00.000Z", 40000, "shop_sub:shop-1:1"),
      ],
      referral_commission_ledger: [],
    });

    expect(result.drafts[0].amount_source).toBe("unknown");
    expect(result.drafts[0].status).toBe("needs_review");
  });

  it("es idempotente: no vuelve a generar lo que ya esta en el ledger", async () => {
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 0, net_amount: 40000 }),
        appliedEvent("e2", "2030-04-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 0, net_amount: 40000 }),
      ],
      referral_commission_ledger: [{ id: "l1", billing_event_id: "e1" }],
    });

    expect(result.drafts.map((d) => d.billing_event_id)).toEqual(["e2"]);
    // Y el que queda es el #2, no el #1: la secuencia no se pisa.
    expect(result.drafts[0].payment_sequence).toBe(2);
  });

  it("ignora locales sin atribucion", async () => {
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [],
      shop_billing_events: [appliedEvent("e1", "2030-03-15T00:00:00.000Z")],
      referral_commission_ledger: [],
    });

    expect(result.drafts).toHaveLength(0);
  });

  it("ignora eventos que no son subscription_payment_applied", async () => {
    const result = await runSync({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        {
          id: "c1",
          shop_id: "shop-1",
          created_at: "2030-03-15T00:00:00.000Z",
          event_type: "subscription_checkout_created",
          payload: { external_reference: "shop_sub:shop-1:1", amount: 25000 },
        },
      ],
      referral_commission_ledger: [],
    });

    expect(result.drafts).toHaveLength(0);
  });

  it("dryRun no escribe nada", async () => {
    const client = stubClient({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 0, net_amount: 40000 }),
      ],
      referral_commission_ledger: [],
    });

    const { createServiceRoleClient } = await import("@/lib/dashboard/auth/server");
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const { syncReferralLedgerInternal } = await import("@/lib/admin/referrals");
    const result = await syncReferralLedgerInternal({ dryRun: true });

    expect(result.inserted).toBe(0);
    expect(result.drafts).toHaveLength(1);
    expect(upserted).toHaveLength(0);
  });

  it("con dryRun off hace upsert por billing_event_id e ignora duplicados", async () => {
    const client = stubClient({
      referral_program_settings: [SETTINGS],
      referral_partners: [partner()],
      referral_attributions: [attribution()],
      shop_billing_events: [
        appliedEvent("e1", "2030-03-15T00:00:00.000Z", { gross_amount: 40000, mp_fee: 1400, net_amount: 38600 }),
      ],
      referral_commission_ledger: [],
    });

    const { createServiceRoleClient } = await import("@/lib/dashboard/auth/server");
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const { syncReferralLedgerInternal } = await import("@/lib/admin/referrals");
    const result = await syncReferralLedgerInternal();

    expect(result.inserted).toBe(1);
    expect(upserted).toHaveLength(1);
    expect(upsertOptions[0]).toMatchObject({ onConflict: "billing_event_id", ignoreDuplicates: true });
  });

  it("el periodo se cuenta en hora Argentina, no en UTC", async () => {
    // El mock global de argentina-time devuelve ISO en UTC, asi que para probar
    // el fix hay que restaurar el calculo real de la zona.
    const time = await import("@/lib/argentina-time");
    const previous = vi.mocked(time.toArgentinaLocalIsoString).getMockImplementation();
    const art = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
    vi.mocked(time.toArgentinaLocalIsoString).mockImplementation(
      (value) => `${art.format(typeof value === "string" ? new Date(value) : value)}T00:00:00` as never,
    );

    try {
      const result = await runSync({
        referral_program_settings: [SETTINGS],
        referral_partners: [partner()],
        referral_attributions: [attribution()],
        shop_billing_events: [
          // 01:00 UTC del 1 de febrero son las 22:00 del 31 de enero en Argentina.
          // Con getUTC* la fila caia en el mes siguiente y el admin la buscaba
          // en el lugar equivocado al pagar.
          appliedEvent("e1", "2030-02-01T01:00:00.000Z", {
            gross_amount: 40000,
            mp_fee: 1400,
            net_amount: 38600,
          }),
        ],
        referral_commission_ledger: [],
      });

      expect(result.drafts[0].period_ym).toBe("2030-01");
    } finally {
      if (previous) vi.mocked(time.toArgentinaLocalIsoString).mockImplementation(previous);
    }
  });
});
