import { describe, it, expect, vi, beforeEach } from "vitest";
import { chainableQuery } from "./setup";
import type { SupabaseResult } from "./setup";

vi.mock("@/lib/admin/auth", () => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: "admin-1" })),
}));

type Row = Record<string, unknown>;
type Awaitable = (value: SupabaseResult) => unknown;

/**
 * Tests de regresion de los tres caminos que perdian plata en el panel de
 * referidos. Cada uno documenta el bug que evita volver a aparecer.
 */
type Recorder = {
  updates: Array<{ table: string; values: Row }>;
  inserts: Array<{ table: string; values: Row }>;
  deletes: Array<{ table: string }>;
  filters: Array<{ table: string; column: string; value: unknown }>;
};

function stubClient(opts: {
  partner?: Row | null;
  existingAttribution?: Row | null;
  existingPartner?: Row | null;
  cancelledRows?: Row[];
} = {}) {
  const rec: Recorder = { updates: [], inserts: [], deletes: [], filters: [] };

  const client = {
    from: vi.fn((table: string) => {
      const chain = chainableQuery();

      const resolve = (): { data: unknown; error: unknown } => {
        if (table === "referral_partners" && opts.existingPartner) {
          return { data: opts.existingPartner, error: null };
        }
        if (table === "referral_partners") return { data: opts.partner ?? null, error: null };
        if (table === "referral_attributions") {
          if (rec.inserts.some((i) => i.table === "referral_attributions")) {
            return { data: null, error: null };
          }
          return { data: opts.existingAttribution ?? null, error: null };
        }
        if (table === "referral_commission_ledger") {
          return { data: opts.cancelledRows ?? [], error: null };
        }
        if (table === "referral_program_settings") {
          return {
            data: { default_commission_percent: 100, default_commission_months: 2, fallback_mp_fee_percent: 4 },
            error: null,
          };
        }
        return { data: null, error: null };
      };

      chain.then = ((onfulfilled?: Awaitable, onrejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onfulfilled, onrejected)) as never;

      chain.update = vi.fn((values: Row) => {
        rec.updates.push({ table, values });
        return chain;
      });
      chain.insert = vi.fn((values: Row) => {
        rec.inserts.push({ table, values });
        return chain;
      });
      chain.delete = vi.fn(() => {
        rec.deletes.push({ table });
        return chain;
      });
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn((column: string, value: unknown) => {
        rec.filters.push({ table, column, value });
        return chain;
      });
      chain.in = vi.fn(() => chain);

      return chain;
    }),
  };

  return { client: client as never, rec };
}

async function load() {
  const { createServiceRoleClient } = await import("@/lib/dashboard/auth/server");
  return {
    createServiceRoleClient,
    ...(await import("@/lib/admin/referrals")),
  };
}

