import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextResponse } from "next/server";
import { createMiddlewareClient as mockCreateMiddlewareClient } from "@/lib/supabase/middleware";
import { chainableQuery } from "@/__tests__/setup";
import { middleware } from "../../middleware";

vi.mock("@/lib/supabase/middleware", () => ({
  createMiddlewareClient: vi.fn(),
}));

const BASE = "http://localhost";

function createMockRequest(url: string, options: {
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
} = {}): any {
  const u = new URL(url, BASE);
  u.clone = vi.fn(() => new URL(u.href));

  const cookieStore = new Map(Object.entries(options.cookies ?? {}));

  const headerEntries = Object.entries(options.headers ?? {});
  const headers = new Headers(headerEntries);

  return {
    nextUrl: u,
    url: u.href,
    cookies: {
      get: vi.fn((name: string) => {
        const v = cookieStore.get(name);
        return v ? { value: v, name } : undefined;
      }),
    },
    headers,
  };
}

type SupabaseMock = {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

function makeMiddlewareClient(overrides: Partial<SupabaseMock> = {}): SupabaseMock {
  return {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => chainableQuery()),
    ...overrides,
  };
}

function mockServiceRoleShops(shops: Array<{ id: string; slug: string; active: boolean; plan_expiry: string | null }>) {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(shops),
  } as never);
}

let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

