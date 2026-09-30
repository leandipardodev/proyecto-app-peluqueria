import { describe, it, expect } from "vitest";
import {
  buildPartnerReferralLink,
  buildPartnerWelcomeMessage,
  buildWhatsAppShareLink,
  formatPin,
} from "@/lib/referrals/partner-message";

const BASE = "https://klip.com.ar";

function message(overrides: Partial<Parameters<typeof buildPartnerWelcomeMessage>[0]> = {}) {
  return buildPartnerWelcomeMessage({
    name: "Ana Gonzalez",
    referralCode: "ana",
    pin: "472910",
    baseUrl: BASE,
    commissionPercent: 100,
    commissionMonths: 2,
    ...overrides,
  });
}

describe("formatPin", () => {
  it("separa los digitos de a uno", () => {
    expect(formatPin("472910")).toBe("4 7 2 9 1 0");
  });

  it("descarta cualquier cosa que no sea digito", () => {
    expect(formatPin("4a7-29 10")).toBe("4 7 2 9 1 0");
  });
});

describe("buildPartnerReferralLink", () => {
  it("arma /r/<codigo>", () => {
    expect(buildPartnerReferralLink(BASE, "ana")).toBe("https://klip.com.ar/r/ana");
  });

  it("no duplica la barra final", () => {
    expect(buildPartnerReferralLink("https://klip.com.ar/", "ana")).toBe("https://klip.com.ar/r/ana");
  });
});

describe("buildPartnerWelcomeMessage", () => {
  it("lleva el link, el codigo y el PIN", () => {
    const text = message();
    expect(text).toContain("https://klip.com.ar/r/ana");
    expect(text).toContain("Tu código: ana");
    expect(text).toContain("Tu PIN:    4 7 2 9 1 0");
  });

  it("el PIN aparece completo, sin truncar", () => {
    // El PIN es la unica credencial del vendedor y no se vuelve a mostrar en
    // ningun lado: si el mensaje lo pierde, el vendedor arranca sin acceso.
    expect(message()).toContain("4 7 2 9 1 0");
  });

  it("usa solo el primer nombre", () => {
    expect(message({ name: "Ana Gonzalez Perez" }).split("\n")[0]).toBe("Hola Ana, ya tenés tu acceso de Klip.");
  });

  it("explica la regla con los numeros de ese vendedor", () => {
    const text = message({ commissionPercent: 50, commissionMonths: 3 });
    expect(text).toContain("el 50% de lo que Klip recibe, durante los primeros 3 meses");
  });

  it("conforma el singular cuando es un solo mes", () => {
    expect(message({ commissionMonths: 1 })).toContain("durante los primeros 1 mes.");
  });

  it("apunta al panel del vendedor", () => {
    expect(message()).toContain("https://klip.com.ar/vendedores");
  });

  it("no fuerza un genero", () => {
    // El mismo texto se manda a vendedoras y a vendedores.
    expect(message({ name: "Beto Ruiz" }).split("\n")[0]).toBe("Hola Beto, ya tenés tu acceso de Klip.");
  });

  it("no rompe con el nombre vacio", () => {
    expect(message({ name: "" }).split("\n")[0]).toBe("Hola , ya tenés tu acceso de Klip.");
  });
});

describe("buildWhatsAppShareLink", () => {
  it("codifica el mensaje en el query", () => {
    const href = buildWhatsAppShareLink("hola mundo & algo más");
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(href.slice("https://wa.me/?text=".length))).toBe("hola mundo & algo más");
  });

  it("un link de referidos con query no rompe el escape", () => {
    const href = buildWhatsAppShareLink(message());
    expect(href).not.toContain(" ");
  });
});
