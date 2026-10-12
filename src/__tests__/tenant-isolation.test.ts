import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServerClient as mockCreateServerClient } from "@/lib/supabase/server";
import { createClient as mockCreateClient } from "@supabase/supabase-js";

/**
 * Aislamiento entre locales, ejecutado sobre el codigo REAL.
 *
 * Este archivo antes importaba `resolveAuthorizedShopId` de
 * `@/lib/dashboard/auth/server`... que `setup.ts` mockea en el modulo 212 con una
 * reimplementacion de la funcion dentro del factory. Los 6 tests de abajo
 *aban sobre esa copia: pasaban aunque `auth/server.ts` estuviera roto, y
 * `auth/server.ts` es justamente el archivo que decide si un miembro de un
 * salon toca datos de otro.
 *
 * Ahora se hace `vi.unmock` y se controlan solo las HOJAS (`createServerClient`
 * y `createClient`), que es el patron que ya usa `middleware.test.ts`: la hoja
 * falsa, el modulo real.
 *
 * Los tests de "acciones mutantes" de abajo tambien cambian de significado: antes
 * la action llamaba a la copia del guard; ahora llama al guard real, que resuelve
 * el rol contra el stub de membresias. Si el guard no estuviera, la action
 * pasaria al `createAdminClient` y `expect(stub.from).not.toHaveBeenCalled()`
 * fallaria.
 */

vi.unmock("@/lib/dashboard/auth/server");

type Membership = { user_id: string; shop_id: string; role: string; is_active: boolean };
type ShopRow = { id: string; slug: string; active?: boolean; plan_expiry?: string | null };

/**
 * Stub que responde las consultas que hacen estos resolvers. No es un
 * `chainableQuery()` generico: mira los `.eq()` que se fueron aplicando y
 * busca la fila que corresponde, asi que un filtro que cambia el resultado
 * (por ejemplo `is_active`) cambia el resultado del test.
 */
function fakeSupabase(opts: {
  userId?: string | null;
  memberships?: Membership[];
  shops?: ShopRow[];
}) {
  const memberships = opts.memberships ?? [];
  const shops = opts.shops ?? [];
  const userId = opts.userId === undefined ? "user-1" : opts.userId;

  const from = (table: string) => {
    const filtros: Record<string, unknown> = {};
    const roles = new Set<string>();
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (campo: string, valor: unknown) => {
        filtros[campo] = valor;
        return chain;
      },
      in: (campo: string, valores: unknown[]) => {
        if (campo === "role") valores.forEach((v) => roles.add(String(v)));
        return chain;
      },
      is: () => chain,
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => chain,
      single: () => chain,
      then: (onFulfilled: (v: unknown) => unknown) => {
        let data: unknown = null;
        if (table === "shop_memberships") {
          const fila = memberships.find(
            (m) =>
              (filtros.user_id === undefined || m.user_id === filtros.user_id) &&
              (filtros.shop_id === undefined || m.shop_id === filtros.shop_id) &&
              (filtros.is_active === undefined || m.is_active === filtros.is_active) &&
              (roles.size === 0 || roles.has(m.role)),
          );
          // `select("role")` proyecta: la fila devuelta trae solo el rol.
          data = fila ? (filtros.select === undefined || "role" in filtros ? fila : { shop_id: fila.shop_id }) : null;
          if (fila && !("shop_id" in filtros)) data = { shop_id: fila.shop_id };
        } else if (table === "shops") {
          const fila = shops.find(
            (s) => (filtros.id === undefined || s.id === filtros.id) || (filtros.slug === undefined || s.slug === filtros.slug),
          );
          data = fila ?? null;
        }
        return Promise.resolve({ data, error: null }).then(onFulfilled);
      },
    };
    return chain;
  };

  return {
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
  };
}

/** Modulo fresco en cada test: los exports van envueltos en `cache()` de React. */
async function freshAuth() {
  vi.resetModules();
  return import("@/lib/dashboard/auth/server");
}

const sinMembresia = [{ user_id: "user-1", shop_id: "shop-propio", role: "owner", is_active: true }];

/**
 * `createServiceRoleClient` (server.ts:306) tira si no encuentra estas dos, y
 * antes ningun test lo pasaba porque el modulo entero estaba mockeado. Vitest no
 * expone las `NEXT_PUBLIC_*` de `.env.local` a `process.env` (solo a
 * `import.meta.env`, y con prefijo `VITE_`), asi que hay que stubearlas.
 */
const ENV_STUBS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service-role",
};
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const [k, v] of Object.entries(ENV_STUBS)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
  vi.mocked(mockCreateServerClient).mockResolvedValue(fakeSupabase({}) as never);
  vi.mocked(mockCreateClient).mockReturnValue(fakeSupabase({}) as never);
});

