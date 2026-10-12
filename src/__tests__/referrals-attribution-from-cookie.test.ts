import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { chainableQuery } from "./setup";

type Row = Record<string, unknown>;

/**
 * El helper que cierra la atribucion de un alta que vino de un link /r/<codigo>.
 *
 * La cookie es lo unico que conecta al vendedor con el local: si la cookie no
 * es valida, no hay nada que atribuir, y si es valida el local queda con el
 * vendedor y con la traza del click.
 */

function stubAdmin(opts: {
  partner?: Row | null;
  existingAttribution?: Row | null;
  insertError?: { code?: string; message?: string } | null;
}) {
  const calls = { attributions: [] as Row[], clicks: [] as Row[] };

  const client = {
    from: vi.fn((table: string) => {
      const chain = chainableQuery();

      const resolve = () => {
        if (table === "referral_partners") return { data: opts.partner ?? null, error: null };
        if (table === "referral_attributions") {
          if (calls.attributions.length > 0) return { data: null, error: null };
          return { data: opts.existingAttribution ?? null, error: null };
        }
        if (table === "referral_program_settings") {
          return {
            data: {
              default_commission_percent: 100,
              default_commission_months: 2,
              fallback_mp_fee_percent: 4,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      };

      chain.then = ((onfulfilled?: (v: unknown) => unknown, onrejected?: (r: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onfulfilled, onrejected)) as never;

      chain.insert = vi.fn((values: Row) => {
        if (table === "referral_attributions") calls.attributions.push(values);
        if (table === "referral_link_clicks") calls.clicks.push(values);
        const next = chainableQuery();
        next.then = ((onfulfilled?: (v: unknown) => unknown, onrejected?: (r: unknown) => unknown) =>
          Promise.resolve({ data: null, error: opts.insertError ?? null }).then(
            onfulfilled,
            onrejected,
          )) as never;
        return next;
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
  const { attributeShopFromReferralCookie } = await import("@/lib/referrals/attribute-from-cookie");
  const { createReferralCookieToken } = await import("@/lib/referrals/partner-auth");
  return { createServiceRoleClient, attributeShopFromReferralCookie, createReferralCookieToken };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("REFERRAL_PORTAL_SECRET", "test-referral-secret");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("cookie ausente o invalida", () => {
  it("sin cookie no toca la base", async () => {
    const { client, calls } = stubAdmin({ partner: PARTNER });
    const { createServiceRoleClient, attributeShopFromReferralCookie } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    expect(await attributeShopFromReferralCookie({ shopId: "shop-1", cookieValue: undefined })).toBeNull();
    expect(await attributeShopFromReferralCookie({ shopId: "shop-1", cookieValue: null })).toBeNull();
    expect(await attributeShopFromReferralCookie({ shopId: "shop-1", cookieValue: "" })).toBeNull();

    expect(calls.attributions).toHaveLength(0);
    expect(calls.clicks).toHaveLength(0);
  });

  it("una cookie con firma invalida no atribuye", async () => {
    const { client, calls } = stubAdmin({ partner: PARTNER });
    const { createServiceRoleClient, attributeShopFromReferralCookie } = await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await attributeShopFromReferralCookie({
      shopId: "shop-1",
      cookieValue: "partner-falso.firma-arbitraria",
    });

    expect(result).toBeNull();
    expect(calls.attributions).toHaveLength(0);
  });

  it("una cookie firmada con otro secret no atribuye", async () => {
    const { client, calls } = stubAdmin({ partner: PARTNER });
    const { createServiceRoleClient, attributeShopFromReferralCookie, createReferralCookieToken } =
      await load();

    const token = createReferralCookieToken("partner-1");
    vi.stubEnv("REFERRAL_PORTAL_SECRET", "otro-secret-para-el-test");
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    expect(await attributeShopFromReferralCookie({ shopId: "shop-1", cookieValue: token })).toBeNull();
    expect(calls.attributions).toHaveLength(0);
  });
});

describe("cookie valida", () => {
  it("atribuye el local al vendedor y registra el click", async () => {
    const { client, calls } = stubAdmin({ partner: PARTNER, existingAttribution: null });
    const { createServiceRoleClient, attributeShopFromReferralCookie, createReferralCookieToken } =
      await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await attributeShopFromReferralCookie({
      shopId: "shop-1",
      cookieValue: createReferralCookieToken("partner-1"),
    });

    expect(result).toBe("attributed");
    expect(calls.attributions).toHaveLength(1);
    expect(calls.attributions[0]).toMatchObject({
      shop_id: "shop-1",
      partner_id: "partner-1",
      referral_code_snapshot: "JUAN123",
      commission_percent_snapshot: 100,
      commission_months_snapshot: 2,
    });
    expect(calls.clicks).toHaveLength(1);
    expect(calls.clicks[0]).toMatchObject({
      partner_id: "partner-1",
      shop_id: "shop-1",
      // recordReferralLinkClick normaliza a minusculas.
      code: "juan123",
      outcome: "attributed",
    });
  });

  it("respeta los overrides del vendedor al capturar los snapshots", async () => {
    const { client, calls } = stubAdmin({
      partner: { ...PARTNER, commission_percent_override: 25, commission_months_override: 6 },
      existingAttribution: null,
    });
    const { createServiceRoleClient, attributeShopFromReferralCookie, createReferralCookieToken } =
      await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    await attributeShopFromReferralCookie({
      shopId: "shop-1",
      cookieValue: createReferralCookieToken("partner-1"),
    });

    expect(calls.attributions[0]).toMatchObject({
      commission_percent_snapshot: 25,
      commission_months_snapshot: 6,
    });
  });

  it("si el local ya es de otro vendedor, gana el primero y no lo pisa", async () => {
    const { client, calls } = stubAdmin({
      partner: PARTNER,
      existingAttribution: { id: "attr-1", shop_id: "shop-1", partner_id: "partner-otro" },
    });
    const { createServiceRoleClient, attributeShopFromReferralCookie, createReferralCookieToken } =
      await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await attributeShopFromReferralCookie({
      shopId: "shop-1",
      cookieValue: createReferralCookieToken("partner-1"),
    });

    expect(result).toBe("already_taken");
    expect(calls.attributions).toHaveLength(0);
    expect(calls.clicks[0]).toMatchObject({ outcome: "already_taken" });
  });

  it("un vendedor inactivo no atribuye", async () => {
    const { client, calls } = stubAdmin({ partner: { ...PARTNER, is_active: false } });
    const { createServiceRoleClient, attributeShopFromReferralCookie, createReferralCookieToken } =
      await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await attributeShopFromReferralCookie({
      shopId: "shop-1",
      cookieValue: createReferralCookieToken("partner-1"),
    });

    expect(result).toBe("already_taken");
    expect(calls.attributions).toHaveLength(0);
  });

  it("un partner_id que no existe no rompe nada", async () => {
    const { client, calls } = stubAdmin({ partner: null });
    const { createServiceRoleClient, attributeShopFromReferralCookie, createReferralCookieToken } =
      await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client);

    const result = await attributeShopFromReferralCookie({
      shopId: "shop-1",
      cookieValue: createReferralCookieToken("partner-borrado"),
    });

    expect(result).toBeNull();
    expect(calls.attributions).toHaveLength(0);
  });
});

describe("la atribucion nunca propaga errores", () => {
  // El alta de un local no puede depender de que la tabla de referidos este
  // sana: si esta caida, el local se crea igual y la atribucion queda para el
  // proximo intento (la cookie dura 30 dias y no se borra).
  it("si la base falla, devuelve null en vez de tirar", async () => {
    const { createServiceRoleClient, attributeShopFromReferralCookie, createReferralCookieToken } =
      await load();

    vi.mocked(createServiceRoleClient).mockRejectedValue(new Error("conexion caída"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await attributeShopFromReferralCookie({
      shopId: "shop-1",
      cookieValue: createReferralCookieToken("partner-1"),
    });

    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("si falla el registro del click, no tira", async () => {
    const client = {
      from: vi.fn((table: string) => {
        const chain = chainableQuery();
        if (table === "referral_link_clicks") {
          const failing = chainableQuery();
          failing.insert = vi.fn(() => {
            const next = chainableQuery();
            next.then = ((onfulfilled?: (v: unknown) => unknown, onrejected?: (r: unknown) => unknown) =>
              Promise.resolve({ data: null, error: { message: "clicks caido" } }).then(
                onfulfilled,
                onrejected,
              )) as never;
            return next;
          });
          return failing;
        }
        chain.then = ((onfulfilled?: (v: unknown) => unknown, onrejected?: (r: unknown) => unknown) =>
          Promise.resolve(
            table === "referral_partners"
              ? { data: PARTNER, error: null }
              : table === "referral_program_settings"
                ? {
                    data: {
                      default_commission_percent: 100,
                      default_commission_months: 2,
                      fallback_mp_fee_percent: 4,
                    },
                    error: null,
                  }
                : { data: null, error: null },
          ).then(onfulfilled, onrejected)) as never;
        return chain;
      }),
    };

    const { createServiceRoleClient, attributeShopFromReferralCookie, createReferralCookieToken } =
      await load();
    vi.mocked(createServiceRoleClient).mockResolvedValue(client as never);

    const result = await attributeShopFromReferralCookie({
      shopId: "shop-1",
      cookieValue: createReferralCookieToken("partner-1"),
    });

    // La atribucion se escribe igual; solo la traza del click se pierde.
    expect(result).toBe("attributed");
  });
});