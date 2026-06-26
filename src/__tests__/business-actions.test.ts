import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchBusinessData,
  updateBusinessInfo,
  updateMercadoPagoKeysAction,
  getMercadoPagoOauthUrlAction,
  disconnectMercadoPagoOauthAction,
  fetchBusinessHours,
  updateBusinessHours,
  updateWhatsappTemplateAction,
  updateLoyaltyProgramAction,
  runLoyaltyRaffleAction,
  updateBookingDepositPolicyAction,
} from "@/lib/dashboard/business-actions";
import {
  requireShopId as mockRequireShopId,
  requireOwnerShopId as mockRequireOwnerShopId,
  createServiceRoleClient as mockCreateServiceRole,
} from "@/lib/dashboard/auth-server";
import { revalidateDashboardSegments as mockRevalidate } from "@/lib/dashboard/revalidate-dashboard";
import { supabaseStub, chainableQuery } from "@/__tests__/setup";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(mockRequireShopId).mockResolvedValue({ success: true, data: "shop-123" });
  vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: true, data: "shop-123" });
  vi.mocked(mockCreateServiceRole).mockResolvedValue(supabaseStub());
});

// ---------------------------------------------------------------------------
// fetchBusinessData
// ---------------------------------------------------------------------------
describe("fetchBusinessData", () => {
  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await fetchBusinessData();
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("returns error when shopId is empty", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: true, data: "" });
    const result = await fetchBusinessData();
    expect(result).toEqual({ success: false, error: "LOCAL_INVALIDO" });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
      })),
    } as never);

    const result = await fetchBusinessData("shop-123");
    expect(result).toEqual({ success: false, error: "DB error" });
  });

  it("returns success with transformed data", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "shop-123",
            nombre: "Mi Local",
            description: "Una peluqueria",
            address: "Calle 123",
            localidad: "CABA",
            phone: "123456789",
            instagram_url: "https://instagram.com/milocal",
            facebook_url: null,
            tiktok_url: null,
            mp_public_key: "pub-key",
            mp_access_token: "access-token",
            whatsapp_template: "Hola @nombre tu turno es @Hora en @ubicacion",
            loyalty_enabled: true,
            loyalty_cuts_required: 10,
            loyalty_discount_percent: 20,
            booking_deposit_enabled: false,
            booking_deposit_amount: 0,
          },
          error: null,
        }),
      })),
    } as never);

    const result = await fetchBusinessData("shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.nombre).toBe("Mi Local");
    expect(result.data.mp_oauth_connected).toBe(true);
    expect(result.data.loyalty_enabled).toBe(true);
    expect(result.data.loyalty_cuts_required).toBe(10);
    expect(result.data.booking_deposit_enabled).toBe(false);
  });

  it("uses shopIdOverride instead of requireShopId", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        single: vi.fn().mockResolvedValue({
          data: { id: "override-shop", nombre: "Override", mp_public_key: "", mp_access_token: "" },
          error: null,
        }),
      })),
    } as never);

    const result = await fetchBusinessData("override-shop");
    expect(result.success).toBe(true);
    expect(mockRequireShopId).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateBusinessInfo
// ---------------------------------------------------------------------------
describe("updateBusinessInfo", () => {
  function createFormData(overrides: Record<string, string> = {}): FormData {
    const fd = new FormData();
    fd.set("nombre", overrides.nombre ?? "Mi Local Updated");
    fd.set("description", overrides.description ?? "Nueva descripcion");
    fd.set("address", overrides.address ?? "Calle 456");
    fd.set("localidad", overrides.localidad ?? "CABA");
    fd.set("phone", overrides.phone ?? "987654321");
    fd.set("instagram_url", overrides.instagram_url ?? "");
    return fd;
  }

  it("returns success when update is valid", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
    } as never);

    const fd = createFormData();
    const result = await updateBusinessInfo(fd);
    expect(result).toEqual({ success: true });
    expect(mockRevalidate).toHaveBeenCalledWith("shop-123", ["/business"]);
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const fd = createFormData();
    const result = await updateBusinessInfo(fd);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("returns error on DB failure", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        update: vi.fn(() => chainableQuery({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "Update failed" } }),
        })),
      })),
    } as never);

    const fd = createFormData();
    const result = await updateBusinessInfo(fd);
    expect(result).toEqual({ success: false, error: "Update failed" });
  });
});

// ---------------------------------------------------------------------------
// updateMercadoPagoKeysAction
// ---------------------------------------------------------------------------
describe("updateMercadoPagoKeysAction", () => {
  it("returns success when keys are updated", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
    } as never);

    const result = await updateMercadoPagoKeysAction("pub-key", "access-token");
    expect(result).toEqual({ success: true });
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "No eres owner" });
    const result = await updateMercadoPagoKeysAction("pub-key", "token");
    expect(result).toEqual({ success: false, error: "No eres owner" });
  });
});