async function loadPartnerPortal() {
  const { createServiceRoleClient } = await import("@/lib/dashboard/auth/server");
  return {
    createServiceRoleClient,
    ...(await import("@/lib/referrals/partner-portal")),
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe("editar un vendedor no borra sus datos de cobro", () => {
  it("upsertReferralPartner sin payout no toca alias ni CBU", async () => {
    const { client, rec } = stubClient({ existingPartner: { id: "partner-1" } });
    const { createServiceRoleClient, upsertReferralPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await upsertReferralPartner({
      partnerId: "partner-1",
      name: "Ana Gonzalez",
      referralCode: "ana",
      isActive: true,
    });

    expect(result.success).toBe(true);
    const update = rec.updates.find((u) => u.table === "referral_partners");
    expect(update).toBeDefined();
    // El bug: el payload llevaba siempre `payout_alias: input.payoutAlias || null`,
    // asi que guardar el nombre vaciaba los datos de cobro que Klip ya tenia.
    expect(update?.values).not.toHaveProperty("payout_alias");
    expect(update?.values).not.toHaveProperty("payout_cbu");
    expect(update?.values).toMatchObject({ name: "Ana Gonzalez" });
  });

  it("upsertReferralPartner si escribe el payout si viene", async () => {
    const { client, rec } = stubClient({ existingPartner: { id: "partner-1" } });
    const { createServiceRoleClient, upsertReferralPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    await upsertReferralPartner({
      partnerId: "partner-1",
      name: "Ana Gonzalez",
      referralCode: "ana",
      payoutAlias: "ana.gonzalez",
      payoutCbu: "1234567890123456789012",
      isActive: true,
    });

    const update = rec.updates.find((u) => u.table === "referral_partners");
    expect(update?.values).toMatchObject({
      payout_alias: "ana.gonzalez",
      payout_cbu: "1234567890123456789012",
    });
  });

  it("upsertReferralPartner al crear si siembra el payout en null", async () => {
    const { client, rec } = stubClient();
    const { createServiceRoleClient, upsertReferralPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    await upsertReferralPartner({ name: "Beto", referralCode: "beto", isActive: true });

    const insert = rec.inserts.find((i) => i.table === "referral_partners");
    expect(insert?.values).toMatchObject({ payout_alias: null, payout_cbu: null });
  });

  it("updateReferralPartnerOverrides no borra los datos de cobro", async () => {
    const { client, rec } = stubClient();
    const { createServiceRoleClient, updateReferralPartnerOverrides } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await updateReferralPartnerOverrides({
      partnerId: "partner-1",
      commissionPercentOverride: 50,
      isActive: true,
    });

    expect(result.success).toBe(true);
    const update = rec.updates.find((u) => u.table === "referral_partners");
    expect(update?.values).not.toHaveProperty("payout_alias");
    expect(update?.values).not.toHaveProperty("payout_cbu");
    expect(update?.values).toMatchObject({ commission_percent_override: 50 });
  });
});

describe("reasignar el mismo vendedor no reinicia el reloj de comision", () => {
  const PARTNER: Row = {
    id: "partner-1",
    referral_code: "ana",
    is_active: true,
    commission_percent_override: null,
    commission_months_override: null,
  };

  it("no escribe nada si el local ya era de ese vendedor", async () => {
    const { client, rec } = stubClient({
      partner: PARTNER,
      existingAttribution: { id: "attr-1", partner_id: "partner-1" },
    });
    const { createServiceRoleClient, assignReferralToShop } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await assignReferralToShop({ shopId: "shop-1", partnerId: "partner-1" });

    expect(result.success).toBe(true);
    // El bug: `attributed_at` se pisaba siempre con now(). buildLedgerDrafts
    // cuenta solo los pagos posteriores y reinicia payment_sequence desde 1, asi
    // que guardar el formulario sin cambiar nada regalaba N meses de comision.
    expect(rec.updates.filter((u) => u.table === "referral_attributions")).toHaveLength(0);
    expect(rec.inserts.filter((i) => i.table === "referral_attributions")).toHaveLength(0);
  });

  it("reinicia el reloj si el local cambia de vendedor", async () => {
    const { client, rec } = stubClient({
      partner: PARTNER,
      existingAttribution: { id: "attr-1", partner_id: "partner-0" },
    });
    const { createServiceRoleClient, assignReferralToShop } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await assignReferralToShop({ shopId: "shop-1", partnerId: "partner-1" });

    expect(result.success).toBe(true);
    const update = rec.updates.find((u) => u.table === "referral_attributions");
    expect(update?.values).toMatchObject({ partner_id: "partner-1" });
    expect(update?.values).toHaveProperty("attributed_at");
  });
});

describe("desasignar un local deja de dejar comisiones pagables", () => {
  it("cancela las filas pending y needs_review del local", async () => {
    const { client, rec } = stubClient({ cancelledRows: [{ id: "l1" }, { id: "l2" }] });
    const { createServiceRoleClient, deleteReferralAttribution } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await deleteReferralAttribution("shop-1");

    expect(result.success).toBe(true);
    expect(rec.deletes).toContainEqual({ table: "referral_attributions" });

    const cancel = rec.updates.find((u) => u.table === "referral_commission_ledger");
    expect(cancel?.values).toMatchObject({ status: "cancelled" });
    expect(rec.filters).toContainEqual({ table: "referral_commission_ledger", column: "shop_id", value: "shop-1" });
    // Nunca tocar las 'paid': son historia contable.
    const inCall = rec.filters.filter((f) => f.table === "referral_commission_ledger" && f.column === "shop_id");
    expect(inCall).toHaveLength(1);
  });

  it("propaga el error si falla el delete", async () => {
    const chain = chainableQuery();
    chain.then = ((onfulfilled?: Awaitable) =>
      Promise.resolve({ data: null, error: { message: "boom" } }).then(onfulfilled)) as never;
    chain.delete = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    const client = { from: vi.fn(() => chain) } as never;

    const { createServiceRoleClient, deleteReferralAttribution } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await deleteReferralAttribution("shop-1");

    expect(result).toEqual({ success: false, error: "boom" });
  });
});

describe("cerrar un pago sin neto conocido", () => {
  function reviewStub(row: Row | null, updateError: unknown = null) {
    const rec: Recorder = { updates: [], inserts: [], deletes: [], filters: [] };
    const chain = chainableQuery();
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => chain);
    chain.update = vi.fn((values: Row) => {
      rec.updates.push({ table: "referral_commission_ledger", values });
      chain.then = ((onfulfilled?: Awaitable) =>
        Promise.resolve({ data: null, error: updateError }).then(onfulfilled)) as never;
      return chain;
    });
    chain.then = ((onfulfilled?: Awaitable) =>
      Promise.resolve({ data: row, error: null }).then(onfulfilled)) as never;

    return { client: { from: vi.fn(() => chain) } as never, rec };
  }

  const NEEDS_REVIEW: Row = {
    id: "l1",
    status: "needs_review",
    commission_percent: 100,
    amount_source: "unknown",
  };

  it("recalcula la comision sobre el neto cargado", async () => {
    const { client, rec } = reviewStub(NEEDS_REVIEW);
    const { createServiceRoleClient, resolveNeedsReviewLedgerRow } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await resolveNeedsReviewLedgerRow({ ledgerId: "l1", netAmount: 23900 });

    expect(result).toEqual({ success: true, commissionAmount: 23900 });
    expect(rec.updates[0].values).toMatchObject({
      net_amount: 23900,
      commission_amount: 23900,
      status: "pending",
      amount_source: "manual_review",
    });
  });

  it("aplica el porcentaje del vendedor, no el 100 por default", async () => {
    const { client, rec } = reviewStub({ ...NEEDS_REVIEW, commission_percent: 50 });
    const { createServiceRoleClient, resolveNeedsReviewLedgerRow } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await resolveNeedsReviewLedgerRow({ ledgerId: "l1", netAmount: 23900 });

    expect(result.commissionAmount).toBe(11950);
    expect(rec.updates[0].values).toMatchObject({ commission_amount: 11950 });
  });

  it("redondea a dos decimales", async () => {
    const { client, rec } = reviewStub({ ...NEEDS_REVIEW, commission_percent: 33 });
    const { createServiceRoleClient, resolveNeedsReviewLedgerRow } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    await resolveNeedsReviewLedgerRow({ ledgerId: "l1", netAmount: 12345.67 });

    expect(rec.updates[0].values.commission_amount).toBe(4074.07);
  });

  it("rechaza un neto de 0 o negativo", async () => {
    const { client, rec } = reviewStub(NEEDS_REVIEW);
    const { createServiceRoleClient, resolveNeedsReviewLedgerRow } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    expect((await resolveNeedsReviewLedgerRow({ ledgerId: "l1", netAmount: 0 })).success).toBe(false);
    expect((await resolveNeedsReviewLedgerRow({ ledgerId: "l1", netAmount: -5 })).success).toBe(false);
    expect(rec.updates).toHaveLength(0);
  });

  it("no toca una fila que ya no esta para revisar", async () => {
    const { client, rec } = reviewStub({ ...NEEDS_REVIEW, status: "paid" });
    const { createServiceRoleClient, resolveNeedsReviewLedgerRow } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await resolveNeedsReviewLedgerRow({ ledgerId: "l1", netAmount: 23900 });

    expect(result.success).toBe(false);
    expect(rec.updates).toHaveLength(0);
  });

  it("da error si la fila no existe", async () => {
    const { client, rec } = reviewStub(null);
    const { createServiceRoleClient, resolveNeedsReviewLedgerRow } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await resolveNeedsReviewLedgerRow({ ledgerId: "nope", netAmount: 23900 });

    expect(result.success).toBe(false);
    expect(rec.updates).toHaveLength(0);
  });
});

describe("el vendedor carga sus propios datos de cobro", () => {
  function payoutStub() {
    const rec: Recorder = { updates: [], inserts: [], deletes: [], filters: [] };
    const chain = chainableQuery();
    chain.then = ((onfulfilled?: Awaitable) => Promise.resolve({ data: null, error: null }).then(onfulfilled)) as never;
    chain.update = vi.fn((values: Row) => {
      rec.updates.push({ table: "referral_partners", values });
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    return { client: { from: vi.fn(() => chain) } as never, rec };
  }

  it("guarda alias y CBU", async () => {
    const { client, rec } = payoutStub();
    const { createServiceRoleClient, saveOwnPayoutDetails } = await loadPartnerPortal();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await saveOwnPayoutDetails("partner-1", {
      payoutAlias: "ana.gonzalez",
      payoutCbu: "0001234567890123456789",
    });

    expect(result).toEqual({ success: true });
    expect(rec.updates[0].values).toMatchObject({
      payout_alias: "ana.gonzalez",
      payout_cbu: "0001234567890123456789",
    });
  });

  it("normaliza el CBU antes de guardarlo", async () => {
    const { client, rec } = payoutStub();
    const { createServiceRoleClient, saveOwnPayoutDetails } = await loadPartnerPortal();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    await saveOwnPayoutDetails("partner-1", {
      payoutAlias: "ana",
      payoutCbu: " 0001 2345 6789 0123 4567 89 ",
    });

    expect(rec.updates[0].values).toMatchObject({ payout_cbu: "0001234567890123456789" });
  });

  it("rechaza un CBU que no tiene 22 digitos", async () => {
    const { client, rec } = payoutStub();
    const { createServiceRoleClient, saveOwnPayoutDetails } = await loadPartnerPortal();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await saveOwnPayoutDetails("partner-1", { payoutAlias: "ana", payoutCbu: "123" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("22");
    expect(rec.updates).toHaveLength(0);
  });

  it("rechaza borrar los dos campos a la vez", async () => {
    const { client, rec } = payoutStub();
    const { createServiceRoleClient, saveOwnPayoutDetails } = await loadPartnerPortal();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await saveOwnPayoutDetails("partner-1", { payoutAlias: "  ", payoutCbu: "" });

    expect(result.success).toBe(false);
    expect(rec.updates).toHaveLength(0);
  });

  it("sin partnerId no escribe nada", async () => {
    const { client, rec } = payoutStub();
    const { createServiceRoleClient, saveOwnPayoutDetails } = await loadPartnerPortal();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await saveOwnPayoutDetails("  ", { payoutAlias: "ana", payoutCbu: null });

    expect(result.success).toBe(false);
    expect(rec.updates).toHaveLength(0);
  });
});
