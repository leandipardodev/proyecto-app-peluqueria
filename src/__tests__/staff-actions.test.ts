import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchStaffMembers,
  addStaffMember,
  updateStaffPayMode,
  updateStaffRole,
  updateStaffName,
  removeStaff,
} from "@/lib/dashboard/staff-actions";
import { requireShopId as mockRequireShopId, createServiceRoleClient as mockCreateServiceRole, getAuthSession as mockGetAuthSession, getCurrentUserRole as mockGetCurrentUserRole } from "@/lib/dashboard/auth-server";
import { createServerClient as mockCreateServerClient } from "@/lib/supabase/server";
import { revalidateDashboardSegments as mockRevalidate } from "@/lib/dashboard/revalidate-dashboard";
import { trackProductEvent as mockTrackProductEvent } from "@/lib/analytics/product-events";
import { sendEmailWithResend as mockSendEmail } from "@/lib/email/resend";
import { supabaseStub, chainableQuery, makeOwnerCheckClient } from "@/__tests__/setup";

vi.mock("@/lib/dashboard/staff-invite", () => ({
  createStaffInviteToken: vi.fn(() => "mock-invite-token"),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockRequireShopId).mockResolvedValue({ success: true, data: "shop-123" });
  vi.mocked(mockCreateServerClient).mockResolvedValue(supabaseStub());
  vi.mocked(mockCreateServiceRole).mockResolvedValue(supabaseStub());
  vi.mocked(mockSendEmail).mockResolvedValue({ success: true } as never);
});

// ---------------------------------------------------------------------------
// fetchStaffMembers
// ---------------------------------------------------------------------------
describe("fetchStaffMembers", () => {
  function makeAdminClient() {
    const memChain = chainableQuery();
    memChain.then = (onfulfilled: any) =>
      Promise.resolve({
        data: [
          { user_id: "u1", role: "owner" },
          { user_id: "u2", role: "staff" },
        ],
        error: null,
      }).then(onfulfilled);
    memChain.select = vi.fn().mockReturnThis();

    const profileChain = chainableQuery();
    profileChain.then = (onfulfilled: any) =>
      Promise.resolve({
        data: [
          { user_id: "u1", name: "Owner Name", email: "owner@test.com" },
          { user_id: "u2", name: "Staff Name", email: "staff@test.com" },
        ],
        error: null,
      }).then(onfulfilled);

    const rulesChain = chainableQuery();
    rulesChain.then = (onfulfilled: any) =>
      Promise.resolve({
        data: [{ staff_user_id: "u2", percentage_rate: 30, fixed_amount: 0 }],
        error: null,
      }).then(onfulfilled);

    return {
      from: vi.fn((table: string) => {
        if (table === "shop_memberships") return memChain;
        if (table === "user_profiles") return profileChain;
        if (table === "staff_compensation_rules") return rulesChain;
        return chainableQuery();
      }),
    } as never;
  }

  it("returns staff members with revenue", async () => {
    vi.mocked(mockGetCurrentUserRole).mockResolvedValue({ success: true, data: { role: "owner", userId: "u1" } });

    const revChain = chainableQuery();
    revChain.then = (onfulfilled: any) =>
      Promise.resolve({
        data: [
          { staff_id: "u2", services: [{ price: 5000 }] },
          { staff_id: "u2", services: [{ price: 3000 }] },
        ],
        error: null,
      }).then(onfulfilled);

    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn(() => revChain),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) },
    } as never);

    vi.mocked(mockCreateServiceRole).mockResolvedValue(makeAdminClient());

    const result = await fetchStaffMembers("shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(2);
    const staff = result.data.find((s) => s.role === "staff");
    expect(staff?.revenue).toBe(8000);
    expect(staff?.payModel).toBe("percentage");
  });

  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await fetchStaffMembers();
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// addStaffMember
// ---------------------------------------------------------------------------
describe("addStaffMember", () => {
  function createFormData(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("name", overrides.name ?? "New Staff");
    fd.set("email", overrides.email ?? "staff@test.com");
    fd.set("role", overrides.role ?? "staff");
    fd.set("pay_model", overrides.pay_model ?? "percentage");
    fd.set("percentage_rate", overrides.percentage_rate ?? "30");
    return fd;
  }

  it("returns error when name is missing", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient());
    const fd = createFormData({ name: "" });
    const result = await addStaffMember(fd);
    expect(result).toEqual({ success: false, error: "Todos los campos son obligatorios" });
  });

  it("returns error when email is missing", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient());
    const fd = createFormData({ email: "" });
    const result = await addStaffMember(fd);
    expect(result).toEqual({ success: false, error: "Todos los campos son obligatorios" });
  });

  it("returns error when role is missing", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient());
    const fd = createFormData({ role: "" });
    const result = await addStaffMember(fd);
    expect(result).toEqual({ success: false, error: "Todos los campos son obligatorios" });
  });

  it("returns error for invalid percentage rate", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient());
    const fd = createFormData({ percentage_rate: "150" });
    const result = await addStaffMember(fd);
    expect(result).toEqual({ success: false, error: "Porcentaje invalido" });
  });

  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const fd = createFormData();
    const result = await addStaffMember(fd);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("returns error when owner access check fails", async () => {
    // Non-owner membership
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn(() => chainableQuery({
        maybeSingle: vi.fn().mockResolvedValue({ data: { role: "staff", is_active: true }, error: null }),
      })),
    } as never);

    const fd = createFormData();
    const result = await addStaffMember(fd);
    expect(result.success).toBe(false);
    expect(result.error).toContain("owner");
  });

  it("adds existing user successfully", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient());

    const adminStub = supabaseStub();
    const userProfChain = chainableQuery();
    userProfChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: { user_id: "existing-user" }, error: null }).then(onfulfilled);

    adminStub.from = vi.fn((table: string) => {
      if (table === "user_profiles") return userProfChain;
      return chainableQuery({ upsert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis() });
    });
    adminStub.auth = { admin: { createUser: vi.fn() } };
    vi.mocked(mockCreateServiceRole).mockResolvedValue(adminStub as never);

    const fd = createFormData();
    const result = await addStaffMember(fd);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateStaffPayMode
