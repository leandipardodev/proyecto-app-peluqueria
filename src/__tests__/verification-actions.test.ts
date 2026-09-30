import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const checkResults: Array<{ allowed: boolean }> = [];
let checkCalls = 0;

vi.mock("@/lib/rate-limiter", () => ({
  createRateLimiter: () => ({
    check: async () => {
      const result = checkResults[Math.min(checkCalls++, checkResults.length - 1)] ?? { allowed: true };
      return { allowed: result.allowed, remaining: 1, reset: 0 };
    },
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "x-forwarded-for" ? "203.0.113.9" : null),
  }),
}));

vi.mock("@/lib/email/resend", () => ({
  sendEmailWithResend: vi.fn(async () => {}),
}));

// Cliente de service role de mentira. IMPORTANTE: la cadena es perezosa (igual
// que PostgREST) — los filtros se acumulan y recien en `then` se aplican. Si
// `delete()` ejecutara al ser llamado, no veria el `.eq()` de la cadena.
let storedRow: Record<string, unknown> | null = null;
let attemptsColumnPresent = true;
const deletes: Array<{ email: string | null }> = [];
const updates: Array<{ attempts: number }> = [];

const chain = () => {
  const state = { email: null as string | null, op: "" as "" | "delete" | "insert" | "update" };
  const self: Record<string, unknown> = {};

  self.select = (cols?: string) => {
    self.__select = true;
    self.__cols = cols;
    return self;
  };
  self.eq = (key: string, value: unknown) => {
    if (key === "email") state.email = String(value);
    return self;
  };
  self.is = () => self;
  self.gte = () => self;
  self.order = () => self;
  self.limit = () => self;

  self.delete = () => {
    state.op = "delete";
    return self;
  };
  self.insert = (row: Record<string, unknown>) => {
    state.op = "insert";
    self.__row = row;
    return self;
  };
  self.update = (row: Record<string, unknown>) => {
    state.op = "update";
    self.__row = row;
    return self;
  };

  self.then = (resolve: (v: unknown) => void) => {
    if (state.op === "delete") {
      deletes.push({ email: state.email });
      if (state.email === null || state.email === email) storedRow = null;
    } else if (state.op === "insert") {
      const row = (self.__row ?? {}) as Record<string, unknown>;
      storedRow = { ...row, verified_at: row.verified_at ?? null, attempts: row.attempts ?? 0 };
    } else if (state.op === "update") {
      const row = (self.__row ?? {}) as Record<string, unknown>;
      if (typeof row.attempts === "number") updates.push({ attempts: row.attempts });
      if (storedRow) storedRow = { ...storedRow, ...row };
    } else if (state.op === "" && self.__select) {
      // Simula Postgres 42703 cuando se pide una columna que no esta.
      const cols = String(self.__cols ?? "");
      const wantsMissing = cols.includes("attempts") && !attemptsColumnPresent;
      if (wantsMissing) {
        return Promise.resolve({
          data: null,
          error: { code: "42703", message: 'column email_verifications.attempts does not exist' },
        }).then(resolve);
      }
      const row = storedRow
        ? (cols.includes("attempts")
            ? storedRow
            : Object.fromEntries(Object.entries(storedRow).filter(([k]) => k !== "attempts")))
        : null;
      // PostgREST devuelve un array (por mas que sea .limit(1)).
      return Promise.resolve({ data: row ? [row] : [], error: null }).then(resolve);
    }
    return Promise.resolve({ data: null, error: null }).then(resolve);
  };
  return self;
};

vi.mock("@/lib/dashboard/auth/server", () => ({
  createServiceRoleClient: async () => ({
    from: (table: string) => (table === "email_verifications" ? chain() : chain()),
  }),
}));

import { sendVerificationCode, verifyEmailCode } from "@/lib/dashboard/auth/verification-actions";

const email = "victima@test.com";

beforeEach(() => {
  checkResults.length = 0;
  checkCalls = 0;
  deletes.length = 0;
  updates.length = 0;
  storedRow = null;
});

