import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServiceRoleClient as mockCreateServiceRole } from "@/lib/dashboard/auth-server";
import { chainableQuery } from "@/__tests__/setup";
import pkg from "@/../package.json";

// Mock the env and package import
vi.mock("@/lib/dashboard/auth-server", () => ({
  createServiceRoleClient: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function callHealthGET() {
  const { GET } = await import("@/app/api/health/route");
  return GET();
}

describe("GET /api/health", () => {
  it("returns 200 with ok status when supabase responds", async () => {
    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({ data: null, error: null }).then(onfulfilled);
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chain),
    } as never);

    const response = await callHealthGET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.version).toBe(pkg.version);
    expect(body.checks.supabase.status).toBe("ok");
    expect(body.checks.supabase.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.environment).toBe("test");
    expect(body.node).toBeDefined();
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("returns 503 when supabase query fails", async () => {
    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({ data: null, error: { message: "timeout" } }).then(onfulfilled);
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chain),
    } as never);

    const response = await callHealthGET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("ok");
    expect(body.checks.supabase.status).toBe("error");
  });

  it("returns 503 when supabase client throws", async () => {
    vi.mocked(mockCreateServiceRole).mockRejectedValue(new Error("connection failed"));

    const response = await callHealthGET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.supabase.status).toBe("error");
  });
});
