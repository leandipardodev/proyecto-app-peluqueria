import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateClientProfile } from "@/lib/dashboard/clients/actions";
import { getAuthSession as mockGetAuthSession, getShopId as mockGetShopId } from "@/lib/dashboard/auth/server";
import { createServerClient as mockCreateServerClient } from "@/lib/supabase/server";
import { supabaseStub } from "@/__tests__/setup";

const { adminClientMock } = vi.hoisted(() => ({ adminClientMock: vi.fn() }));

vi.mock("@/lib/dashboard/appointments/shared", () => ({
  createAdminClient: adminClientMock,
}));

// Recording admin stub for the "customers" table: select lookup keyed by
// (shop_id, telefono), and insert that mints a fresh uuid (never the user id).
function makeCustomerAdmin(seed: Array<{ id: string; shop_id: string; telefono: string | null }> = []) {
  const existing = [...seed];
  const inserts: Array<Record<string, unknown>> = [];
  let nextId = 0;

  const chain = () => {
    let insertPayload: unknown;
    const state: { shop?: string; phone?: string | null } = {};
    const q = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockImplementation((p: unknown) => {
        insertPayload = p;
        return q;
      }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((key: string, value: unknown) => {
        if (key === "shop_id") state.shop = value as string;
        if (key === "telefono") state.phone = value as string | null;
        return q;
      }),
      is: vi.fn().mockImplementation((key: string) => {
        if (key === "telefono") state.phone = null;
        return q;
      }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockImplementation(async () => {
        if (insertPayload) {
          const p = (insertPayload || {}) as Record<string, unknown>;
          const id = `gen-${++nextId}`;
          existing.push({ id, shop_id: p.shop_id as string, telefono: (p.telefono as string | null) ?? null });
          inserts.push(p);
          return { data: { id }, error: null };
        }
        const hit = existing.find((e) => e.shop_id === state.shop && e.telefono === state.phone);
        return { data: hit ? { id: hit.id } : null, error: null };
      }),
    };
    return q;
  };

  adminClientMock.mockResolvedValue({ from: chain });

  return { existing, getInserts: () => inserts };
}

function makeFormData(phone: string) {
  const fd = new FormData();
  fd.set("name", "lala lala");
  fd.set("phone", phone);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockGetAuthSession).mockResolvedValue({ user: { id: "client-user" } } as never);
  vi.mocked(mockGetShopId).mockResolvedValue("shop-1");
  vi.mocked(mockCreateServerClient).mockResolvedValue(supabaseStub());
});

describe("updateClientProfile - self-service multi-shop", () => {
  it("crea una fila con uuid generado (nunca id = user.id) y shop_id correcto", async () => {
    const { getInserts } = makeCustomerAdmin();
    const res = await updateClientProfile(makeFormData("234654545454"));

    expect(res.success).toBe(true);
    const insert = getInserts()[0];
    expect(insert).toBeDefined();
    expect(insert.shop_id).toBe("shop-1");
    expect(insert.user_id).toBe("client-user");
    expect(insert.id).toBeUndefined();
    expect(insert.telefono).toBe("234654545454");
  });

  it("reusa el customer existente del mismo local por telefono y no inserta de nuevo", async () => {
    const { getInserts } = makeCustomerAdmin([{ id: "real-client", shop_id: "shop-1", telefono: "234654545454" }]);
    const res = await updateClientProfile(makeFormData("234654545454"));

    expect(res.success).toBe(true);
    expect(getInserts()).toHaveLength(0);
  });
});
