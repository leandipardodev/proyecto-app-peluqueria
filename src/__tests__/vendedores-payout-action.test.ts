import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * El partnerId sale de la sesion firmada, no del formData. Si el action leyera
 * el id del formulario, un vendedor podria cambiar el input oculto y escribir
 * los datos de cobro de otro.
 */
const getPartnerSession = vi.fn(async () => ({ partnerId: "partner-sesion" }));
const saveOwnPayoutDetails = vi.fn(async () => ({ success: true }));

vi.mock("@/lib/referrals/partner-portal", () => ({
  getPartnerSession: (...args: unknown[]) => getPartnerSession(...(args as [])),
  saveOwnPayoutDetails: (...args: unknown[]) => saveOwnPayoutDetails(...(args as [string, unknown])),
  authenticatePartner: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  getPartnerSession.mockResolvedValue({ partnerId: "partner-sesion" });
  saveOwnPayoutDetails.mockResolvedValue({ success: true });
});

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

async function load() {
  return import("@/app/vendedores/actions");
}

describe("saveOwnPayoutAction", () => {
  it("escribe sobre el vendedor de la sesion, no el del formulario", async () => {
    const { saveOwnPayoutAction } = await load();

    await saveOwnPayoutAction(
      null,
      form({
        partnerId: "partner-ataque",
        payoutAlias: "ana.gonzalez",
        payoutCbu: "0001234567890123456789",
      }),
    );

    expect(saveOwnPayoutDetails).toHaveBeenCalledWith("partner-sesion", {
      payoutAlias: "ana.gonzalez",
      payoutCbu: "0001234567890123456789",
    });
  });

  it("corta si no hay sesion", async () => {
    getPartnerSession.mockResolvedValue(null);
    const { saveOwnPayoutAction } = await load();

    const result = await saveOwnPayoutAction(null, form({ payoutAlias: "ana" }));

    expect(result?.error).toContain("sesión");
    expect(saveOwnPayoutDetails).not.toHaveBeenCalled();
  });

  it("propaga el error de validacion del CBU", async () => {
    saveOwnPayoutDetails.mockResolvedValue({ success: false, error: "El CBU tiene que tener 22 dígitos" });
    const { saveOwnPayoutAction } = await load();

    const result = await saveOwnPayoutAction(null, form({ payoutAlias: "ana", payoutCbu: "123" }));

    expect(result).toEqual({ error: "El CBU tiene que tener 22 dígitos" });
  });

  it("devuelve saved cuando todo sale bien", async () => {
    const { saveOwnPayoutAction } = await load();

    const result = await saveOwnPayoutAction(null, form({ payoutAlias: "ana", payoutCbu: "" }));

    expect(result).toEqual({ saved: true });
  });
});
