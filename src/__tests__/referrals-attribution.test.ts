import { describe, it, expect, vi, beforeEach } from "vitest";
import { chainableQuery } from "./setup";
import type { SupabaseResult } from "./setup";

type Row = Record<string, unknown>;
type Awaitable = (value: SupabaseResult) => unknown;
type Rejectable = (reason: unknown) => unknown;

function stubClient(opts: {
  partner?: Row | null;
  existingAttribution?: Row | null;
  insertError?: { code?: string; message?: string } | null;
}) {
  const calls = { attributionsInserted: [] as Row[] };

  const client = {
    from: vi.fn((table: string) => {
      const chain = chainableQuery();

      const resolve = (): { data: unknown; error: unknown } => {
        if (table === "referral_partners") return { data: opts.partner ?? null, error: null };
        if (table === "referral_attributions") {
          if (calls.attributionsInserted.length > 0) return { data: null, error: null };
          return { data: opts.existingAttribution ?? null, error: null };
        }
        if (table === "referral_program_settings") {
          return {
            data: { default_commission_percent: 100, default_commission_months: 2, fallback_mp_fee_percent: 4 },
            error: null,
          };
        }
        return { data: null, error: null };
      };

      chain.then = ((onfulfilled?: Awaitable, onrejected?: Rejectable) =>
        Promise.resolve(resolve()).then(onfulfilled, onrejected)) as never;

      chain.insert = vi.fn((values: Row) => {
        calls.attributionsInserted.push(values);
        const chain2 = chainableQuery();
        chain2.then = ((onfulfilled?: Awaitable, onrejected?: Rejectable) =>
          Promise.resolve({ data: null, error: opts.insertError ?? null }).then(
            onfulfilled,
            onrejected,
          )) as never;
        return chain2;
      });

      return chain;
    }),
  };

  return { client: client as never, calls };
}

const PARTNER: Row = {
  id: "partner-1",
  referral_code: "JUAN123",
  is_active: true,
  commission_percent_override: null,
  commission_months_override: null,
};

async function load() {
  const { createServiceRoleClient } = await import("@/lib/dashboard/auth/server");
  const { attributeShopToPartner, findActivePartnerByCode, recordReferralLinkClick } = await import(
    "@/lib/admin/referrals"
  );
  return { createServiceRoleClient, attributeShopToPartner, findActivePartnerByCode, recordReferralLinkClick };
}

beforeEach(() => {
  vi.resetModules();
});

