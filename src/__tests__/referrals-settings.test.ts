import { describe, it, expect, vi, beforeEach } from "vitest";
import { chainableQuery } from "./setup";
import type { SupabaseResult } from "./setup";

vi.mock("@/lib/admin/auth", () => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: "admin-1" })),
}));

type Row = Record<string, unknown>;
type Awaitable = (value: SupabaseResult) => unknown;
type Rejectable = (reason: unknown) => unknown;

const DEFAULT_SETTINGS: Row = {
  default_commission_percent: 100,
  default_commission_months: 2,
  fallback_mp_fee_percent: 4,
};

/**
 * Mockea requireSuperAdmin y arma un service-role client donde cada tabla
 * responde segun el escenario.
 */
function setup(options: {
  settingsRow?: Row | null;
  partners?: Row[];
  attributions?: Row[];
  events?: Row[];
  ledger?: Row[];
}) {
  const calls = {
    settingsUpdate: [] as { payload: Row; filter: string }[],
    settingsInsert: [] as Row[],
    ledgerUpsert: [] as { rows: unknown[]; options?: Record<string, unknown> }[],
  };

  const client = {
    from: vi.fn((table: string) => {
      const chain = chainableQuery();

      if (table === "referral_program_settings") {
        chain.eq = vi.fn((column: string, value: unknown) => {
          if (column === "is_default" && value === true) {
            const row = options.settingsRow === undefined ? DEFAULT_SETTINGS : options.settingsRow;
            chain.then = ((onfulfilled?: Awaitable, onrejected?: Rejectable) =>
              Promise.resolve({ data: row, error: null }).then(onfulfilled, onrejected)) as never;
          }
          return chain;
        });
        chain.update = vi.fn((payload: Row) => {
          chain.eq = vi.fn((column: string) => {
            calls.settingsUpdate.push({ payload, filter: column });
            return chain;
          });
          return chain;
        });
        chain.insert = vi.fn((payload: Row) => {
          calls.settingsInsert.push(payload);
          return chain;
        });
        return chain;
      }

      if (table === "referral_commission_ledger") {
        chain.upsert = vi.fn((rows: unknown[], opts?: Record<string, unknown>) => {
          calls.ledgerUpsert.push({ rows, options: opts });
          return chain;
        });
        return chain;
      }

      const data =
        table === "referral_partners"
          ? (options.partners ?? [])
          : table === "referral_attributions"
            ? (options.attributions ?? [])
            : table === "shop_billing_events"
              ? (options.events ?? [])
              : table === "referral_commission_ledger"
                ? (options.ledger ?? [])
                : [];

      chain.then = ((onfulfilled?: Awaitable, onrejected?: Rejectable) =>
        Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)) as never;
      return chain;
    }),
  };

  return { client: client as never, calls };
}

async function load() {
  const { createServiceRoleClient } = await import("@/lib/dashboard/auth/server");
  return { createServiceRoleClient };
}

const partner = (overrides: Row = {}): Row => ({
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
});

const applied = (id: string, createdAt: string, payload: Row = {}): Row => ({
  id,
  shop_id: "shop-1",
  created_at: createdAt,
  event_type: "subscription_payment_applied",
  payload: { payment_id: `pay-${id}`, ...payload },
});

const attr = (overrides: Row = {}): Row => ({
  id: "attr-1",
  shop_id: "shop-1",
  partner_id: "partner-1",
  attributed_at: "2030-03-01T00:00:00+00:00",
  commission_percent_snapshot: 100,
  commission_months_snapshot: 2,
  ...overrides,
});

beforeEach(() => {
  vi.resetModules();
});