// ---------------------------------------------------------------------------
describe("updateStaffPayMode", () => {
  it("returns success when updated", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient());
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ upsert: vi.fn().mockReturnThis() })),
    } as never);

    const result = await updateStaffPayMode("staff-1", { payModel: "percentage", percentageRate: 40, fixedAmount: 0 });
    expect(result).toEqual({ success: true });
  });

  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await updateStaffPayMode("staff-1", { payModel: "percentage", percentageRate: 40, fixedAmount: 0 });
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// updateStaffRole
// ---------------------------------------------------------------------------
describe("updateStaffRole", () => {
  it("returns error when trying to change own role", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient("self-user"));
    const result = await updateStaffRole("self-user", "staff");
    expect(result).toEqual({ success: false, error: "No podés editar tu propio rol de administrador" });
  });

  it("returns success when changing other user role", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient("admin-user"));
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
    } as never);

    const result = await updateStaffRole("other-user", "staff");
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// updateStaffName
// ---------------------------------------------------------------------------
describe("updateStaffName", () => {
  it("returns error when name is empty", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient());
    const result = await updateStaffName("staff-1", "  ");
    expect(result).toEqual({ success: false, error: "El nombre no puede estar vacio" });
  });

  it("returns success when name is valid", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient());
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
    } as never);

    const result = await updateStaffName("staff-1", "Nuevo Nombre");
    expect(result).toEqual({ success: true });
    expect(mockRevalidate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeStaff
// ---------------------------------------------------------------------------
describe("removeStaff", () => {
  it("returns error when trying to remove self", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient("self-user"));
    const result = await removeStaff("self-user");
    expect(result).toEqual({ success: false, error: "No podés editar tu propio rol de administrador" });
  });

  it("returns success when removing other user", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(makeOwnerCheckClient("admin-user"));
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
    } as never);

    const result = await removeStaff("other-user");
    expect(result).toEqual({ success: true });
  });
});
