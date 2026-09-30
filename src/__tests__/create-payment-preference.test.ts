import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPaymentPreference } from "@/lib/dashboard/booking/public-booking-actions";
import { mockQueryResult } from "@/__tests__/setup";

const { adminClientMock, preferenceCreateMock } = vi.hoisted(() => ({
  adminClientMock: vi.fn(),
  preferenceCreateMock: vi.fn(),
}));

vi.mock("@/lib/dashboard/appointments/shared", () => ({
  createAdminClient: adminClientMock,
}));

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: vi.fn(),
  Preference: vi.fn(function () {
    return { create: preferenceCreateMock };
  }),
}));

vi.mock("@/lib/payments/shop-mp", () => ({
  buildShopNotificationUrl: vi.fn(() => "https://klip.com.ar/api/payments/mercadopago-webhook"),
  resolveShopMpToken: vi.fn(() => ({ ok: true, accessToken: "APP_USR-token" })),
}));

vi.mock("@/lib/payments/mp-payment-config", () => ({
  buildMpPaymentMethods: vi.fn(() => undefined),
  fetchShopMpPaymentConfig: vi.fn().mockResolvedValue({}),
}));

const SHOP = "shop-1";

/**
 * Datos reales de la base, para que la regresion se vea contra los numeros que
 * existen en produccion.
 *
 * "color y keratina" cuesta 25.000 pero sus dos servicios suman 60.000, y
 * "Alisado Progresivo + Corte" cuesta 18.000 contra 36.000 de partes. Ese
 * precio de combo mas bajo es el descuento; si el total se arma sumando los
 * precios de los servicios, el cliente paga el doble o el triple.
 */
const COMBOS: Record<string, { price: number; services: Array<{ id: string; price: number; hide_price: boolean }> }> = {
  "combo-color-keratina": {
    price: 25000,
    services: [
      { id: "svc-color", price: 40000, hide_price: false },
      { id: "svc-keratina", price: 20000, hide_price: false },
    ],
  },
  "combo-alisado": {
    price: 18000,
    services: [
      { id: "svc-alisado", price: 30000, hide_price: true },
      { id: "svc-corte", price: 6000, hide_price: false },
    ],
  },
  "combo-limpiza": {
    price: 70000,
    services: [
      { id: "svc-limpiza", price: 40000, hide_price: false },
      { id: "svc-analisis", price: 30040, hide_price: false },
    ],
  },
};

type ComboId = keyof typeof COMBOS;

function comboServices(comboId: ComboId) {
  return COMBOS[comboId].services;
}

/** Turnos ya creados, con el service_price que el prorrateo guardo. */
function comboAppointments(comboId: ComboId) {
  const combo = COMBOS[comboId];
  const total = combo.services.reduce((s, x) => s + x.price, 0);
  // Mismo prorrateo que createPublicComboAppointment: el ultimo absorbe el
  // redondeo, asi que la suma da EXACTAMENTE el precio del combo.
  const raw = combo.services.map((s) => (total > 0 ? (combo.price * s.price) / total : combo.price / combo.services.length));
  const rounded = raw.map((r) => Math.round(r * 100) / 100);
  const diff = Math.round((combo.price - rounded.reduce((a, b) => a + b, 0)) * 100) / 100;
  if (rounded.length) rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + diff) * 100) / 100;

  return combo.services.map((s, i) => ({
    id: `apt-${i + 1}`,
    service_id: s.id,
    service_price: rounded[i],
  }));
}

interface Routes {
  combos?: unknown;
  combo_services?: unknown;
  services?: unknown;
  appointments?: unknown;
  shops?: unknown;
}

/**
 * Stub con un contador por tabla.
 *
 * `appointments` se consulta dos veces con formas distintas: la primera es
 * .maybeSingle() del turno principal y tiene que devolver un objeto (con
 * customers.email), la segunda es el .in("id", [...]) de las filas a cobrar y
 * tiene que devolver un array. Un unico valor por tabla no sirve.
 */
function makeAdmin(routes: Routes) {
  const table: Record<string, unknown> = {
    combos: routes.combos ?? null,
    combo_services: routes.combo_services ?? [],
    services: routes.services ?? [],
    appointments: routes.appointments ?? null,
    shops: routes.shops ?? { booking_deposit_enabled: false, booking_deposit_amount: 0, mp_access_token: "APP_USR-x" },
  };
  const calls: Record<string, number> = {};

  return {
    from: vi.fn((t: string) => {
      calls[t] = (calls[t] ?? 0) + 1;
      const value = table[t] ?? null;
      // Solo appointments necesita el unwrap: las demas tablas siempre se leen
      // como lista y ahi un objeto rompe el .map del consumidor.
      const data = t === "appointments" && calls[t] === 1 && Array.isArray(value)
        ? (value[0] as Record<string, unknown>)
        : value;
      const chain = mockQueryResult(data);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
      chain.update = vi.fn(() => mockQueryResult(null, null));
      return chain;
    }),
  } as never;
}