describe("corte por fecha de atribucion", () => {
  it("funciona con timestamptz con y sin fraccion de segundo", async () => {
    // Postgres devuelve "2030-03-01T12:00:00+00:00" en unos casos y
    // "2030-03-01T12:00:00.123456+00:00" en otros. Comparar como string las
    // ordena mal: '.' (0x2E) > '+' (0x2B).
    const cases: Array<{ attributedAt: string; eventAt: string; expected: string[] }> = [
      // Evento 1.2s DESPUES de la atribucion (atribucion sin fraccion).
      {
        attributedAt: "2030-03-01T12:00:00+00:00",
        eventAt: "2030-03-01T12:00:01.123456+00:00",
        expected: ["e1"],
      },
      // Evento 0.5s DESPUES de la atribucion (atribucion con fraccion).
      {
        attributedAt: "2030-03-01T12:00:00.500000+00:00",
        eventAt: "2030-03-01T12:00:01+00:00",
        expected: ["e1"],
      },
      // Evento 0.2s ANTES de la atribucion (atribucion con fraccion): no cuenta.
      {
        attributedAt: "2030-03-01T12:00:01.000000+00:00",
        eventAt: "2030-03-01T12:00:00.800000+00:00",
        expected: [],
      },
      // Evento 0.2s ANTES de la atribucion (atribucion sin fraccion): no cuenta.
      {
        attributedAt: "2030-03-01T12:00:01+00:00",
        eventAt: "2030-03-01T12:00:00.800000+00:00",
        expected: [],
      },
    ];

    for (const { attributedAt, eventAt, expected } of cases) {
      const { client } = setup({
        partners: [partner()],
        attributions: [attr({ attributed_at: attributedAt })],
        events: [applied("e1", eventAt, { gross_amount: 40000, mp_fee: 0, net_amount: 40000 })],
        ledger: [],
      });

      const { createServiceRoleClient } = await load();
      vi.mocked(createServiceRoleClient).mockResolvedValue(client);
      const { syncReferralLedgerInternal } = await import("@/lib/admin/referrals");

      const result = await syncReferralLedgerInternal({ dryRun: true });
      expect(result.drafts.map((d) => d.billing_event_id)).toEqual(expected);
    }
  });
});

describe("updateReferralProgramSettings", () => {
  it("actualiza la fila default existente por id", async () => {
    const { client, calls } = setup({ settingsRow: { id: "settings-1", ...DEFAULT_SETTINGS } });
    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);
    const { updateReferralProgramSettings } = await import("@/lib/admin/referrals");

    const result = await updateReferralProgramSettings({
      defaultCommissionPercent: 80,
      defaultCommissionMonths: 3,
    });

    expect(result.success).toBe(true);
    expect(calls.settingsInsert).toHaveLength(0);
    expect(calls.settingsUpdate).toHaveLength(1);
    expect(calls.settingsUpdate[0].filter).toBe("id");
    expect(calls.settingsUpdate[0].payload).toMatchObject({
      default_commission_percent: 80,
      default_commission_months: 3,
    });
  });

  it("inserta si la fila default no existe (no falla en silencio)", async () => {
    const { client, calls } = setup({ settingsRow: null });
    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);
    const { updateReferralProgramSettings } = await import("@/lib/admin/referrals");

    const result = await updateReferralProgramSettings({
      defaultCommissionPercent: 60,
      defaultCommissionMonths: 1,
    });

    expect(result.success).toBe(true);
    expect(calls.settingsInsert).toHaveLength(1);
    expect(calls.settingsInsert[0]).toMatchObject({
      default_commission_percent: 60,
      default_commission_months: 1,
      is_default: true,
    });
  });

  it("guarda el fee de MP solo si viene informado", async () => {
    const { client, calls } = setup({ settingsRow: { id: "settings-1", ...DEFAULT_SETTINGS } });
    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);
    const { updateReferralProgramSettings } = await import("@/lib/admin/referrals");

    await updateReferralProgramSettings({
      defaultCommissionPercent: 100,
      defaultCommissionMonths: 2,
    });
    expect(calls.settingsUpdate[0].payload).not.toHaveProperty("fallback_mp_fee_percent");

    await updateReferralProgramSettings({
      defaultCommissionPercent: 100,
      defaultCommissionMonths: 2,
      fallbackMpFeePercent: 5.5,
    });
    expect(calls.settingsUpdate[1].payload).toMatchObject({ fallback_mp_fee_percent: 5.5 });
  });

  it("rechaza valores fuera de rango antes de tocar la base", async () => {
    const { client, calls } = setup({ settingsRow: { id: "settings-1", ...DEFAULT_SETTINGS } });
    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);
    const { updateReferralProgramSettings } = await import("@/lib/admin/referrals");

    expect(
      (await updateReferralProgramSettings({ defaultCommissionPercent: 120, defaultCommissionMonths: 2 })).success,
    ).toBe(false);
    expect(
      (await updateReferralProgramSettings({ defaultCommissionPercent: 100, defaultCommissionMonths: 30 })).success,
    ).toBe(false);
    expect(
      (
        await updateReferralProgramSettings({
          defaultCommissionPercent: 100,
          defaultCommissionMonths: 2,
          fallbackMpFeePercent: 99,
        })
      ).success,
    ).toBe(false);

    expect(calls.settingsUpdate).toHaveLength(0);
    expect(calls.settingsInsert).toHaveLength(0);
  });

  it("acepta 0% y 0 meses como valores validos", async () => {
    const { client, calls } = setup({ settingsRow: { id: "settings-1", ...DEFAULT_SETTINGS } });
    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);
    const { updateReferralProgramSettings } = await import("@/lib/admin/referrals");

    const result = await updateReferralProgramSettings({
      defaultCommissionPercent: 0,
      defaultCommissionMonths: 0,
    });

    expect(result.success).toBe(true);
    expect(calls.settingsUpdate[0].payload).toMatchObject({
      default_commission_percent: 0,
      default_commission_months: 0,
    });
  });
});