afterEach(() => {
  for (const k of Object.keys(ENV_STUBS)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k] as string;
  }
  vi.resetModules();
});

describe("resolveAuthorizedShopId · con el modulo real", () => {
  it("rechaza a un usuario sin sesion cuando viene shopId explicito", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(fakeSupabase({ userId: null }) as never);
    const { resolveAuthorizedShopId } = await freshAuth();
    const result = await resolveAuthorizedShopId("shop-ajeno", "owner");
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("rechaza a un no miembro del local", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(fakeSupabase({ memberships: sinMembresia }) as never);
    const { resolveAuthorizedShopId } = await freshAuth();
    const result = await resolveAuthorizedShopId("shop-ajeno", "owner");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
  });

  it("rechaza a un miembro dado de baja", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(
      fakeSupabase({ memberships: [{ user_id: "user-1", shop_id: "shop-ajeno", role: "owner", is_active: false }] }) as never,
    );
    const { resolveAuthorizedShopId } = await freshAuth();
    const result = await resolveAuthorizedShopId("shop-ajeno", "member");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
  });

  it("exige rol owner cuando el modo es owner", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(
      fakeSupabase({ memberships: [{ user_id: "user-1", shop_id: "shop-1", role: "staff", is_active: true }] }) as never,
    );
    const { resolveAuthorizedShopId } = await freshAuth();
    const result = await resolveAuthorizedShopId("shop-1", "owner");
    expect(result).toEqual({ success: false, error: "Solo el owner del local puede realizar esta accion" });
  });

  it("permite a un staff en modo member", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(
      fakeSupabase({ memberships: [{ user_id: "user-1", shop_id: "shop-1", role: "staff", is_active: true }] }) as never,
    );
    const { resolveAuthorizedShopId } = await freshAuth();
    const result = await resolveAuthorizedShopId("shop-1", "member");
    expect(result).toEqual({ success: true, data: "shop-1" });
  });

  it("permite a un owner", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(
      fakeSupabase({ memberships: [{ user_id: "user-1", shop_id: "shop-1", role: "owner", is_active: true }] }) as never,
    );
    const { resolveAuthorizedShopId } = await freshAuth();
    const result = await resolveAuthorizedShopId("shop-1", "owner");
    expect(result).toEqual({ success: true, data: "shop-1" });
  });

  it("delega en la sesion cuando NO viene shopId, y sin membresia no inventa un local", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(fakeSupabase({ memberships: [] }) as never);
    const { resolveAuthorizedShopId } = await freshAuth();
    const result = await resolveAuthorizedShopId(undefined, "member");
    expect(result.success).toBe(false);
  });
});

describe("requireOwnerShopId · con el modulo real", () => {
  it("rechaza a un staff aunque sea miembro", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(
      fakeSupabase({ memberships: [{ user_id: "user-1", shop_id: "shop-1", role: "staff", is_active: true }] }) as never,
    );
    const { requireOwnerShopId } = await freshAuth();
    const result = await requireOwnerShopId();
    expect(result).toEqual({ success: false, error: "Solo el owner del local puede realizar esta accion" });
  });

  it("deveuelve el local al owner", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(fakeSupabase({ memberships: sinMembresia }) as never);
    const { requireOwnerShopId } = await freshAuth();
    const result = await requireOwnerShopId();
    expect(result).toEqual({ success: true, data: "shop-propio" });
  });
});

describe("getCurrentUserRole · con el modulo real", () => {
  it("devuelve el rol de la membresia activa", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(
      fakeSupabase({ memberships: [{ user_id: "user-1", shop_id: "shop-1", role: "staff", is_active: true }] }) as never,
    );
    const { getCurrentUserRole } = await freshAuth();
    const result = await getCurrentUserRole("shop-1");
    expect(result).toEqual({ success: true, data: { role: "staff", userId: "user-1" } });
  });

  it("no ve una membresia dada de baja", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(
      fakeSupabase({ memberships: [{ user_id: "user-1", shop_id: "shop-1", role: "owner", is_active: false }] }) as never,
    );
    const { getCurrentUserRole } = await freshAuth();
    const result = await getCurrentUserRole("shop-1");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO" });
  });
});

describe("canAccessShopId · con el modulo real", () => {
  it("da true para un miembro activo", async () => {
    vi.mocked(mockCreateClient).mockReturnValue(
      fakeSupabase({ memberships: [{ user_id: "user-1", shop_id: "shop-1", role: "staff", is_active: true }] }) as never,
    );
    const { canAccessShopId } = await freshAuth();
    expect(await canAccessShopId("user-1", "shop-1")).toBe(true);
  });

  it("da false para un usuario de otro local", async () => {
    vi.mocked(mockCreateClient).mockReturnValue(fakeSupabase({ memberships: sinMembresia }) as never);
    const { canAccessShopId } = await freshAuth();
    expect(await canAccessShopId("user-1", "shop-ajeno")).toBe(false);
  });

  it("da false sin userId", async () => {
    const { canAccessShopId } = await freshAuth();
    expect(await canAccessShopId("", "shop-1")).toBe(false);
  });
});

