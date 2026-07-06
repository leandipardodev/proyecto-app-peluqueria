import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createService,
  updateService,
  deleteService,
} from "@/lib/dashboard/services/service-actions";
import * as serviceActions from "@/lib/dashboard/services/service-actions";
import { createServiceRoleClient as mockCreateServiceRole } from "@/lib/dashboard/auth/server";
import { requireOwnerShopId as mockRequireOwnerShopId, requireShopId as mockRequireShopId } from "@/lib/dashboard/auth/server";
import { trackProductEvent as mockTrackProductEvent } from "@/lib/analytics/product-events";
import { supabaseStub, chainableQuery } from "@/__tests__/setup";

function createFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("name", overrides.name ?? "Corte moderno");
  fd.set("description", overrides.description ?? "");
  fd.set("price", overrides.price ?? "1500");
  fd.set("category", overrides.category ?? "Cortes");
  fd.set("duration_minutes", overrides.duration_minutes ?? "45");
  return fd;
}

function makeServiceRoleMock(
  override?: Partial<ReturnType<typeof vi.fn>>,
) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      ...override,
    })),
    rpc: vi.fn(),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockRequireShopId).mockResolvedValue({ success: true, data: "shop-123" });
  vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: true, data: "shop-123" });
  vi.mocked(mockCreateServiceRole).mockResolvedValue(supabaseStub());
});

describe("createService", () => {
  it("returns error when name is empty", async () => {
    const fd = createFormData({ name: "" });
    const result = await createService(fd);
    expect(result).toEqual({ success: false, error: "Todos los campos son obligatorios" });
  });

  it("returns error when price is NaN", async () => {
    const fd = createFormData({ price: "gratis" });
    const result = await createService(fd);
    expect(result).toEqual({ success: false, error: "Todos los campos son obligatorios" });
  });

  it("returns error when duration_minutes is NaN", async () => {
    const fd = createFormData({ duration_minutes: "" });
    const result = await createService(fd);
    expect(result).toEqual({ success: false, error: "Todos los campos son obligatorios" });
  });

  it("returns error for negative price", async () => {
    const fd = createFormData({ price: "-500" });
    const result = await createService(fd);
    expect(result).toEqual({ success: false, error: "El precio no puede ser negativo" });
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const fd = createFormData();
    const result = await createService(fd);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("returns success when service is created", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    } as never);

    const fd = createFormData();
    const result = await createService(fd);
    expect(result).toEqual({ success: true });
    expect(mockTrackProductEvent).toHaveBeenCalledWith("shop-123", "first_service_published");
  });

  it("defaults category to General when not provided", async () => {
    let insertedCategory: string | undefined;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn((row: Record<string, unknown>) => {
          insertedCategory = row.category as string;
          return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    } as never);

    const fd = createFormData({ category: "" });
    await createService(fd);
    expect(insertedCategory).toBe("General");
  });
});

describe("updateService", () => {
  it("returns error when name is empty", async () => {
    const fd = createFormData({ name: "" });
    const result = await updateService("svc-1", fd);
    expect(result).toEqual({ success: false, error: "Todos los campos son obligatorios" });
  });

  it("returns error when price is NaN", async () => {
    const fd = createFormData({ price: "abc" });
    const result = await updateService("svc-1", fd);
    expect(result).toEqual({ success: false, error: "Todos los campos son obligatorios" });
  });

  it("returns success when update is valid", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    } as never);

    const fd = createFormData({ name: "Corte degradado" });
    const result = await updateService("svc-1", fd);
    expect(result).toEqual({ success: true });
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const fd = createFormData();
    const result = await updateService("svc-1", fd);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

describe("deleteService", () => {
  it("returns success when service is deleted", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ delete: vi.fn().mockReturnThis() })),
    } as never);

    const result = await deleteService("svc-1");
    expect(result).toEqual({ success: true });
  });
});
