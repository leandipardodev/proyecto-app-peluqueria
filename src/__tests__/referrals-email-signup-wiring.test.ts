import { describe, it, expect, vi, beforeEach } from "vitest";
import { chainableQuery } from "./setup";

/**
 * El alta por email era el hueco del referidos.
 *
 * Hay dos caminos que crean un local y solo uno atribuia al vendedor: Google
 * OAuth si, completeRegistration (email + password) no. Resultado: todo local
 * registrado con email desde un link /r/<codigo> se quedaba sin atribucion y
 * sin comision, en silencio y sin error en ningun lado.
 *
 * Estos tests no cubren el calculo de la atribucion (eso vive en
 * referrals-attribution-from-cookie.test.ts): cubren que completeRegistration
 * la pida. Si alguien saca el cable, fallan.
 */

const attributeShopFromReferralCookieMock = vi.fn(async () => null as string | null);

vi.mock("@/lib/referrals/attribute-from-cookie", () => ({
  attributeShopFromReferralCookie: (...args: unknown[]) =>
    attributeShopFromReferralCookieMock(...(args as [])),
}));

vi.mock("@/lib/dashboard/auth/verification-actions", () => ({
  verifyEmailCode: vi.fn(async () => ({ success: true })),
  sendVerificationCode: vi.fn(async () => ({ success: true })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn(async () => ({ error: null })),
      refreshSession: vi.fn(async () => {}),
    },
  })),
  parseCookieHeader: vi.fn(() => []),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

const REFERRAL_COOKIE_NAME = "klip_ref";

function stubAdminForSignup() {
  return {
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({
          data: { users: [{ id: "user-1", email: "ana@example.com" }] },
          error: null,
        })),
        updateUserById: vi.fn(async () => ({ data: {}, error: null })),
      },
    },
    from: vi.fn((table: string) => {
      // chainableQuery no trae upsert, y el alta lo usa para user_profiles,
      // shop_memberships y admin_allowlist.
      const chain = chainableQuery() as ReturnType<typeof chainableQuery> & {
        upsert: ReturnType<typeof vi.fn>;
      };
      chain.upsert = vi.fn(() => chain);

      if (table === "shops") {
        // El alta real hace .from("shops").insert({...}).select("id").single()
        chain.insert = vi.fn(() => {
          const afterInsert = chainableQuery();
          afterInsert.select = vi.fn(() => {
            const afterSelect = chainableQuery();
            afterSelect.single = vi.fn(async () => ({ data: { id: "shop-nuevo" }, error: null }));
            return afterSelect;
          });
          return afterInsert;
        });
      }
      return chain;
    }),
  };
}

function signupForm() {
  const data = new FormData();
  data.set("email", "ana@example.com");
  data.set("code", "123456");
  data.set("shop_name", "Peluqueria Ana");
  data.set("industry", "peluqueria");
  data.set("password", "secreto123");
  return data;
}

async function runSignup(cookieValue?: string) {
  const { cookies } = await import("next/headers");
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn((name: string) =>
      name === REFERRAL_COOKIE_NAME && cookieValue ? { name, value: cookieValue } : undefined,
    ),
    getAll: vi.fn(() => []),
    set: vi.fn(),
  } as never);

  const { createServiceRoleClient } = await import("@/lib/dashboard/auth/server");
  vi.mocked(createServiceRoleClient).mockResolvedValue(stubAdminForSignup() as never);

  const { completeRegistration } = await import("@/lib/dashboard/auth/actions");
  return completeRegistration(signupForm());
}

async function referralCookieFor(partnerId: string) {
  vi.stubEnv("REFERRAL_PORTAL_SECRET", "test-referral-secret");
  const { createReferralCookieToken } = await import("@/lib/referrals/partner-auth");
  return createReferralCookieToken(partnerId);
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("REFERRAL_PORTAL_SECRET", "test-referral-secret");
  attributeShopFromReferralCookieMock.mockReset();
  attributeShopFromReferralCookieMock.mockResolvedValue(null);
});

describe("completeRegistration - atribucion del referido", () => {
  it("lee la cookie klip_ref y atribuye el local recien creado", async () => {
    const cookie = await referralCookieFor("partner-1");

    const result = await runSignup(cookie);

    expect(result.success).toBe(true);
    expect(attributeShopFromReferralCookieMock).toHaveBeenCalledTimes(1);
    expect(attributeShopFromReferralCookieMock).toHaveBeenCalledWith({
      shopId: "shop-nuevo",
      cookieValue: cookie,
    });
  });

  it("sin cookie de referido el alta sigue siendo normal", async () => {
    const result = await runSignup(undefined);

    expect(result.success).toBe(true);
    // Se llama igual para no dejar un if disperso: el helper es el que decide
    // que no hay nada que hacer.
    expect(attributeShopFromReferralCookieMock).toHaveBeenCalledWith({
      shopId: "shop-nuevo",
      cookieValue: undefined,
    });
  });

  it("la atribucion no se cuela en el resultado del alta", async () => {
    // El helper traga sus propios errores y devuelve el outcome. Si en algun
    // momento devolviera algo raro, el alta tiene que seguir respondiendo
    // success con redirectToDashboard y nada mas.
    attributeShopFromReferralCookieMock.mockResolvedValue("attributed");

    const result = await runSignup(await referralCookieFor("partner-1"));

    expect(result).toEqual({ success: true, data: { redirectToDashboard: true } });
  });

  it("atribuye el id del local recien creado, no uno viejo", async () => {
    await runSignup(await referralCookieFor("partner-1"));

    const arg = attributeShopFromReferralCookieMock.mock.calls[0][0] as { shopId: string };
    expect(arg.shopId).toBe("shop-nuevo");
  });
});