// ---------------------------------------------------------------------------
// getMercadoPagoOauthUrlAction
// ---------------------------------------------------------------------------
describe("getMercadoPagoOauthUrlAction", () => {
  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "No eres owner" });
    const result = await getMercadoPagoOauthUrlAction();
    expect(result).toEqual({ success: false, error: "No eres owner" });
  });

  it("returns success with auth URL", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: true, data: "shop-123" });
    vi.stubEnv("MP_OAUTH_CLIENT_ID", "test-client-id");
    vi.stubEnv("MP_OAUTH_STATE_SECRET", "test-state-secret");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://klip.com.ar");

    const result = await getMercadoPagoOauthUrlAction();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.url).toContain("auth.mercadopago.com/authorization");
    expect(result.data.url).toContain("client_id=test-client-id");
    expect(decodeURIComponent(result.data.url)).toContain("redirect_uri=https://klip.com.ar/api/payments/mercadopago-oauth/callback");
  });
});

// ---------------------------------------------------------------------------
// disconnectMercadoPagoOauthAction
// ---------------------------------------------------------------------------
describe("disconnectMercadoPagoOauthAction", () => {
  it("returns success when disconnected", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
    } as never);

    const result = await disconnectMercadoPagoOauthAction();
    expect(result).toEqual({ success: true });
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "No eres owner" });
    const result = await disconnectMercadoPagoOauthAction();
    expect(result).toEqual({ success: false, error: "No eres owner" });
  });
});

// ---------------------------------------------------------------------------
// fetchBusinessHours
// ---------------------------------------------------------------------------
describe("fetchBusinessHours", () => {
  it("returns default hours when no data", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        single: vi.fn().mockResolvedValue({ data: { business_hours: null }, error: null }),
      })),
    } as never);

    const result = await fetchBusinessHours("shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.monday.open).toBe(true);
    expect(result.data.monday.start).toBe("09:00");
    expect(result.data.sunday.open).toBe(false);
  });

  it("returns parsed business hours from DB", async () => {
    const dbHours = {
      monday: { open: true, start: "08:00", end: "18:00" },
      tuesday: { open: false, start: "09:00", end: "20:00" },
    };
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        single: vi.fn().mockResolvedValue({ data: { business_hours: dbHours }, error: null }),
      })),
    } as never);

    const result = await fetchBusinessHours("shop-123");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.monday.start).toBe("08:00");
    expect(result.data.tuesday.open).toBe(false);
  });

  it("returns error when requireShopId fails", async () => {
    vi.mocked(mockRequireShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await fetchBusinessHours();
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// updateBusinessHours
// ---------------------------------------------------------------------------
describe("updateBusinessHours", () => {
  const validHours = {
    monday: { open: true, start: "09:00", end: "20:00" },
    tuesday: { open: false, start: "09:00", end: "20:00" },
  };

  it("returns success when hours are valid", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
    } as never);

    const result = await updateBusinessHours(validHours);
    expect(result).toEqual({ success: true });
    expect(mockRevalidate).toHaveBeenCalledWith("shop-123", ["/business"]);
  });

  it("returns error when end <= start", async () => {
    const badHours = {
      monday: { open: true, start: "20:00", end: "09:00" },
    };
    const result = await updateBusinessHours(badHours);
    expect(result.success).toBe(false);
    expect(result.error).toContain("cierre debe ser posterior");
  });

  it("returns error when break_start without break_end", async () => {
    const badHours = {
      monday: { open: true, start: "09:00", end: "20:00", break_start: "12:00" },
    };
    const result = await updateBusinessHours(badHours);
    expect(result.success).toBe(false);
    expect(result.error).toContain("completar inicio y fin");
  });

  it("returns error when break outside working hours", async () => {
    const badHours = {
      monday: { open: true, start: "09:00", end: "20:00", break_start: "08:00", break_end: "08:30" },
    };
    const result = await updateBusinessHours(badHours);
    expect(result.success).toBe(false);
    expect(result.error).toContain("debe quedar entre apertura y cierre");
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await updateBusinessHours(validHours);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });

  it("normalizes day keys to lowercase", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
    } as never);

    const mixedCase = {
      Monday: { open: true, start: "10:00", end: "18:00" },
    };
    const result = await updateBusinessHours(mixedCase as never);
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// updateWhatsappTemplateAction
// ---------------------------------------------------------------------------
describe("updateWhatsappTemplateAction", () => {
  function mockShopWithAddress(address?: string, nombre?: string) {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        single: vi.fn().mockResolvedValue({ data: { address: address ?? "Calle 123", nombre: nombre ?? "Local" }, error: null }),
        update: vi.fn().mockReturnThis(),
      })),
    } as never);
  }

  it("returns success with valid template", async () => {
    mockShopWithAddress();
    const result = await updateWhatsappTemplateAction("Hola @nombre, tu turno es @Hora en @Lugar");
    expect(result).toEqual({ success: true });
  });

  it("returns error when template missing @Hora", async () => {
    mockShopWithAddress();
    const result = await updateWhatsappTemplateAction("Hola @nombre, tu turno en @Lugar");
    expect(result.success).toBe(false);
    expect(result.error).toContain("@Hora");
  });

  it("returns error when template missing @Lugar", async () => {
    mockShopWithAddress();
    const result = await updateWhatsappTemplateAction("Hola @nombre, tu turno es @Hora");
    expect(result.success).toBe(false);
    expect(result.error).toContain("@Lugar");
  });

  it("returns error when shop has no address or nombre", async () => {
    mockShopWithAddress("", "");
    const result = await updateWhatsappTemplateAction("Hola @nombre, tu turno es @Hora en @Lugar");
    expect(result.success).toBe(false);
    expect(result.error).toBe("La ubicación es indispensable para el cliente");
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await updateWhatsappTemplateAction("Hola @Hora @Lugar");
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// updateLoyaltyProgramAction
// ---------------------------------------------------------------------------
describe("updateLoyaltyProgramAction", () => {
  it("returns success with valid values", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
    } as never);

    const result = await updateLoyaltyProgramAction(true, 10, 20);
    expect(result).toEqual({ success: true });
    expect(mockRevalidate).toHaveBeenCalledWith("shop-123", ["/business", "/customers"]);
  });

  it("clamps cutsRequired to minimum 1", async () => {
    let updatedData: Record<string, unknown> | undefined;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        update: vi.fn((data: Record<string, unknown>) => {
          updatedData = data;
          return chainableQuery();
        }),
      })),
    } as never);

    await updateLoyaltyProgramAction(true, 0, 10);
    expect((updatedData as { loyalty_cuts_required: number })?.loyalty_cuts_required).toBe(1);
  });

  it("clamps discountPercent between 0 and 100", async () => {
    let updatedData: Record<string, unknown> | undefined;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        update: vi.fn((data: Record<string, unknown>) => {
          updatedData = data;
          return chainableQuery();
        }),
      })),
    } as never);

    await updateLoyaltyProgramAction(true, 5, 150);
    expect((updatedData as { loyalty_discount_percent: number })?.loyalty_discount_percent).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// runLoyaltyRaffleAction