/** Rutas para un combo: tabla combos, combo_services y services. */
function comboRoutes(comboId: ComboId, opts: { active?: boolean } = {}) {
  const services = comboServices(comboId);
  return {
    combos: {
      id: comboId,
      name: "combo",
      price: COMBOS[comboId].price,
      active: opts.active !== false,
      shop_id: SHOP,
    },
    combo_services: services.map((s) => ({ combo_id: comboId, service_id: s.id })),
    services: services.map((s) => ({
      id: s.id,
      name: s.id,
      duration_minutes: 30,
      price: s.price,
      hide_price: s.hide_price,
      shop_id: SHOP,
    })),
  };
}

/** El appointment principal, solo, devuelto por maybeSingle. */
function mainAppointment(comboId: ComboId) {
  const rows = comboAppointments(comboId);
  return { id: rows[0].id, shop_id: SHOP, service_id: rows[0].service_id, customers: { email: "a@b.com" } };
}

function chargedAmount(): number {
  const body = preferenceCreateMock.mock.calls[0][0].body;
  return body.items.reduce((sum: number, it: { unit_price: number }) => sum + it.unit_price, 0);
}

function metadata(): Record<string, string> {
  return preferenceCreateMock.mock.calls[0][0].body.metadata;
}

async function run(args: Parameters<typeof createPaymentPreference>[0]) {
  const res = await createPaymentPreference(args);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  adminClientMock.mockReset();
  preferenceCreateMock.mockResolvedValue({ id: "pref-1", init_point: "https://mp/checkout" });
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://klip.com.ar");
});

describe("createPaymentPreference — el precio lo pone la base, no el cliente", () => {
  it("cobra el precio del combo, no la suma de sus servicios", async () => {
    // Este es el bug: antes sumaba services.price y daba 60.000 en vez de 25.000.
    const comboId = "combo-color-keratina";
    const rows = comboAppointments(comboId);
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...comboRoutes(comboId),
        appointments: rows,
        shops: { booking_deposit_enabled: false, booking_deposit_amount: 0, mp_access_token: "APP_USR-x" },
      })
    );

    const res = await run({
      appointmentId: mainAppointment(comboId).id,
      shopId: SHOP,
      shopSlug: "pelu",
      comboId,
      comboAppointmentIds: rows.map((r) => r.id),
    });

    expect(res.success).toBe(true);
    expect(chargedAmount()).toBe(25000);
  });

  it("absorbe el redondeo: 70.040 de partes se cobran como 70.000", async () => {
    const comboId = "combo-limpiza";
    const rows = comboAppointments(comboId);
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...comboRoutes(comboId),
        appointments: rows,
      })
    );

    await run({
      appointmentId: mainAppointment(comboId).id,
      shopId: SHOP,
      shopSlug: "pelu",
      comboId,
      comboAppointmentIds: rows.map((r) => r.id),
    });

    expect(chargedAmount()).toBe(70000);
  });

  it("cobra el combo completo aunque uno de sus servicios sea 'a convenir'", async () => {
    // "Alisado Progresivo + Corte": el Alisado tiene hide_price, pero el combo
    // tiene precio propio y se cobra entero. Antes el filtro lo dejaba afuera:
    // se cobraba 6.000 en vez de 18.000 y ese turno no se confirmaba.
    const comboId = "combo-alisado";
    const rows = comboAppointments(comboId);
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...comboRoutes(comboId),
        appointments: rows,
      })
    );

    const res = await run({
      appointmentId: mainAppointment(comboId).id,
      shopId: SHOP,
      shopSlug: "pelu",
      comboId,
      comboAppointmentIds: rows.map((r) => r.id),
    });

    expect(res.success).toBe(true);
    expect(chargedAmount()).toBe(18000);
    // Los dos turnos entran como pagados: el combo entero se paga.
    expect(JSON.parse(metadata().paid_appointment_ids)).toEqual(["apt-1", "apt-2"]);
  });

  it("cae al carrito si el combo no verifica, y cobra el precio de la base", async () => {
    // Si el local edito el combo entre crear los turnos y pagar, el comboId ya
    // no matchea. No se rechaza: se cobra igual desde service_price, que viene
    // de la base. Lo que no puede pasar es que se cobre menos.
    const comboId = "combo-color-keratina";
    const rows = comboAppointments(comboId);
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...comboRoutes(comboId, { active: false }),
        appointments: rows,
      })
    );

    const res = await run({
      appointmentId: mainAppointment(comboId).id,
      shopId: SHOP,
      shopSlug: "pelu",
      comboId,
      comboAppointmentIds: rows.map((r) => r.id),
    });

    expect(res.success).toBe(true);
    // El prorrateo de este combo suma 25.000, que es el precio del combo.
    expect(chargedAmount()).toBe(25000);
  });

  it("un combo de otro local no habilita el precio del combo", async () => {
    const comboId = "combo-color-keratina";
    const rows = comboAppointments(comboId);
    const routes = comboRoutes(comboId);
    adminClientMock.mockResolvedValue(
      makeAdmin({
        ...routes,
        combos: { ...(routes.combos as Record<string, unknown>), shop_id: "OTRO-LOCAL" },
        appointments: rows,
      })
    );

    await run({
      appointmentId: mainAppointment(comboId).id,
      shopId: SHOP,
      shopSlug: "pelu",
      comboId,
      comboAppointmentIds: rows.map((r) => r.id),
    });

    // Sin verificar el combo se usa service_price, no el precio de otro local.
    expect(chargedAmount()).toBe(25000);
  });
});

