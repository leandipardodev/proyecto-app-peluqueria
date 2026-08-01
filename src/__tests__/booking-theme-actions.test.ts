import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchBookingTheme, upsertBookingTheme, uploadBookingLogo } from "@/lib/dashboard/shop/booking-theme-actions";
import { requireShopId as mockRequireShopId, getAuthSession as mockGetAuthSession, getShopIdBySlug as mockGetShopIdBySlug, getCurrentUserRole as mockGetCurrentUserRole, createServiceRoleClient as mockCreateServiceRole } from "@/lib/dashboard/auth/server";
import { revalidatePath as mockRevalidatePath } from "next/cache";
import { supabaseStub, chainableQuery } from "@/__tests__/setup";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mockRequireShopId).mockResolvedValue({ success: true, data: "shop-123" });
  vi.mocked(mockCreateServiceRole).mockResolvedValue(supabaseStub());
  vi.mocked(mockGetAuthSession).mockResolvedValue({ user: { id: "user-1" } });
  vi.mocked(mockGetCurrentUserRole).mockResolvedValue({ success: true, data: { role: "owner", userId: "user-1" } });
});

// ---------------------------------------------------------------------------
// fetchBookingTheme
// ---------------------------------------------------------------------------
describe("fetchBookingTheme", () => {
  it("returns null when no theme exists", async () => {
    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({ data: null, error: null }).then(onfulfilled);
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await fetchBookingTheme("shop-123");
    expect(result).toEqual({ success: true, data: null });
  });

  it("returns theme data with normalized fields", async () => {
    const raw = {
      shop_id: "shop-123",
      template_id: "minimal-glass",
      section_order: ["General", " Premium "],
      section_service_order: [" Cortes ", ""],
      logo_url: "https://example.com/logo.png",
      logo_storage_path: "shops/shop-123/branding/logo.png",
      hero_title: "Bienvenido",
    };

    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({ data: raw, error: null }).then(onfulfilled);
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await fetchBookingTheme("shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data?.template_id).toBe("minimal-glass");
    expect(result.data?.section_order).toEqual(["General", "Premium"]);
    expect(result.data?.section_service_order).toEqual(["Cortes"]);
    expect(result.data?.hero_title).toBe("Bienvenido");
  });

  it("returns default template for invalid template_id", async () => {
    const raw = {
      shop_id: "shop-123",
      template_id: "nonexistent",
      section_order: null,
      section_service_order: null,
      logo_url: null,
      logo_storage_path: null,
      hero_title: null,
    };

    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({ data: raw, error: null }).then(onfulfilled);
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await fetchBookingTheme("shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data?.template_id).toBe("minimal-glass");
    expect(result.data?.section_order).toEqual(["General"]);
    expect(result.data?.section_service_order).toEqual([]);
  });

  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await fetchBookingTheme();
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("resolves shop by slug", async () => {
    vi.mocked(mockGetShopIdBySlug).mockResolvedValue({ shop_id: "shop-slug-1" });

    const chain = chainableQuery();
    chain.then = (onfulfilled: any) =>
      Promise.resolve({ data: { shop_id: "shop-slug-1", template_id: "classic-dark" }, error: null }).then(onfulfilled);
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await fetchBookingTheme(undefined, "mi-local");
    expect(result.success).toBe(true);
    expect(mockGetShopIdBySlug).toHaveBeenCalledWith("mi-local", "user-1");
  });
});

// ---------------------------------------------------------------------------
// upsertBookingTheme
// ---------------------------------------------------------------------------
describe("upsertBookingTheme", () => {
  it("upserts theme data and revalidates paths", async () => {
    const shopChain = chainableQuery();
    shopChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: { slug: "mi-local" }, error: null }).then(onfulfilled);

    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "shop_booking_theme") return chainableQuery({ upsert: vi.fn().mockReturnThis() });
        if (table === "shops") return shopChain;
        return chainableQuery();
      }),
      auth: { getUser: vi.fn() },
    } as never);

    const result = await upsertBookingTheme({
      templateId: "editorial-luxury",
      sectionOrder: ["General", "Servicios"],
      heroTitle: "Hola",
    });

    expect(result).toEqual({ success: true });
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/book/mi-local");
  });

  it("returns error when resolveShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await upsertBookingTheme({ templateId: "classic-dark" });
    expect(result).toEqual({ success: false, error: "LOCAL_INVALIDO" });
  });
});

// ---------------------------------------------------------------------------
// uploadBookingLogo
// ---------------------------------------------------------------------------
describe("uploadBookingLogo", () => {
  function makeForm(file: File | null, shopSlug = "mi-local"): FormData {
    const fd = new FormData();
    fd.set("shopSlug", shopSlug);
    if (file) fd.set("logo", file);
    return fd;
  }

  beforeEach(() => {
    vi.mocked(mockGetShopIdBySlug).mockResolvedValue("shop-123");
  });

  it("returns error when no file", async () => {
    const result = await uploadBookingLogo(makeForm(null));
    expect(result).toEqual({ success: false, error: "Selecciona una imagen de logo" });
  });

  it("returns error when file exceeds 2MB", async () => {
    const bigFile = new File(["x".repeat(3 * 1024 * 1024)], "logo.png", { type: "image/png" });
    const result = await uploadBookingLogo(makeForm(bigFile));
    expect(result).toEqual({ success: false, error: "El logo supera 2MB" });
  });

  it("returns error for non-image file", async () => {
    const pdfFile = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const result = await uploadBookingLogo(makeForm(pdfFile));
    expect(result).toEqual({ success: false, error: "Archivo de imagen invalido" });
  });

  it("uploads and stores logo path", async () => {
    const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const pngFile = new File([pngBytes], "logo.png", { type: "image/png" });

    const adminStub = supabaseStub();
    adminStub.storage = {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: "shops/shop-123/branding/logo.png" }, error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn.example.com/logo.png" } })),
      })),
    };

    const upsertChain = chainableQuery({ upsert: vi.fn().mockReturnThis() });

    const shopChain = chainableQuery();
    shopChain.then = (onfulfilled: any) =>
      Promise.resolve({ data: { slug: "mi-local" }, error: null }).then(onfulfilled);

    adminStub.from = vi.fn((table: string) => {
      if (table === "shop_booking_theme") return upsertChain;
      if (table === "shops") return shopChain;
      return chainableQuery();
    });

    vi.mocked(mockCreateServiceRole).mockResolvedValue(adminStub as never);

    const result = await uploadBookingLogo(makeForm(pngFile));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data?.logoUrl).toBe("https://cdn.example.com/logo.png");
    expect(result.data?.storagePath).toBe("shops/shop-123/branding/logo.png");
    expect(mockRevalidatePath).toHaveBeenCalled();
  });
});