// ---------------------------------------------------------------------------
describe("runLoyaltyRaffleAction", () => {
  it("returns error when no customers available", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    } as never);

    const result = await runLoyaltyRaffleAction("Premio", 1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("No hay clientes");
  });

  it("returns a winner when customers exist", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: "c1", nombre: "Cliente 1" },
            { id: "c2", nombre: "Cliente 2" },
            { id: "c3", nombre: "Cliente 3" },
          ],
          error: null,
        }),
      })),
    } as never);

    const result = await runLoyaltyRaffleAction("Sorteo prueba", 1);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.prizeName).toBe("Sorteo prueba");
    expect(result.data.participants).toBe(3);
    expect(result.data.winner).toBeDefined();
    expect(result.data.candidateNames).toHaveLength(3);
  });

  it("filters out customers without name", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: "c1", nombre: "  " },
            { id: "c2", nombre: "Real name" },
          ],
          error: null,
        }),
      })),
    } as never);

    const result = await runLoyaltyRaffleAction("Premio", 1);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.participants).toBe(1);
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "SESION_EXPIRADA" });
    const result = await runLoyaltyRaffleAction("Premio", 1);
    expect(result).toEqual({ success: false, error: "SESION_EXPIRADA" });
  });
});

// ---------------------------------------------------------------------------
// updateBookingDepositPolicyAction
// ---------------------------------------------------------------------------
describe("updateBookingDepositPolicyAction", () => {
  it("returns success when policy is updated", async () => {
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({ update: vi.fn().mockReturnThis() })),
    } as never);

    const result = await updateBookingDepositPolicyAction(true, 500);
    expect(result).toEqual({ success: true });
    expect(mockRevalidate).toHaveBeenCalledWith("shop-123", ["/business", "/book"]);
  });

  it("returns error when requireOwnerShopId fails", async () => {
    vi.mocked(mockRequireOwnerShopId).mockResolvedValue({ success: false, error: "No eres owner" });
    const result = await updateBookingDepositPolicyAction(true, 500);
    expect(result).toEqual({ success: false, error: "No eres owner" });
  });

  it("clamps deposit amount to minimum 0", async () => {
    let updatedData: Record<string, unknown> | undefined;
    vi.mocked(mockCreateServiceRole).mockResolvedValue({
      from: vi.fn(() => chainableQuery({
        update: vi.fn((data: Record<string, unknown>) => {
          updatedData = data;
          return chainableQuery();
        }),
      })),
    } as never);

    await updateBookingDepositPolicyAction(true, -100);
    const data = updatedData as { booking_deposit_amount: number } | undefined;
    expect(data?.booking_deposit_amount).toBe(0);
  });
});