describe("findActivePartnerByCode", () => {
  it("devuelve el vendedor si el codigo existe", async () => {
    const { client } = stubClient({ partner: { id: "partner-1", name: "Juan", referral_code: "juan123" } });
    const { createServiceRoleClient, findActivePartnerByCode } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    expect(await findActivePartnerByCode("JUAN123")).toEqual({
      id: "partner-1",
      name: "Juan",
      referral_code: "juan123",
    });
  });

  it("devuelve null si no hay vendedor", async () => {
    const { client } = stubClient({ partner: null });
    const { createServiceRoleClient, findActivePartnerByCode } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    expect(await findActivePartnerByCode("nada")).toBeNull();
  });

  it("devuelve null con codigo vacio sin tocar la base", async () => {
    const { client } = stubClient({ partner: PARTNER });
    const { createServiceRoleClient, findActivePartnerByCode } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    expect(await findActivePartnerByCode("   ")).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("attributeShopToPartner - gana el primero", () => {
  it("asigna el local si todavia no tiene vendedor", async () => {
    const { client, calls } = stubClient({ partner: PARTNER, existingAttribution: null });
    const { createServiceRoleClient, attributeShopToPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await attributeShopToPartner({ shopId: "shop-1", partnerId: "partner-1" });

    expect(result.outcome).toBe("attributed");
    expect(calls.attributionsInserted).toHaveLength(1);
    expect(calls.attributionsInserted[0]).toMatchObject({
      shop_id: "shop-1",
      partner_id: "partner-1",
      referral_code_snapshot: "JUAN123",
      commission_percent_snapshot: 100,
      commission_months_snapshot: 2,
    });
  });

  it("no pisa una atribucion de otro vendedor: devuelve already_taken", async () => {
    const { client, calls } = stubClient({
      partner: PARTNER,
      existingAttribution: { id: "attr-1", partner_id: "partner-otro" },
    });
    const { createServiceRoleClient, attributeShopToPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await attributeShopToPartner({ shopId: "shop-1", partnerId: "partner-1" });

    expect(result.outcome).toBe("already_taken");
    expect(result.ownerPartnerId).toBe("partner-otro");
    expect(result.code).toBe("JUAN123");
    expect(calls.attributionsInserted).toHaveLength(0);
  });

  it("el mismo vendedor que vuelve a entrar es idempotente", async () => {
    const { client, calls } = stubClient({
      partner: PARTNER,
      existingAttribution: { id: "attr-1", partner_id: "partner-1" },
    });
    const { createServiceRoleClient, attributeShopToPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await attributeShopToPartner({ shopId: "shop-1", partnerId: "partner-1" });

    expect(result.outcome).toBe("attributed");
    expect(calls.attributionsInserted).toHaveLength(0);
  });

  it("carrera perdida: si el insert choca con el unique, gana el otro", async () => {
    const { client } = stubClient({
      partner: PARTNER,
      existingAttribution: null,
      insertError: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const { createServiceRoleClient, attributeShopToPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await attributeShopToPartner({ shopId: "shop-1", partnerId: "partner-1" });

    expect(result.outcome).toBe("already_taken");
  });

  it("un vendedor desactivado no se queda con el local", async () => {
    const { client, calls } = stubClient({
      partner: { ...PARTNER, is_active: false },
      existingAttribution: null,
    });
    const { createServiceRoleClient, attributeShopToPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await attributeShopToPartner({ shopId: "shop-1", partnerId: "partner-1" });

    expect(result.outcome).toBe("already_taken");
    expect(calls.attributionsInserted).toHaveLength(0);
  });

  it("usa los overrides del vendedor para el snapshot", async () => {
    const { client, calls } = stubClient({
      partner: { ...PARTNER, commission_percent_override: 30, commission_months_override: 5 },
      existingAttribution: null,
    });
    const { createServiceRoleClient, attributeShopToPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    await attributeShopToPartner({ shopId: "shop-1", partnerId: "partner-1" });

    expect(calls.attributionsInserted[0]).toMatchObject({
      commission_percent_snapshot: 30,
      commission_months_snapshot: 5,
    });
  });

  it("un 0% de override queda en el snapshot como 0", async () => {
    const { client, calls } = stubClient({
      partner: { ...PARTNER, commission_percent_override: 0 },
      existingAttribution: null,
    });
    const { createServiceRoleClient, attributeShopToPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    await attributeShopToPartner({ shopId: "shop-1", partnerId: "partner-1" });

    expect(calls.attributionsInserted[0].commission_percent_snapshot).toBe(0);
  });

  it("no hace nada con shopId o partnerId vacios", async () => {
    const { client } = stubClient({ partner: PARTNER, existingAttribution: null });
    const { createServiceRoleClient, attributeShopToPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    expect((await attributeShopToPartner({ shopId: " ", partnerId: "partner-1" })).outcome).toBe(
      "not_a_shop",
    );
    expect((await attributeShopToPartner({ shopId: "shop-1", partnerId: "" })).outcome).toBe(
      "not_a_shop",
    );
  });

  it("vendedor inexistente no atribuye", async () => {
    const { client, calls } = stubClient({ partner: null, existingAttribution: null });
    const { createServiceRoleClient, attributeShopToPartner } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    expect((await attributeShopToPartner({ shopId: "shop-1", partnerId: "fantasma" })).outcome).toBe(
      "not_a_shop",
    );
    expect(calls.attributionsInserted).toHaveLength(0);
  });
});

describe("recordReferralLinkClick", () => {
  it("guarda el click con el resultado de la atribucion", async () => {
    const inserted: Row[] = [];
    const client = {
      from: vi.fn(() => {
        const chain = chainableQuery();
        chain.insert = vi.fn((values: Row) => {
          inserted.push(values);
          return chain;
        });
        return chain;
      }),
    } as never;

    const { createServiceRoleClient, recordReferralLinkClick } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await recordReferralLinkClick({
      partnerId: "partner-1",
      shopId: "shop-1",
      code: "JUAN123",
      outcome: "already_taken",
    });

    expect(result.success).toBe(true);
    expect(inserted[0]).toMatchObject({
      partner_id: "partner-1",
      shop_id: "shop-1",
      outcome: "already_taken",
    });
  });
});