function runMiddleware(url: string, opts?: Parameters<typeof createMockRequest>[1]) {
  return middleware(createMockRequest(url, opts));
}

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy?.mockRestore();
    fetchSpy = null;

    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req: any, _res: any) =>
      makeMiddlewareClient(),
    );

    // Set the service role key so shops are queried via fetch
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  // -----------------------------------------------------------------------
  // Path protection
  // -----------------------------------------------------------------------
  it("passes through for non-protected paths", async () => {
    const res = await runMiddleware("/");
    expect(res.status).toBe(200);
  });

  it("passes through for public assets", async () => {
    const res = await runMiddleware("/_next/static/chunk.js");
    expect(res.status).toBe(200);
  });

  // -----------------------------------------------------------------------
  // Auth gate
  // -----------------------------------------------------------------------
  it("redirects to login when no user", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) =>
      makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      }),
    );

    const res = await runMiddleware("/dashboard/staff");
    expect(res.status).toBe(307);
    const location = res.headers.get("Location");
    expect(location).toContain("/login");
    expect(location).toContain("redirect=%2Fdashboard%2Fstaff");
  });

  it("redirects to login and preserves query params in redirect", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) =>
      makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      }),
    );

    const res = await runMiddleware("/dashboard/staff?page=1");
    expect(res.status).toBe(307);
    const location = res.headers.get("Location");
    expect(location).toMatch(/redirect=%2Fdashboard%2Fstaff/);
  });

  // -----------------------------------------------------------------------
  // Profile check
  // -----------------------------------------------------------------------
  it("redirects to billing-required when no profile", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) => {
      const chain = chainableQuery();
      chain.then = (onfulfilled: any) =>
        Promise.resolve({ data: null, error: { message: "not found" } }).then(onfulfilled);
      return makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
        from: vi.fn(() => chain),
      });
    });

    const res = await runMiddleware("/dashboard/staff");
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/billing-required");
  });

  // -----------------------------------------------------------------------
  // Admin gate
  // -----------------------------------------------------------------------
  it("redirects non-superadmin from /admin to /dashboard", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) => {
      const chain = chainableQuery();
      chain.then = (onfulfilled: any) =>
        Promise.resolve({ data: { role: "owner", platform_role: null }, error: null }).then(onfulfilled);
      return makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
        from: vi.fn(() => chain),
      });
    });

    const res = await runMiddleware("/admin/users");
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/dashboard");
  });

  it("allows superadmin on /admin", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) => {
      const chain = chainableQuery();
      chain.then = (onfulfilled: any) =>
        Promise.resolve({ data: { role: "owner", platform_role: "super_admin" }, error: null }).then(onfulfilled);
      return makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
        from: vi.fn(() => chain),
      });
    });

    const res = await runMiddleware("/admin/users");
    expect(res.status).toBe(200);
  });

  // -----------------------------------------------------------------------
  // Customer redirect
  // -----------------------------------------------------------------------
  it("redirects customer role from /dashboard to landing", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) => {
      const chain = chainableQuery();
      chain.then = (onfulfilled: any) =>
        Promise.resolve({ data: { role: "customer" }, error: null }).then(onfulfilled);
      return makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
        from: vi.fn(() => chain),
      });
    });

    const res = await runMiddleware("/dashboard/staff");
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("http://localhost/");
  });

  // -----------------------------------------------------------------------
  // Memberships
  // -----------------------------------------------------------------------
  it("redirects to onboarding when no active memberships", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) => {
      const profileChain = chainableQuery();
      profileChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: { role: "owner" }, error: null }).then(onfulfilled);

      const membershipChain = chainableQuery();
      membershipChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: [], error: null }).then(onfulfilled);

      let callCount = 0;
      return makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
        from: vi.fn((table: string) => {
          callCount++;
          if (table === "user_profiles" && callCount === 1) return profileChain;
          return membershipChain;
        }),
      });
    });

    const res = await runMiddleware("/dashboard/staff");
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/onboarding/create-shop");
  });

  // -----------------------------------------------------------------------
  // Dashboard with valid shop
  // -----------------------------------------------------------------------
  it("passes through with cookies set for valid shop", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) => {
      const profileChain = chainableQuery();
      profileChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: { role: "owner" }, error: null }).then(onfulfilled);

      const membershipChain = chainableQuery();
      membershipChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: [{ shop_id: "shop-1", role: "owner", is_active: true }], error: null }).then(onfulfilled);

      mockServiceRoleShops([{ id: "shop-1", slug: "mi-local", active: true, plan_expiry: "2099-12-31" }]);

      let callCount = 0;
      return makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
        from: vi.fn((table: string) => {
          callCount++;
          if (table === "user_profiles" && callCount === 1) return profileChain;
          return membershipChain;
        }),
      });
    });

    const res = await runMiddleware("/dashboard/mi-local/staff");
    expect(res.status).toBe(200);
    // x-shop-id and x-shop-slug are set on the forwarded request, not response headers
    // Cookies should be set on the response
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("klip_active_shop_id=shop-1");
    expect(setCookie).toContain("klip_active_shop_slug=mi-local");
  });

  // -----------------------------------------------------------------------
  // Plan expiry
  // -----------------------------------------------------------------------
  it("redirects to billing-required when plan is expired", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) => {
      const profileChain = chainableQuery();
      profileChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: { role: "owner" }, error: null }).then(onfulfilled);

      const membershipChain = chainableQuery();
      membershipChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: [{ shop_id: "shop-1", role: "owner", is_active: true }], error: null }).then(onfulfilled);

      mockServiceRoleShops([{ id: "shop-1", slug: "mi-local", active: true, plan_expiry: "2020-01-01" }]);

      let callCount = 0;
      return makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
        from: vi.fn((table: string) => {
          callCount++;
          if (table === "user_profiles" && callCount === 1) return profileChain;
          return membershipChain;
        }),
      });
    });

    const res = await runMiddleware("/dashboard/mi-local/finances");
    expect(res.status).toBe(307);
    const location = res.headers.get("Location");
    expect(location).toContain("/billing-required");
    expect(location).toContain("shop_id=shop-1");
  });

  it("blocks when plan_expiry is today (0 days remaining)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) => {
      const profileChain = chainableQuery();
      profileChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: { role: "owner" }, error: null }).then(onfulfilled);

      const membershipChain = chainableQuery();
      membershipChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: [{ shop_id: "shop-1", role: "owner", is_active: true }], error: null }).then(onfulfilled);

      mockServiceRoleShops([{ id: "shop-1", slug: "mi-local", active: true, plan_expiry: today }]);

      let callCount = 0;
      return makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
        from: vi.fn((table: string) => {
          callCount++;
          if (table === "user_profiles" && callCount === 1) return profileChain;
          return membershipChain;
        }),
      });
    });

    const res = await runMiddleware("/dashboard/mi-local/staff");
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/billing-required");
  });

  it("redirects when shop is inactive", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) => {
      const profileChain = chainableQuery();
      profileChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: { role: "owner" }, error: null }).then(onfulfilled);

      const membershipChain = chainableQuery();
      membershipChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: [{ shop_id: "shop-1", role: "owner", is_active: true }], error: null }).then(onfulfilled);

      mockServiceRoleShops([{ id: "shop-1", slug: "mi-local", active: false, plan_expiry: "2099-12-31" }]);

      let callCount = 0;
      return makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
        from: vi.fn((table: string) => {
          callCount++;
          if (table === "user_profiles" && callCount === 1) return profileChain;
          return membershipChain;
        }),
      });
    });

    const res = await runMiddleware("/dashboard/mi-local");
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/billing-required");
  });

  // -----------------------------------------------------------------------
  // Legacy dashboard redirect
  // -----------------------------------------------------------------------
  it("redirects legacy /dashboard/staff to /dashboard/{slug}/staff", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) => {
      const profileChain = chainableQuery();
      profileChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: { role: "owner" }, error: null }).then(onfulfilled);

      const membershipChain = chainableQuery();
      membershipChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: [{ shop_id: "shop-1", role: "owner", is_active: true }], error: null }).then(onfulfilled);

      mockServiceRoleShops([{ id: "shop-1", slug: "mi-local", active: true, plan_expiry: "2099-12-31" }]);

      let callCount = 0;
      return makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
        from: vi.fn((table: string) => {
          callCount++;
          if (table === "user_profiles" && callCount === 1) return profileChain;
          return membershipChain;
        }),
      });
    });

    // /dashboard/staff is a legacy path (no slug)
    const res = await runMiddleware("/dashboard/staff");
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toContain("/dashboard/mi-local/staff");
  });

  // -----------------------------------------------------------------------
  // Unknown slug
  // -----------------------------------------------------------------------
  it("redirects to /dashboard when slug does not match any shop", async () => {
    vi.mocked(mockCreateMiddlewareClient).mockImplementation((_req, _res) => {
      const profileChain = chainableQuery();
      profileChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: { role: "owner" }, error: null }).then(onfulfilled);

      const membershipChain = chainableQuery();
      membershipChain.then = (onfulfilled: any) =>
        Promise.resolve({ data: [{ shop_id: "shop-1", role: "owner", is_active: true }], error: null }).then(onfulfilled);

      mockServiceRoleShops([{ id: "shop-1", slug: "mi-local", active: true, plan_expiry: "2099-12-31" }]);

      let callCount = 0;
      return makeMiddlewareClient({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
        from: vi.fn((table: string) => {
          callCount++;
          if (table === "user_profiles" && callCount === 1) return profileChain;
          return membershipChain;
        }),
      });
    });

    const res = await runMiddleware("/dashboard/nonexistent-slug/staff");
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("http://localhost/dashboard");
  });
});