describe("updateReferralPartnerPayout", () => {
  it("normaliza el CBU sacando espacios", async () => {
    const updates: { payload: Row }[] = [];
    const client = {
      from: vi.fn(() => {
        const chain = chainableQuery();
        chain.update = vi.fn((payload: Row) => {
          updates.push({ payload });
          return chain;
        });
        return chain;
      }),
    } as never;

    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);
    const { updateReferralPartnerPayout } = await import("@/lib/admin/referrals");

    const result = await updateReferralPartnerPayout({
      partnerId: "partner-1",
      payoutAlias: "  klip.juan  ",
      payoutCbu: "0000 9999 8888 7777 6666 55",
    });

    expect(result.success).toBe(true);
    expect(updates[0].payload).toMatchObject({
      payout_alias: "klip.juan",
      payout_cbu: "0000999988887777666655",
    });
  });

  it("rechaza un CBU que no tiene 22 digitos", async () => {
    const updates: Row[] = [];
    const client = {
      from: vi.fn(() => {
        const chain = chainableQuery();
        chain.update = vi.fn((payload: Row) => {
          updates.push(payload);
          return chain;
        });
        return chain;
      }),
    } as never;

    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);
    const { updateReferralPartnerPayout } = await import("@/lib/admin/referrals");

    const result = await updateReferralPartnerPayout({
      partnerId: "partner-1",
      payoutAlias: null,
      payoutCbu: "123",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("22");
    expect(updates).toHaveLength(0);
  });
});

describe("regeneratePartnerPin", () => {
  it("no toca la identidad del vendedor, solo el hash", async () => {
    const updates: { payload: Row }[] = [];
    const client = {
      from: vi.fn((table: string) => {
        const chain = chainableQuery();
        if (table === "referral_partners") {
          chain.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: "partner-1" },
            error: null,
          } as never);
          chain.update = vi.fn((payload: Row) => {
            updates.push({ payload });
            return chain;
          });
        }
        return chain;
      }),
    } as never;

    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);
    const { regeneratePartnerPin } = await import("@/lib/admin/referrals");

    const result = await regeneratePartnerPin("partner-1");

    expect(result.success).toBe(true);
    expect(result.pin).toMatch(/^\d{6}$/);

    const payload = updates[0].payload;
    expect(Object.keys(payload).sort()).toEqual(["pin_hash", "pin_last4", "pin_updated_at", "updated_at"]);
    expect(payload.pin_hash).toMatch(/^scrypt:/);
    expect(payload.pin_last4).toBe(result.pin!.slice(-4));
  });
});