describe("checkShopExpired · con el modulo real", () => {
  // `argentina-time` esta mockeado con hoy = 2030-06-15.
  it("marca expirado un local desactivado", async () => {
    vi.mocked(mockCreateClient).mockReturnValue(
      fakeSupabase({ shops: [{ id: "shop-1", slug: "klip", active: false }] }) as never,
    );
    const { checkShopExpired } = await freshAuth();
    expect(await checkShopExpired("shop-1")).toEqual({ expired: true, active: false });
  });

  it("marca expirado un local con el plan vencido", async () => {
    vi.mocked(mockCreateClient).mockReturnValue(
      fakeSupabase({ shops: [{ id: "shop-1", slug: "klip", active: true, plan_expiry: "2030-06-14T00:00:00Z" }] }) as never,
    );
    const { checkShopExpired } = await freshAuth();
    expect(await checkShopExpired("shop-1")).toEqual({ expired: true, active: true });
  });

  it("deja vigente un local con el plan vigente", async () => {
    // La comparacion es `planExpiry <= hoy`, asi que un plan que vence HOY ya
    // esta vencido (el vencimiento es al cierre del dia). Vigente = manana.
    vi.mocked(mockCreateClient).mockReturnValue(
      fakeSupabase({ shops: [{ id: "shop-1", slug: "klip", active: true, plan_expiry: "2030-06-16T00:00:00Z" }] }) as never,
    );
    const { checkShopExpired } = await freshAuth();
    expect(await checkShopExpired("shop-1")).toEqual({ expired: false, active: true });
  });
});

/** Stub del service role: si una action lo toca, ya llego a la DB. */
function adminStub() {
  const from = vi.fn();
  return { from } as never;
}

describe("acciones mutantes con shopId de otro local", () => {
  beforeEach(() => {
    // El guard real corre contra el stub de membresias: sin membresia para el
    // local ajeno, resuelve SIN_ACCESO_LOCAL antes de crear el admin.
    vi.mocked(mockCreateServerClient).mockResolvedValue(fakeSupabase({ memberships: sinMembresia }) as never);
  });

  it("createService no crea el servicio en el local ajeno", async () => {
    const stub = adminStub();
    vi.mocked(mockCreateClient).mockReturnValue(stub);

    const { createService } = await import("@/lib/dashboard/services/service-actions");
    const fd = new FormData();
    fd.set("name", "Corte");
    fd.set("price", "1000");
    fd.set("duration_minutes", "30");

    const result = await createService(fd, "shop-ajeno");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("createExpense no inyecta el gasto en el local ajeno", async () => {
    const stub = adminStub();
    vi.mocked(mockCreateClient).mockReturnValue(stub);

    const { createExpense } = await import("@/lib/dashboard/finances/finances-actions");
    const fd = new FormData();
    fd.set("amount", "999999");
    fd.set("type", "expense");
    fd.set("category", "otro");
    fd.set("description", "inyectado");

    const result = await createExpense(fd, "shop-ajeno");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("updateStock no descuenta stock en el local ajeno", async () => {
    const stub = adminStub();
    vi.mocked(mockCreateClient).mockReturnValue(stub);

    const { updateStock } = await import("@/lib/dashboard/inventory/inventory-actions");
    const result = await updateStock("prod-1", -50, "shop-ajeno");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("getWhatsAppAutomationOverviewForShop no filtra ids de otro local", async () => {
    const stub = adminStub();
    vi.mocked(mockCreateClient).mockReturnValue(stub);

    const { getWhatsAppAutomationOverviewForShop } = await import("@/lib/dashboard/whatsapp/wa-actions");
    const result = await getWhatsAppAutomationOverviewForShop("shop-ajeno");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
    expect(stub.from).not.toHaveBeenCalled();
  });
});

describe("un staff no puede escribir ni en su propio local si la accion pide owner", () => {
  it("createService se rechaza con rol staff", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(
      fakeSupabase({ memberships: [{ user_id: "user-1", shop_id: "shop-propio", role: "staff", is_active: true }] }) as never,
    );
    const stub = adminStub();
    vi.mocked(mockCreateClient).mockReturnValue(stub);

    const { createService } = await import("@/lib/dashboard/services/service-actions");
    const fd = new FormData();
    fd.set("name", "Corte");
    fd.set("price", "1000");
    fd.set("duration_minutes", "30");

    const result = await createService(fd, "shop-propio");
    expect(result).toEqual({ success: false, error: "Solo el owner del local puede realizar esta accion" });
    expect(stub.from).not.toHaveBeenCalled();
  });
});