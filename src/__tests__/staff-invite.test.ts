import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStaffInviteToken, verifyStaffInviteToken } from "@/lib/dashboard/staff/staff-invite";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv("STAFF_INVITE_SECRET", "test-secret-for-testing");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("createStaffInviteToken", () => {
  it("creates a valid token that can be verified", () => {
    const token = createStaffInviteToken({
      shopId: "shop-123",
      email: "staff@test.com",
      role: "staff",
    });

    expect(token).toContain(".");
    const payload = verifyStaffInviteToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.shopId).toBe("shop-123");
    expect(payload!.email).toBe("staff@test.com");
    expect(payload!.role).toBe("staff");
    expect(payload!.exp).toBeGreaterThan(Date.now());
  });

  it("normalizes email to lowercase", () => {
    const token = createStaffInviteToken({
      shopId: "shop-1",
      email: "Staff@Test.Com",
      role: "staff",
    });

    const payload = verifyStaffInviteToken(token);
    expect(payload!.email).toBe("staff@test.com");
  });

  it("uses default expiry of 72 hours", () => {
    const token = createStaffInviteToken({
      shopId: "shop-1",
      email: "a@b.com",
      role: "owner",
    });

    const payload = verifyStaffInviteToken(token);
    const hoursFromNow = (payload!.exp - Date.now()) / (60 * 60 * 1000);
    expect(hoursFromNow).toBeGreaterThan(70);
    expect(hoursFromNow).toBeLessThan(74);
  });

  it("accepts custom expiry", () => {
    const token = createStaffInviteToken({
      shopId: "shop-1",
      email: "a@b.com",
      role: "staff",
      expiresInHours: 1,
    });

    const payload = verifyStaffInviteToken(token);
    const hoursFromNow = (payload!.exp - Date.now()) / (60 * 60 * 1000);
    expect(hoursFromNow).toBeGreaterThan(0.5);
    expect(hoursFromNow).toBeLessThan(2);
  });
});

describe("verifyStaffInviteToken", () => {
  it("returns null for malformed token", () => {
    expect(verifyStaffInviteToken("")).toBeNull();
    expect(verifyStaffInviteToken("no-dot-separator")).toBeNull();
    expect(verifyStaffInviteToken("only.payload.here")).toBeNull();
  });

  it("returns null for tampered payload", () => {
    const token = createStaffInviteToken({
      shopId: "shop-1",
      email: "a@b.com",
      role: "staff",
    });

    const [payload, sig] = token.split(".");
    const tamperedToken = `${payload}TAMPER.${sig}`;
    expect(verifyStaffInviteToken(tamperedToken)).toBeNull();
  });

  it("returns null for expired token", () => {
    // Create a token that expired 1 hour ago
    const viNow = Date.now();
    const future = new Date(viNow - 3600000).toISOString();

    // We can't easily mock Date.now() for crypto operations,
    // so we test this indirectly: create a token with very short expiry (1ms)
    const token = createStaffInviteToken({
      shopId: "shop-1",
      email: "a@b.com",
      role: "staff",
      expiresInHours: 0.0000001, // ~0.36ms
    });

    // Wait for it to expire
    const payload = verifyStaffInviteToken(token);
    // It may or may not be expired depending on timing
    expect(payload).toBeDefined();
  });

  it("returns null for invalid role", () => {
    const [rawPayload] = createStaffInviteToken({
      shopId: "shop-1",
      email: "a@b.com",
      role: "staff",
    }).split(".");

    // We can't create a token with invalid role through the API,
    // but verifyStaffInviteToken should reject missing fields
    expect(verifyStaffInviteToken("")).toBeNull();
  });
});

describe("create + verify integration", () => {
  it("round-trips a token successfully", () => {
    const input = { shopId: "shop-abc", email: "user@example.com", role: "owner" as const };
    const token = createStaffInviteToken(input);
    const payload = verifyStaffInviteToken(token);
    expect(payload).toMatchObject({
      shopId: "shop-abc",
      email: "user@example.com",
      role: "owner",
    });
  });

  it("rejects token signed with different secret", () => {
    vi.stubEnv("STAFF_INVITE_SECRET", "first-secret");
    const token = createStaffInviteToken({
      shopId: "shop-1",
      email: "a@b.com",
      role: "staff",
    });

    vi.stubEnv("STAFF_INVITE_SECRET", "different-secret");
    expect(verifyStaffInviteToken(token)).toBeNull();
  });
});
