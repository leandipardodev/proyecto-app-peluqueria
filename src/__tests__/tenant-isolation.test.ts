import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveAuthorizedShopId } from "@/lib/dashboard/auth/server";
import { supabaseStub, chainableQuery } from "@/__tests__/setup";
import { createServiceRoleClient as mockCreateServiceRole } from "@/lib/dashboard/auth/server";
import { getAuthSession as mockGetAuthSession, getCurrentUserRole as mockGetCurrentUserRole } from "@/lib/dashboard/auth/server";
import { createService } from "@/lib/dashboard/services/service-actions";
import { createExpense } from "@/lib/dashboard/finances/finances-actions";
import { updateStock } from "@/lib/dashboard/inventory/inventory-actions";
import { getWhatsAppAutomationOverviewForShop } from "@/lib/dashboard/whatsapp/wa-actions";

/**
 * Regresion del bypass de tenant isolation:
 *
 *   let shopId = shopIdOverride;
 *   if (!shopId) { await requireOwnerShopId(); }   // <- solo corria SIN argumento
 *   const admin = await createAdminClient();       // service role, RLS off
 *
 * Como la UI siempre pasa el shopId, la autorizacion nunca ocurria: un miembro
 * (incluso role=staff) de un salon podia escribir en el de otro.
 */

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockCreateServiceRole).mockResolvedValue(supabaseStub());
  vi.mocked(mockGetAuthSession).mockResolvedValue({ user: { id: "user-1" } } as never);
});

describe("resolveAuthorizedShopId", () => {
  it("rechaza a un usuario sin sesion cuando viene shopId explicito", async () => {
    vi.mocked(mockGetAuthSession).mockResolvedValue(null as never);
    const result = await resolveAuthorizedShopId("shop-ajeno", "owner");
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("rechaza a un no miembro del local", async () => {
    vi.mocked(mockGetCurrentUserRole).mockResolvedValue({ success: false, error: "SIN_ACCESO" } as never);
    const result = await resolveAuthorizedShopId("shop-ajeno", "owner");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
  });

  it("exige rol owner cuando el modo es owner", async () => {
    vi.mocked(mockGetCurrentUserRole).mockResolvedValue({ success: true, data: { role: "staff", userId: "u1" } } as never);
    const owner = await resolveAuthorizedShopId("shop-1", "owner");
    expect(owner).toEqual({ success: false, error: "Solo el owner del local puede realizar esta accion" });
  });

  it("permite a un staff en modo member", async () => {
    vi.mocked(mockGetCurrentUserRole).mockResolvedValue({ success: true, data: { role: "staff", userId: "u1" } } as never);
    const result = await resolveAuthorizedShopId("shop-1", "member");
    expect(result).toEqual({ success: true, data: "shop-1" });
  });

  it("permite a un owner", async () => {
    vi.mocked(mockGetCurrentUserRole).mockResolvedValue({ success: true, data: { role: "owner", userId: "u1" } } as never);
    const result = await resolveAuthorizedShopId("shop-1", "owner");
    expect(result).toEqual({ success: true, data: "shop-1" });
  });

  it("delega en la sesion cuando NO viene shopId", async () => {
    const result = await resolveAuthorizedShopId(undefined, "member");
    // requireShopId esta mockeado sin valor por defecto -> falla la sesion
    expect(result.success).toBe(false);
  });
});

describe("acciones mutantes con shopId de otro local", () => {
  const notMember = { success: false, error: "SIN_ACCESO" } as never;

  beforeEach(() => {
    vi.mocked(mockGetCurrentUserRole).mockResolvedValue(notMember);
  });

  it("createService no crea el servicio en el local ajeno", async () => {
    const stub = supabaseStub();
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);

    const fd = new FormData();
    fd.set("name", "Corte");
    fd.set("price", "1000");
    fd.set("duration_minutes", "30");

    const result = await createService(fd, "shop-ajeno");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("createExpense no inyecta el gasto en el local ajeno", async () => {
    const stub = supabaseStub();
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);

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
    const stub = supabaseStub();
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);

    const result = await updateStock("prod-1", -50, "shop-ajeno");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("getWhatsAppAutomationOverviewForShop no filtra ids de otro local", async () => {
    const stub = supabaseStub();
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);

    const result = await getWhatsAppAutomationOverviewForShop("shop-ajeno");
    expect(result).toEqual({ success: false, error: "SIN_ACCESO_LOCAL" });
    expect(stub.from).not.toHaveBeenCalled();
  });
});

describe("un staff no puede escribir ni en su propio local si la accion pide owner", () => {
  it("createService se rechaza con rol staff", async () => {
    const stub = supabaseStub();
    vi.mocked(mockCreateServiceRole).mockResolvedValue(stub);
    vi.mocked(mockGetCurrentUserRole).mockResolvedValue({ success: true, data: { role: "staff", userId: "u1" } } as never);

    const fd = new FormData();
    fd.set("name", "Corte");
    fd.set("price", "1000");
    fd.set("duration_minutes", "30");

    const result = await createService(fd, "shop-propio");
    expect(result).toEqual({ success: false, error: "Solo el owner del local puede realizar esta accion" });
    expect(stub.from).not.toHaveBeenCalled();
  });
});
