import { describe, it, expect, vi, beforeEach } from "vitest";
import { addProduct, updateStock, applyStockBatchAdjustments, deleteProduct } from "@/lib/dashboard/inventory/inventory-actions";
import { createServerClient as mockCreateServerClient } from "@/lib/supabase/server";
import { requireOwnerShopId as mockRequireOwnerShopId, requireShopId as mockRequireShopId } from "@/lib/dashboard/auth/server";
import { supabaseStub, chainableQuery } from "@/__tests__/setup";

function createFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("nombre_producto", overrides.nombre_producto ?? "Shampoo");
  fd.set("quantity", overrides.quantity ?? "10");
  fd.set("unit_cost", overrides.unit_cost ?? "250");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockRequireShopId).mockResolvedValue({ success: true, data: "shop-123" });
  vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: true, data: "shop-123" });
});

describe("addProduct", () => {
  it("returns error when nombre_producto is empty", async () => {
    const fd = createFormData({ nombre_producto: "" });
    const result = await addProduct(fd);
    expect(result.success).toBe(false);
    expect(result).toEqual({ success: false, error: "Todos los campos son obligatorios" });
  });

  it("returns error when quantity is NaN", async () => {
    const fd = createFormData({ quantity: "abc" });
    const result = await addProduct(fd);
    expect(result.success).toBe(false);
    expect(result).toEqual({ success: false, error: "Todos los campos son obligatorios" });
  });

  it("returns error when unit_cost is NaN", async () => {
    const fd = createFormData({ unit_cost: "" });
    const result = await addProduct(fd);
    expect(result.success).toBe(false);
    expect(result).toEqual({ success: false, error: "Todos los campos son obligatorios" });
  });

  it("returns error for negative quantity", async () => {
    const fd = createFormData({ quantity: "-5" });
    const result = await addProduct(fd);
    expect(result.success).toBe(false);
    expect(result).toEqual({ success: false, error: "Los valores no pueden ser negativos" });
  });

  it("returns error for negative unit_cost", async () => {
    const fd = createFormData({ unit_cost: "-100" });
    const result = await addProduct(fd);
    expect(result.success).toBe(false);
    expect(result).toEqual({ success: false, error: "Los valores no pueden ser negativos" });
  });

  it("returns success when product is created", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(supabaseStub());
    const fd = createFormData();
    const result = await addProduct(fd);
    expect(result.success).toBe(true);
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const fd = createFormData();
    const result = await addProduct(fd);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("accepts 'name' field as fallback for nombre_producto", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(supabaseStub());
    const fd = new FormData();
    fd.set("name", "Acondicionador");
    fd.set("quantity", "5");
    fd.set("unit_cost", "300");
    const result = await addProduct(fd);
    expect(result.success).toBe(true);
  });

  it("uses shopIdOverride when provided", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue(supabaseStub());
    const fd = createFormData();
    const result = await addProduct(fd, "override-shop");
    expect(result.success).toBe(true);
  });
});

describe("updateStock", () => {
  it("returns error when product not found", async () => {
    const mockSupabase = vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any);

    const result = await updateStock("nonexistent-id", -1);
    expect(result).toEqual({ success: false, error: "Producto no encontrado" });
  });

  it("returns error when new quantity would be negative", async () => {
    const mockSupabase = vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { quantity: 3 }, error: null }),
            }),
          }),
        }),
        update: vi.fn(),
      }),
    } as any);

    const result = await updateStock("prod-1", -5);
    expect(result).toEqual({ success: false, error: "La cantidad no puede ser negativa" });
  });

  it("returns success when update is valid", async () => {
    const mockSupabase = vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { quantity: 10 }, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any);

    const result = await updateStock("prod-1", -3);
    expect(result).toEqual({ success: true });
  });
});

describe("applyStockBatchAdjustments", () => {
  it("returns success for empty adjustments", async () => {
    const result = await applyStockBatchAdjustments([]);
    expect(result).toEqual({ success: true });
  });

  it("deduplicates same id with cumulative delta", async () => {
    const mockSupabase = vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [{ id: "prod-1", quantity: 10 }], error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any);

    const result = await applyStockBatchAdjustments([
      { id: "prod-1", delta: -2 },
      { id: "prod-1", delta: -1 },
    ]);
    expect(result).toEqual({ success: true });
  });

  it("returns error when product not found", async () => {
    const mockSupabase = vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any);

    const result = await applyStockBatchAdjustments([{ id: "prod-missing", delta: -1 }]);
    expect(result).toEqual({ success: false, error: "Producto no encontrado" });
  });

  it("returns error when delta would make quantity negative", async () => {
    const mockSupabase = vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [{ id: "prod-1", quantity: 2 }], error: null }),
          }),
        }),
      }),
    } as any);

    const result = await applyStockBatchAdjustments([{ id: "prod-1", delta: -5 }]);
    expect(result).toEqual({ success: false, error: "La cantidad no puede ser negativa" });
  });

  it("filters out invalid adjustments", async () => {
    const result = await applyStockBatchAdjustments([
      { id: "", delta: -1 },
      { id: "prod-1", delta: NaN },
      { id: "prod-2", delta: 0 },
    ] as never);
    expect(result).toEqual({ success: true });
  });
});

describe("deleteProduct", () => {
  it("returns success when product is deleted", async () => {
    vi.mocked(mockCreateServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any);

    const result = await deleteProduct("prod-1");
    expect(result).toEqual({ success: true });
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await deleteProduct("prod-1");
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});
