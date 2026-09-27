import { describe, it, expect, beforeEach, vi, afterAll } from "vitest";
import { createHmac } from "crypto";
import {
  createPartnerSessionToken,
  createReferralCookieToken,
  generatePin,
  hashPin,
  isValidPinShape,
  normalizePin,
  pinLast4,
  verifyPartnerSessionToken,
  verifyPin,
  verifyReferralCookieToken,
} from "@/lib/referrals/partner-auth";

beforeEach(() => {
  vi.stubEnv("REFERRAL_PORTAL_SECRET", "test-referral-secret");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("generatePin", () => {
  it("siempre genera 6 digitos, con ceros a la izquierda", () => {
    for (let i = 0; i < 50; i++) {
      const pin = generatePin();
      expect(pin).toHaveLength(6);
      expect(pin).toMatch(/^\d{6}$/);
    }
  });

  it("no repite siempre el mismo numero", () => {
    const pins = new Set(Array.from({ length: 30 }, () => generatePin()));
    expect(pins.size).toBeGreaterThan(1);
  });
});

describe("normalizePin / isValidPinShape", () => {
  it("deja solo los digitos", () => {
    expect(normalizePin("12 34-56")).toBe("123456");
    expect(normalizePin("a1b2c3d4e5f6")).toBe("123456");
  });

  it("rechaza cualquier cosa que no sea 6 digitos", () => {
    expect(isValidPinShape("123456")).toBe(true);
    expect(isValidPinShape("12345")).toBe(false);
    expect(isValidPinShape("1234567")).toBe(false);
    expect(isValidPinShape("12345a")).toBe(false);
    expect(isValidPinShape("")).toBe(false);
  });
});

describe("pinLast4", () => {
  it("devuelve los ultimos 4 digitos", () => {
    expect(pinLast4("123456")).toBe("3456");
  });
});

describe("hashPin / verifyPin", () => {
  it("guarda scrypt con salt, no el PIN en claro", async () => {
    const stored = await hashPin("482913");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(stored).not.toContain("482913");
  });

  it("el mismo PIN genera hashes distintos por el salt", async () => {
    const a = await hashPin("482913");
    const b = await hashPin("482913");
    expect(a).not.toBe(b);
  });

  it("verifica el PIN correcto", async () => {
    expect(await verifyPin("482913", await hashPin("482913"))).toBe(true);
  });

  it("falla con un PIN distinto", async () => {
    expect(await verifyPin("482914", await hashPin("482913"))).toBe(false);
  });

  it("falla si no hay hash guardado (vendedor sin PIN)", async () => {
    expect(await verifyPin("482913", null)).toBe(false);
    expect(await verifyPin("482913", "")).toBe(false);
  });

  it("falla con formatos de hash viejos o corruptos", async () => {
    expect(await verifyPin("482913", "argon2:abc:def")).toBe(false);
    expect(await verifyPin("482913", "scrypt:zz:zz")).toBe(false);
    expect(await verifyPin("482913", "no-colons")).toBe(false);
  });

  it("regenerar el PIN invalida el anterior sin tocar el id", async () => {
    const first = await hashPin("482913");
    const second = await hashPin("777777");

    expect(await verifyPin("482913", first)).toBe(true);

    expect(await verifyPin("482913", second)).toBe(false);
    expect(await verifyPin("777777", second)).toBe(true);
  });
});

describe("sesion del vendedor", () => {
  it("round-trip del partnerId", () => {
    const token = createPartnerSessionToken("partner-abc");
    const session = verifyPartnerSessionToken(token);
    expect(session).not.toBeNull();
    expect(session!.partnerId).toBe("partner-abc");
  });

  it("rechaza token sin firma o malformado", () => {
    expect(verifyPartnerSessionToken("")).toBeNull();
    expect(verifyPartnerSessionToken(null)).toBeNull();
    expect(verifyPartnerSessionToken("sin.punto")).toBeNull();
  });

  it("rechaza el payload si le cambian un caracter", () => {
    const token = createPartnerSessionToken("partner-abc");
    const [payload, sig] = token.split(".");
    expect(verifyPartnerSessionToken(`${payload}X.${sig}`)).toBeNull();
  });

  it("rechaza una firma hecha con otro secret", () => {
    const token = createPartnerSessionToken("partner-abc");
    vi.stubEnv("REFERRAL_PORTAL_SECRET", "otro-secret");
    expect(verifyPartnerSessionToken(token)).toBeNull();
  });

  it("rechaza una sesion vencida", () => {
    const payload = Buffer.from(
      JSON.stringify({ partnerId: "partner-abc", exp: Date.now() - 1000 }),
      "utf8",
    ).toString("base64url");

    // Firma con el secret del test.
    const sig = createHmac("sha256", "test-referral-secret").update(payload).digest("base64url");

    expect(verifyPartnerSessionToken(`${payload}.${sig}`)).toBeNull();
  });
});

describe("cookie de atribucion", () => {
  it("round-trip del partnerId", () => {
    const token = createReferralCookieToken("partner-xyz");
    expect(verifyReferralCookieToken(token)).toBe("partner-xyz");
  });

  it("no se puede falsificar el partnerId a mano", () => {
    const token = createReferralCookieToken("partner-xyz");
    const [raw] = token.split(".");

    // Firma de la cookie de atribucion con el prefijo correcto, pero apuntando
    // a otro partner. Con la firma sola no alcanza: tiene que calzar con el
    // payload, asi que el par(raw, firma) mezclado se rechaza.
    const forgedPayload = Buffer.from("partner-999", "utf8").toString("base64url");
    const forgedSig = createHmac("sha256", "test-referral-secret")
      .update(`ref:${forgedPayload}`)
      .digest("base64url");

    expect(verifyReferralCookieToken(`${raw}.${forgedSig}`)).toBeNull();
    expect(verifyReferralCookieToken(`${forgedPayload}.${forgedSig}`)).toBe("partner-999");
    expect(verifyReferralCookieToken(`${forgedPayload}.basura`)).toBeNull();
  });

  it("rechaza una cookie de atribucion firmada con otro secret", () => {
    const token = createReferralCookieToken("partner-xyz");
    vi.stubEnv("REFERRAL_PORTAL_SECRET", "otro-secret-para-el-test");
    expect(verifyReferralCookieToken(token)).toBeNull();
  });

  it("una cookie de sesion no sirve como cookie de atribucion", () => {
    const sessionToken = createPartnerSessionToken("partner-abc");
    expect(verifyReferralCookieToken(sessionToken)).toBeNull();
  });
});
