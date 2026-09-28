import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv } from "@/lib/env";

/**
 * validateEnv corre en instrumentation.ts al boot del server. En produccion
 * tira: es la unica red que frena una app que levanta con la URL publica mal
 * configurada.
 */
const KEYS = ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BASE_URL"] as const;

/** validateEnv primero valida presencia, asi que hay que sombrear el resto. */
const REQUIRED_STUBS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub-anon",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service",
  MP_ACCESS_TOKEN: "APP_USR-stub",
  MP_WEBHOOK_SECRET: "stub-secret",
  NEXT_PUBLIC_MP_PUBLIC_KEY: "APP_USR-stub",
  MP_OAUTH_CLIENT_ID: "stub-id",
  MP_OAUTH_CLIENT_SECRET: "stub-secret",
  MP_OAUTH_STATE_SECRET: "stub-secret",
};

const saved: Record<string, string | undefined> = {};
const savedNodeEnv = process.env.NODE_ENV;

function silenceEnv() {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
}

beforeEach(() => {
  for (const k of Object.keys(REQUIRED_STUBS)) {
    saved[k] = process.env[k];
    process.env[k] = REQUIRED_STUBS[k];
  }
  for (const k of KEYS) saved[k] = process.env[k];
  silenceEnv();
});

afterEach(() => {
  for (const k of [...Object.keys(REQUIRED_STUBS), ...KEYS]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  process.env.NODE_ENV = savedNodeEnv;
  vi.restoreAllMocks();
});

describe("validateEnv — URL publica", () => {
  it("tira en produccion si SITE_URL es el placeholder de ejemplo", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://api.example.com";
    process.env.NEXT_PUBLIC_BASE_URL = "https://klip.com.ar";

    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("tira en produccion si BASE_URL es el placeholder de ejemplo", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://klip.com.ar";
    process.env.NEXT_PUBLIC_BASE_URL = "https://api.example.com";

    expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_BASE_URL/);
  });

  it("tira en produccion si la URL publica no es https", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "http://klip.com.ar";
    process.env.NEXT_PUBLIC_BASE_URL = "https://klip.com.ar";

    expect(() => validateEnv()).toThrow(/https/);
  });

  it("deja levantar con la URL real", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://klip.com.ar";
    process.env.NEXT_PUBLIC_BASE_URL = "https://klip.com.ar";

    expect(() => validateEnv()).not.toThrow();
  });

  it("fuera de produccion avisa pero no frena el dev", () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_SITE_URL = "https://api.example.com";
    process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";

    expect(() => validateEnv()).not.toThrow();
  });
});
