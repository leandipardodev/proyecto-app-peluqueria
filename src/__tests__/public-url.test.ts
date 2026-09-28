import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveNotificationBaseUrl } from "@/lib/urls";

const KEYS = ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BASE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveNotificationBaseUrl", () => {
  it("prefiere NEXT_PUBLIC_SITE_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://klip.com.ar";
    process.env.NEXT_PUBLIC_BASE_URL = "https://www.klip.com.ar";

    expect(resolveNotificationBaseUrl()).toBe("https://klip.com.ar");
  });

  it("usa BASE_URL si SITE_URL no esta", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://klip.com.ar";

    expect(resolveNotificationBaseUrl()).toBe("https://klip.com.ar");
  });

  it("cae a las variables de Vercel", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "klip-git-main-leandro.vercel.app";

    expect(resolveNotificationBaseUrl()).toBe("https://klip-git-main-leandro.vercel.app");
  });

  it("normaliza el slash final", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://klip.com.ar/";

    expect(resolveNotificationBaseUrl()).toBe("https://klip.com.ar");
  });

  it("falla en vez de adivinar si no hay ninguna variable", () => {
    // Antes cada ruta caia a new URL(request.url).origin o a un dominio
    // hardcodeado. Sin URL conocida hay que frenar: una notification_url
    // equivocada manda las notificaciones del pago a otro servidor.
    expect(() => resolveNotificationBaseUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("rechaza una URL que no es absoluta en vez de seguir a la siguiente", () => {
    // Si SITE_URL esta corrupto, seguir al siguiente candidato oculta el
    // problema de configuracion.
    process.env.NEXT_PUBLIC_SITE_URL = "klip.com.ar";
    process.env.NEXT_PUBLIC_BASE_URL = "https://klip.com.ar";

    expect(() => resolveNotificationBaseUrl()).toThrow(/no es una URL absoluta/);
  });

  it("rechaza http en produccion", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "http://klip.com.ar";

    try {
      // Mercado Pago exige https para notificar.
      expect(() => resolveNotificationBaseUrl()).toThrow(/https/);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  it("permite http fuera de produccion para no romper el dev", () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    expect(resolveNotificationBaseUrl()).toBe("http://localhost:3000");
  });

  it("rechaza un protocolo que no sea http", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "javascript:alert(1)";

    expect(() => resolveNotificationBaseUrl()).toThrow(/protocolo no soportado/);
  });

  it("ignora valores vacios y espacios", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "   ";
    process.env.NEXT_PUBLIC_BASE_URL = "https://klip.com.ar";

    expect(resolveNotificationBaseUrl()).toBe("https://klip.com.ar");
  });

  describe("hosts reservados de documentacion", () => {
    // El que estaba configurado en produccion. Pasa el chequeo de https, asi
    // que antes de este guard la app mandaba las notificaciones del pago y los
    // back_urls a api.example.com sin decir nada.
    const reserved: Array<[string, string]> = [
      ["https://api.example.com", "api.example.com"],
      ["https://example.com", "example.com"],
      ["https://www.example.org", "www.example.org"],
      ["https://klip.example.net", "klip.example.net"],
    ];

    for (const [value, host] of reserved) {
      it(`rechaza ${value}`, () => {
        process.env.NEXT_PUBLIC_SITE_URL = value;

        expect(() => resolveNotificationBaseUrl()).toThrow(
          new RegExp(`host reservado.*${host.replace(/\./g, "\\.")}`),
        );
      });
    }

    it("rechaza el placeholder aunque SITE_URL sea invalido y BASE_URL sirva", () => {
      // No debe "ayudar" bajando al siguiente candidato: si SITE_URL esta
      // corrupto el problema de configuracion tiene que verse.
      process.env.NEXT_PUBLIC_SITE_URL = "https://api.example.com";
      process.env.NEXT_PUBLIC_BASE_URL = "https://klip.com.ar";

      expect(() => resolveNotificationBaseUrl()).toThrow(/host reservado/);
    });

    it("deja pasar un dominio real que lo contiene como substring", () => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://klip.com.ar";

      expect(resolveNotificationBaseUrl()).toBe("https://klip.com.ar");
    });

    it("rechaza el placeholder tambien fuera de produccion", () => {
      const prevNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";
      process.env.NEXT_PUBLIC_SITE_URL = "https://api.example.com";

      try {
        expect(() => resolveNotificationBaseUrl()).toThrow(/host reservado/);
      } finally {
        process.env.NODE_ENV = prevNodeEnv;
      }
    });
  });
});

