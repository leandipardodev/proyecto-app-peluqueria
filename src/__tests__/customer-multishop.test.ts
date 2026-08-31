import { describe, it, expect, vi } from "vitest";
import { resolveCustomer } from "@/lib/dashboard/booking/public-booking-actions";

// Recording admin stub focused on the "customers" table, simulating a store of
// existing customers keyed by (shop_id, telefono). Every insert mints a fresh uuid
// (never the authenticated user id) so we can assert multi-shop isolation.
function makeCustomerAdmin() {
  let nextId = 0;
  const existing: Array<{ id: string; shop_id: string; telefono: string | null }> = [];
  const inserts: Array<Record<string, unknown>> = [];

  const from = vi.fn(() => {
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
        const hit = existing.find((e) => e.shop_id === state.shop && e.telefono === state.phone);
        return { data: hit ? { id: hit.id } : null, error: null };
      }),
      single: vi.fn().mockImplementation(async () => {
        const p = (insertPayload || {}) as Record<string, unknown>;
        const id = `gen-${++nextId}`;
        existing.push({ id, shop_id: p.shop_id as string, telefono: (p.telefono as string | null) ?? null });
        inserts.push(p);
        return { data: { id }, error: null };
      }),
    };
    return q;
  });

  return { client: { from } as never, getInserts: () => inserts, existing };
}

describe("resolveCustomer - multi-local", () => {
  it("NO keyea por id de usuario: crea una fila con uuid generado y shop_id correcto", async () => {
    const { client, getInserts } = makeCustomerAdmin();
    const res = await resolveCustomer(client, {
      shopId: "shop-A",
      customerName: "lala lala",
      customerPhone: "234654545454",
      customerEmail: "lala@x.com",
      authenticatedUserId: "user-1",
    });

    expect(res.success).toBe(true);
    expect(res.data!.customerId).toBe("gen-1");
    expect(res.data!.customerId).not.toBe("user-1");
    const insert = getInserts()[0];
    expect(insert.shop_id).toBe("shop-A");
    expect(insert.user_id).toBe("user-1");
    expect(insert.id).toBeUndefined();
    expect(insert.telefono).toBe("234654545454");
  });

  it("el MISMO usuario en DOS locales crea DOS filas separadas (sin pisar shop_id)", async () => {
    const { client, getInserts } = makeCustomerAdmin();
    const a = await resolveCustomer(client, {
      shopId: "shop-A",
      customerName: "lala lala",
      customerPhone: "234654545454",
      authenticatedUserId: "user-1",
    });
    const b = await resolveCustomer(client, {
      shopId: "shop-B",
      customerName: "lala lala",
      customerPhone: "234654545454",
      authenticatedUserId: "user-1",
    });

    expect(a.success && b.success).toBe(true);
    expect(a.data!.customerId).not.toBe(b.data!.customerId);
    const inserts = getInserts();
    expect(inserts).toHaveLength(2);
    expect(inserts[0].shop_id).toBe("shop-A");
    expect(inserts[1].shop_id).toBe("shop-B");
  });

  it("reusa el customer existente del MISMO local (mismo telefono) y devuelve su id real", async () => {
    const { client, existing, getInserts } = makeCustomerAdmin();
    existing.push({ id: "real-cust-A", shop_id: "shop-A", telefono: "234654545454" });

    const res = await resolveCustomer(client, {
      shopId: "shop-A",
      customerName: "lala lala",
      customerPhone: "234654545454",
      authenticatedUserId: "user-1",
    });

    expect(res.success).toBe(true);
    expect(res.data!.customerId).toBe("real-cust-A");
    expect(getInserts()).toHaveLength(0);
  });

  it("un mismo telefono en DOS locales NO se reutiliza entre shops (aislamiento)", async () => {
    const { client, existing } = makeCustomerAdmin();
    existing.push({ id: "cust-A", shop_id: "shop-A", telefono: "234654545454" });

    const b = await resolveCustomer(client, {
      shopId: "shop-B",
      customerName: "lala lala",
      customerPhone: "234654545454",
      authenticatedUserId: "user-1",
    });

    expect(b.success).toBe(true);
    expect(b.data!.customerId).not.toBe("cust-A");
  });
});
