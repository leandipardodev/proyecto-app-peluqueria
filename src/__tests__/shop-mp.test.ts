import { describe, it, expect } from "vitest";
import {
  buildShopNotificationUrl,
  resolveShopMpToken,
  SHOP_MP_NOT_CONNECTED,
} from "@/lib/payments/shop-mp";

describe("resolveShopMpToken", () => {
  it("devuelve el token del local", () => {
    const result = resolveShopMpToken({ mp_access_token: "APP_USR-del-local" });

    expect(result).toEqual({ ok: true, accessToken: "APP_USR-del-local" });
  });

  it("NO cae al token de la plataforma cuando el local no conecto su cuenta", () => {
    // Este es el bug que se corrigio: el fallback a MP_ACCESS_TOKEN metia la
    // sena del local en la cuenta de Klip, sin ledger que le devolviera nada.
    process.env.MP_ACCESS_TOKEN = "APP_USR-de-la-plataforma";

    const result = resolveShopMpToken({ mp_access_token: null });

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("accessToken");
    delete process.env.MP_ACCESS_TOKEN;
  });

  it("falla con un mensaje accionable", () => {
    const result = resolveShopMpToken({ mp_access_token: null });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(SHOP_MP_NOT_CONNECTED);
  });

  it("falla con la fila inexistente, no con un crash", () => {
    expect(resolveShopMpToken(null).ok).toBe(false);
    expect(resolveShopMpToken(undefined).ok).toBe(false);
  });

  it("rechaza un token vacio o con espacios", () => {
    expect(resolveShopMpToken({ mp_access_token: "" }).ok).toBe(false);
    expect(resolveShopMpToken({ mp_access_token: "   " }).ok).toBe(false);
    expect(resolveShopMpToken({ mp_access_token: null }).ok).toBe(false);
  });

  it("rechaza un token que no es string", () => {
    expect(resolveShopMpToken({ mp_access_token: 12345 }).ok).toBe(false);
  });

  it("aplica trim al token", () => {
    expect(resolveShopMpToken({ mp_access_token: "  APP_USR-x  " })).toEqual({
      ok: true,
      accessToken: "APP_USR-x",
    });
  });
});

describe("buildShopNotificationUrl", () => {
  it("incluye shop_id para que el webhook use el token del local", () => {
    const url = buildShopNotificationUrl("https://klip.com.ar", "shop-1");

    expect(url).toBe("https://klip.com.ar/api/payments/mercadopago-webhook?shop_id=shop-1");
  });

  it("nunca produce shop_id vacio", () => {
    // Con shop_id vacio el webhook cae al token de la plataforma, payment.get da
    // 404 y el turno queda sin confirmar aunque la plata haya entrado.
    const url = buildShopNotificationUrl("https://klip.com.ar", "");

    expect(url).toContain("shop_id=");
    expect(url.endsWith("shop_id=")).toBe(true);
  });

  it("escapa el shop_id", () => {
    const url = buildShopNotificationUrl("https://klip.com.ar", "a b&c=d");

    expect(url).toBe("https://klip.com.ar/api/payments/mercadopago-webhook?shop_id=a%20b%26c%3Dd");
    expect(new URL(url).searchParams.get("shop_id")).toBe("a b&c=d");
  });

  it("tolera la baseUrl con slash final", () => {
    expect(buildShopNotificationUrl("https://klip.com.ar/", "shop-1")).toBe(
      "https://klip.com.ar/api/payments/mercadopago-webhook?shop_id=shop-1",
    );
  });

  it("el shop_id sobrevive como query param real", () => {
    const url = new URL(buildShopNotificationUrl("https://klip.com.ar", "abc-123"));

    expect(url.searchParams.get("shop_id")).toBe("abc-123");
    expect(url.pathname).toBe("/api/payments/mercadopago-webhook");
  });
});