describe("el sync no lee la tabla de eventos completa", () => {
  /**
   * Los stubs por tabla ignoran los filtros, asi que hay que observar los
   * argumentos de .in() para probar que el sync acota la consulta.
   */
  function recordingClient(options: { attributions: Row[]; events?: Row[] }) {
    const inFilters: Array<{ column: string; values: unknown[] }> = [];
    const limits: number[] = [];
    const queriedTables: string[] = [];

    const client = {
      from: vi.fn((table: string) => {
        queriedTables.push(table);
        const chain = chainableQuery();

        if (table === "referral_program_settings") {
          chain.eq = vi.fn(() => chain);
          chain.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: "settings-1", default_commission_percent: 100, default_commission_months: 2, fallback_mp_fee_percent: 4 },
            error: null,
          } as never);
          return chain;
        }

        if (table === "shop_billing_events") {
          chain.in = vi.fn((column: string, values: unknown[]) => {
            inFilters.push({ column, values });
            return chain;
          });
          chain.limit = vi.fn((value: number) => {
            limits.push(value);
            return chain;
          });
          chain.order = vi.fn(() => chain);
          chain.then = ((onfulfilled?: Awaitable, onrejected?: Rejectable) =>
            Promise.resolve({ data: options.events ?? [], error: null }).then(
              onfulfilled,
              onrejected,
            )) as never;
          return chain;
        }

        const data =
          table === "referral_partners"
            ? [partner()]
            : table === "referral_attributions"
              ? options.attributions
              : table === "referral_commission_ledger"
                ? []
                : [];

        chain.then = ((onfulfilled?: Awaitable, onrejected?: Rejectable) =>
          Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)) as never;
        return chain;
      }),
    };

    return { client: client as never, inFilters, limits, queriedTables };
  }

  it("filtra los eventos por los locales referidos", async () => {
    const stub = recordingClient({
      attributions: [
        attr({ shop_id: "shop-1" }),
        attr({ id: "attr-2", shop_id: "shop-2" }),
      ],
    });
    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(stub.client);
    const { syncReferralLedgerInternal } = await import("@/lib/admin/referrals");

    await syncReferralLedgerInternal({ dryRun: true });

    const shopFilter = stub.inFilters.find((f) => f.column === "shop_id");
    expect(shopFilter).toBeDefined();
    expect(new Set(shopFilter!.values)).toEqual(new Set(["shop-1", "shop-2"]));

    // Y sigue acotando por event_type.
    expect(stub.inFilters.some((f) => f.column === "event_type")).toBe(true);
  });

  it("pone un tope explicito a la cantidad de eventos", async () => {
    const stub = recordingClient({ attributions: [attr({ shop_id: "shop-1" })] });
    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(stub.client);
    const { syncReferralLedgerInternal } = await import("@/lib/admin/referrals");

    await syncReferralLedgerInternal({ dryRun: true });

    expect(stub.limits).toHaveLength(1);
    expect(stub.limits[0]).toBeGreaterThan(1000);
  });

  it("sin atribuciones no toca la tabla de eventos", async () => {
    const stub = recordingClient({ attributions: [] });
    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(stub.client);
    const { syncReferralLedgerInternal } = await import("@/lib/admin/referrals");

    const result = await syncReferralLedgerInternal({ dryRun: true });

    expect(result.drafts).toHaveLength(0);
    expect(stub.queriedTables).not.toContain("shop_billing_events");
  });

  it("si se supera el tope falla en vez de calcular comisiones incompletas", async () => {
    const stub = recordingClient({
      attributions: [attr({ shop_id: "shop-1" })],
      events: Array.from({ length: 5001 }, (_, i) => applied(`e${i}`, "2030-03-15T00:00:00.000Z")),
    });
    const { createServiceRoleClient } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(stub.client);
    const { syncReferralLedgerInternal } = await import("@/lib/admin/referrals");

    await expect(syncReferralLedgerInternal({ dryRun: true })).rejects.toThrow(/tope de 5000/);
  });
});