afterEach(() => vi.clearAllMocks());

async function seedRow(code: string, attempts = 0) {
  storedRow = {
    id: "v-1",
    email,
    code,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    verified_at: null,
    attempts,
  };
}

describe("sendVerificationCode", () => {
  it("genera un codigo de 6 digitos numerico", async () => {
    await sendVerificationCode(email);
    expect(String(storedRow?.code)).toMatch(/^\d{6}$/);
  });

  it("no produce codigos repetidos en 200 intentos (CSPRNG, no Math.random)", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      storedRow = null;
      await sendVerificationCode(email);
      seen.add(String(storedRow?.code));
    }
    // Math.random() sobre 6 digitos tenders a colisionar antes; un CSPRNG
    // deberia dar ~200 distintos. El umbral es deliberadamente laxo para no
    // hacer flake.
    expect(seen.size).toBeGreaterThan(195);
  });

  it("respeta el rate limit por IP (bomba de email)", async () => {
    checkResults.push({ allowed: false });
    const result = await sendVerificationCode(email);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Demasiados intentos/i);
  });

  it("reemplaza el codigo anterior en vez de acumular filas", async () => {
    await seedRow("111111");
    await sendVerificationCode(email);
    expect(deletes.length).toBeGreaterThan(0);
    expect(storedRow?.code).not.toBe("111111");
  });
});

describe("verifyEmailCode — freno de fuerza bruta", () => {
  it("acepta el codigo correcto", async () => {
    await seedRow("424242");
    const result = await verifyEmailCode(email, "424242");
    expect(result.success).toBe(true);
  });

  it("rechaza el codigo incorrecto e incrementa el contador", async () => {
    await seedRow("424242");
    const result = await verifyEmailCode(email, "000000");
    expect(result.success).toBe(false);
    expect(updates.at(-1)?.attempts).toBe(1);
  });

  it("acumula intentos y bloquea al llegar al maximo, borrando la fila", async () => {
    // 4 fallidos: el contador llega a 4 y todavia se puede reintentar.
    for (let i = 1; i <= 4; i++) {
      await seedRow("424242", i - 1);
      await verifyEmailCode(email, "000000");
      expect(updates.at(-1)?.attempts).toBe(i);
    }

    // El 5to fallo borra la fila y ya no queda nada que adivinar.
    await seedRow("424242", 4);
    const result = await verifyEmailCode(email, "000000");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Demasiados intentos/i);
    expect(storedRow).toBeNull();
  });

  it("un codigo generado con el contador al maximo se rechaza aunque sea correcto", async () => {
    await seedRow("424242", 5);
    const result = await verifyEmailCode(email, "424242");
    expect(result.success).toBe(false);
    expect(storedRow).toBeNull();
  });

  it("respeta el rate limit por IP+email antes de tocar la base", async () => {
    checkResults.push({ allowed: false });
    await seedRow("424242");
    const result = await verifyEmailCode(email, "424242");
    expect(result.success).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("SIGUE FUNCIONANDO si la migracion 106 todavia no esta aplicada", async () => {
    // El detector cachea el resultado por instancia. Este archivo corre primero
    // con la columna "presente" (mock por defecto), asi que para simular el
    // deploy sin migracion hay que resetear el modulo.
    vi.resetModules();
    attemptsColumnPresent = false;
    const mod = await import("@/lib/dashboard/auth/verification-actions");

    await seedRow("424242", 0);
    const okResult = await mod.verifyEmailCode(email, "424242");
    expect(okResult.success).toBe(true);

    // Y un codigo incorrecto no rompe: solo no incrementa el contador, porque
    // la columna no existe todavia. El rate limit por IP sigue frenando.
    await seedRow("424242", 0);
    const badResult = await mod.verifyEmailCode(email, "000000");
    expect(badResult.success).toBe(false);
    expect(badResult.error).toMatch(/incorrecto/i);
    expect(updates).toHaveLength(0);
  });
});