describe("createPaymentPreference — carrito sin comboId", () => {
  it("cobra la suma de los servicios visibles del carrito", async () => {
    const services = [
      { id: "svc-a", name: "Corte", duration_minutes: 30, price: 15000, hide_price: false, shop_id: SHOP },
      { id: "svc-b", name: "Barba", duration_minutes: 30, price: 10000, hide_price: false, shop_id: SHOP },
    ];
    adminClientMock.mockResolvedValue(
      makeAdmin({
        services,
        appointments: [
          { id: "apt-1", service_id: "svc-a", service_price: 15000 },
          { id: "apt-2", service_id: "svc-b", service_price: 10000 },
        ],
      })
    );

    await run({ appointmentId: "apt-1", shopId: SHOP, shopSlug: "pelu", comboAppointmentIds: ["apt-1", "apt-2"] });

    expect(chargedAmount()).toBe(25000);
  });

  it("excluye del cobro y del set pagado el servicio 'a convenir'", async () => {
    // En el carrito de servicios sueltos, "a convenir" significa "se paga en el
    // local": no se cobra aca y el turno no entra como pagado.
    adminClientMock.mockResolvedValue(
      makeAdmin({
        services: [
          { id: "svc-a", name: "Corte", duration_minutes: 30, price: 15000, hide_price: false, shop_id: SHOP },
          { id: "svc-b", name: "Coloracion a convenir", duration_minutes: 90, price: 40000, hide_price: true, shop_id: SHOP },
        ],
        appointments: [
          { id: "apt-1", service_id: "svc-a", service_price: 15000 },
          { id: "apt-2", service_id: "svc-b", service_price: 40000 },
        ],
      })
    );

    await run({ appointmentId: "apt-1", shopId: SHOP, shopSlug: "pelu", comboAppointmentIds: ["apt-1", "apt-2"] });

    expect(chargedAmount()).toBe(15000);
    expect(JSON.parse(metadata().paid_appointment_ids)).toEqual(["apt-1"]);
  });

  it("usa services.price cuando service_price viene null", async () => {
    // Turnos viejos pueden no tener service_price. El total no puede ser 0.
    adminClientMock.mockResolvedValue(
      makeAdmin({
        services: [{ id: "svc-a", name: "Corte", duration_minutes: 30, price: 15000, hide_price: false, shop_id: SHOP }],
        appointments: [{ id: "apt-1", service_id: "svc-a", service_price: null }],
      })
    );

    const res = await run({ appointmentId: "apt-1", shopId: SHOP, shopSlug: "pelu" });

    expect(res.success).toBe(true);
    expect(chargedAmount()).toBe(15000);
  });

  it("rechaza cuando no hay nada cobrable", async () => {
    adminClientMock.mockResolvedValue(
      makeAdmin({
        services: [{ id: "svc-a", name: "Corte", duration_minutes: 30, price: 15000, hide_price: true, shop_id: SHOP }],
        appointments: [{ id: "apt-1", service_id: "svc-a", service_price: 15000 }],
      })
    );

    const res = await run({ appointmentId: "apt-1", shopId: SHOP, shopSlug: "pelu" });
    expect(res).toEqual({ success: false, error: "No hay nada para cobrar" });
  });
});
