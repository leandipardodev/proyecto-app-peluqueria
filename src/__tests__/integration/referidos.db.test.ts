/**
 * INTEGRACION: referidos contra la base real.
 *
 * Levanta el circuito completo: atribucion -> evento de pago -> sync del ledger
 * -> ventana de meses -> needs_review -> pago por la RPC. Todo con las funciones
 * de `src/lib/admin/referrals.ts`, que son las que corren en el cron y en el
 * panel, y sin un solo mock del cliente de Supabase.
 *
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/referidos.db.test.ts
 */
import { vi } from "vitest";
import {
  DB_TESTS_ON,
  db,
  crearLocalDePrueba,
  borrarLocalDePrueba,
  type LocalDePrueba,
} from "./harness";

vi.unmock("@/lib/argentina-time");

// El panel de referidos arranca con `requireSuperAdmin()`. Se pasa por alto el
// guard porque a estas pruebas les interesa la agregacion (que separa "Te debo"
// de "A revisar"), no el auth, que tiene sus propios tests.
vi.mock("@/lib/admin/auth", () => ({
  getAdminSession: vi.fn(async () => ({ userId: "admin-de-prueba", email: "admin@klip.test", platformRole: "super_admin" })),
  requireSuperAdmin: vi.fn(async () => ({ userId: "admin-de-prueba", email: "admin@klip.test", platformRole: "super_admin" })),
}));

type Partner = { id: string; name: string; referral_code: string; pin_hash: string; pin_last4: string };

/** Crea un partner con el MISMO hash de PIN que usa la app. */
async function crearPartner(
  nombre: string,
  codigo: string,
  overrides: { commission_percent_override?: number | null; commission_months_override?: number | null } = {},
): Promise<Partner> {
  const supabase = db();
  const { hashPin, pinLast4 } = await import("@/lib/referrals/partner-auth");
  const pin = "123456";
  const { data, error } = await supabase
    .from("referral_partners")
    .insert({
      name: nombre,
      referral_code: codigo,
      is_active: true,
      pin_hash: await hashPin(pin),
      pin_last4: pinLast4(pin),
      commission_percent_override: overrides.commission_percent_override ?? null,
      commission_months_override: overrides.commission_months_override ?? null,
    })
    .select("id, name, referral_code, pin_hash, pin_last4")
    .single();
  if (error) throw new Error(`referral_partners insert: ${error.message}`);
  return data as Partner;
}

/**
 * Simula el pago de una suscripción: el webhook escribe un
 * `shop_billing_events` con los montos que devolvió Mercado Pago.
 *
 * `created_at` va DESPUES de ahora a proposito: el sync solo cuenta los eventos
 * posteriores a `attributed_at` (atribuir no re-precia lo que ya se habia
 * cobrado antes de traerse el local), asi que un evento con fecha de hoy al
 * mediodia queda afuera cuando la atribucion es de ahora.
 */
async function eventoDePago(
  shopId: string,
  payload: {
    net?: number | null;
    fee?: number;
    /** Si viene, el webhook no resuelve el neto y el sync marca needs_review. */
    soloGross?: boolean;
    /** Horas DESPUES de la atribucion, para mantener el orden del secuencia. */
    horasDespues?: number;
    tipo?: string;
  } = {},
): Promise<string> {
  const supabase = db();
  const tipo = payload.tipo ?? "subscription_payment_applied";
  const gross = 40000;
  const fee = payload.fee ?? 1400;
  const net = payload.net === undefined ? gross - fee : payload.net;
  const { data, error } = await supabase
    .from("shop_billing_events")
    .insert({
      shop_id: shopId,
      event_type: tipo,
      payload: payload.soloGross
        ? { payment_id: `pay-${Date.now()}-${Math.random()}`, gross_amount: gross }
        : {
            payment_id: `pay-${Date.now()}-${Math.random()}`,
            gross_amount: gross,
            mp_fee: fee,
            net_amount: net,
            amount_source: "mp_net_amount",
          },
      created_at: new Date(Date.now() + (payload.horasDespues ?? 0) * 3600_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`shop_billing_events insert: ${error.message}`);
  return data.id;
}

describe.skipIf(!DB_TESTS_ON)("Referidos · circuito completo contra la base", () => {
  const creado: string[] = [];
  const extraLocales: LocalDePrueba[] = [];
  let local: LocalDePrueba;
  let partnerA: Partner;
  let partnerB: Partner;
  let referrals: typeof import("@/lib/admin/referrals");

  beforeAll(async () => {
    // Misma razon que en la agenda: `setup.ts` mockea el cliente de Supabase y
    // estas pruebas necesitan el service role de verdad.
    const { createServiceRoleClient } = await import("@/lib/dashboard/auth/server");
    vi.mocked(createServiceRoleClient).mockResolvedValue(db() as never);
    // El panel de referidos no necesita sesion real: `@/lib/admin/auth` esta
    // mockeado arriba con un super admin.

    local = await crearLocalDePrueba("Referidos");
    creado.push(local.shopId);
    const sufijo = Date.now().toString(36).slice(-5);
    partnerA = await crearPartner("Vendedor A", `test-venta-a-${sufijo}`);
    partnerB = await crearPartner("Vendedor B", `test-venta-b-${sufijo}`);
    referrals = await import("@/lib/admin/referrals");
  }, 90_000);

afterAll(async () => {
    // Se borra TODO lo creado, no solo el primer local: algunos tests crean un
    // segundo local a mano. Con un local filtrado, el sync del siguiente sees
    // armaba drafts de mas y los tests contaban filas de otro.
    if (creado.length === 0) return;
    const supabase = db();
    const partnerIds = [partnerA?.id, partnerB?.id].filter(Boolean) as string[];

    const { data: shops } = await supabase.from("shops").select("id, slug").in("id", creado);
    const shopIds = (shops ?? []).map((s) => s.id);
    if (shopIds.length) {
      await supabase.from("referral_commission_payouts").delete().in("partner_id", partnerIds);
      await supabase.from("referral_commission_ledger").delete().in("shop_id", shopIds);
      await supabase.from("referral_link_clicks").delete().in("shop_id", shopIds);
      await supabase.from("shop_billing_events").delete().in("shop_id", shopIds);
      await supabase.from("referral_attributions").delete().in("shop_id", shopIds);
    }
    await supabase.from("referral_commission_ledger").delete().in("partner_id", partnerIds);
    await supabase.from("referral_link_clicks").delete().in("partner_id", partnerIds);
    await supabase.from("referral_partners").delete().in("id", partnerIds);
    for (const l of [local, ...extraLocales]) {
      if (l) await borrarLocalDePrueba(l);
    }
  }, 120_000);

  async function limpiarLedgerYEventos() {
    const supabase = db();
    await supabase.from("referral_commission_ledger").delete().eq("shop_id", local.shopId);
    await supabase.from("referral_commission_payouts").delete().in("partner_id", [partnerA.id, partnerB.id]);
    await supabase.from("shop_billing_events").delete().eq("shop_id", local.shopId);
    await supabase.from("referral_attributions").delete().eq("shop_id", local.shopId);
  }

  it("el codigo se busca sin distinguir mayusculas", async () => {
    const activo = await referrals.findActivePartnerByCode(partnerA.referral_code.toUpperCase());
    expect(activo?.id).toBe(partnerA.id);
    const inexistente = await referrals.findActivePartnerByCode("no-existe-codigo");
    expect(inexistente).toBeNull();
  });

  it("atribuye el local y guarda el snapshot de la regla", async () => {
    await limpiarLedgerYEventos();
    const res = await referrals.attributeShopToPartner({
      shopId: local.shopId,
      partnerId: partnerA.id,
      code: partnerA.referral_code,
    });
    expect(res.outcome).toBe("attributed");

    const supabase = db();
    const { data } = await supabase
      .from("referral_attributions")
      .select("partner_id, referral_code_snapshot, commission_percent_snapshot, commission_months_snapshot")
      .eq("shop_id", local.shopId)
      .single();
    expect(data?.partner_id).toBe(partnerA.id);
    expect(data?.referral_code_snapshot).toBe(partnerA.referral_code);
    // La regla por defecto del programa, no la del panel.
    expect(data?.commission_percent_snapshot).not.toBeNull();
  });

  it("el link registra el clic con outcome=attributed", async () => {
    const supabase = db();
    // El clic lo registra `/r/[code]`, que es quien llama a las dos funciones.
    await referrals.recordReferralLinkClick({
      partnerId: partnerA.id,
      shopId: local.shopId,
      code: partnerA.referral_code,
      outcome: "attributed",
    });
    const { data } = await supabase
      .from("referral_link_clicks")
      .select("outcome")
      .eq("shop_id", local.shopId)
      .eq("code", partnerA.referral_code);
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.[0].outcome).toBe("attributed");
  });

  it("un segundo vendedor NO se queda con el local (gana el primero)", async () => {
    const supabase = db();
    const res = await referrals.attributeShopToPartner({
      shopId: local.shopId,
      partnerId: partnerB.id,
      code: partnerB.referral_code,
    });
    expect(res.outcome).toBe("already_taken");

    const { data } = await supabase
      .from("referral_attributions")
      .select("partner_id")
      .eq("shop_id", local.shopId)
      .single();
    expect(data?.partner_id).toBe(partnerA.id);
  });

  it("atribuir de nuevo al MISMO vendedor es idempotente", async () => {
    const res = await referrals.attributeShopToPartner({
      shopId: local.shopId,
      partnerId: partnerA.id,
      code: partnerA.referral_code,
    });
    expect(res.outcome).toBe("attributed");
    const supabase = db();
    const { count } = await supabase
      .from("referral_attributions")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", local.shopId);
    expect(count).toBe(1);
  });

  it("un vendedor desactivado no se queda con el local", async () => {
    await limpiarLedgerYEventos();
    const supabase = db();
    await supabase.from("referral_partners").update({ is_active: false }).eq("id", partnerB.id);
    try {
      const res = await referrals.attributeShopToPartner({
        shopId: local.shopId,
        partnerId: partnerB.id,
        code: partnerB.referral_code,
      });
      expect(res.outcome).toBe("already_taken");
    } finally {
      await supabase.from("referral_partners").update({ is_active: true }).eq("id", partnerB.id);
    }
  });

  it("el sync crea la comisión sobre el NETO, con la secuencia 1", async () => {
    await limpiarLedgerYEventos();
    await referrals.attributeShopToPartner({ shopId: local.shopId, partnerId: partnerA.id, code: partnerA.referral_code });
    await eventoDePago(local.shopId);

    // En dryRun `inserted` viene en 0 por dise�o (referrals.ts:529): lo que
    // importa es que el draft se arme con el neto, no el bruto.
    const res = await referrals.syncReferralLedgerInternal({ dryRun: true });
    expect(res.drafts).toHaveLength(1);

    // Ahora sí, a guardar de verdad.
    const guardado = await referrals.syncReferralLedgerInternal({ dryRun: false });
    expect(guardado.inserted).toBe(1);

    const supabase = db();
    const { data: rows } = await supabase
      .from("referral_commission_ledger")
      .select("partner_id, shop_id, base_amount, mp_fee, net_amount, commission_percent, commission_amount, payment_sequence, status, amount_source, period_ym")
      .eq("shop_id", local.shopId);
    expect(rows).toHaveLength(1);
    const fila = rows![0];
    // 40.000 bruto - 1.400 de fee = 38.600 neto.
    expect(Number(fila.net_amount)).toBe(38600);
    expect(Number(fila.mp_fee)).toBe(1400);
    // `base_amount` es el bruto: la base informativa. Lo que importa es que la
    // COMISION se calcule sobre el neto, no sobre el bruto (que seria 1.400 mas).
    expect(Number(fila.base_amount)).toBe(40000);
    const esperado = Math.round(38600 * (Number(fila.commission_percent) / 100) * 100) / 100;
    expect(Math.abs(Number(fila.commission_amount) - esperado)).toBeLessThanOrEqual(1);
    expect(Number(fila.commission_amount)).toBeLessThan(Number(fila.base_amount));
    expect(fila.payment_sequence).toBe(1);
    expect(fila.status).toBe("pending");
    expect(fila.amount_source).toBe("payment_event");
    expect(fila.partner_id).toBe(partnerA.id);
  });

  it("correr el sync dos veces NO duplica comisiones", async () => {
    const supabase = db();
    const antes = await supabase
      .from("referral_commission_ledger")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", local.shopId);
    const res = await referrals.syncReferralLedgerInternal({ dryRun: false });
    expect(res.inserted).toBe(0);
    const { count } = await supabase
      .from("referral_commission_ledger")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", local.shopId);
    expect(count).toBe(antes.count);
  });

  it("la ventana de meses corta: el 3er pago no genera comisión", async () => {
    // El programa paga N meses. Con override en 2: el pago #3 queda afuera pero
    // SIGUE contando en la secuencia, asi que si el local se atrasa y paga dos
    // meses juntos el vendedor no vuelve a cobrar el mes 1.
    await limpiarLedgerYEventos();
    await db().from("referral_partners").update({ commission_months_override: 2 }).eq("id", partnerA.id);
    try {
      await referrals.attributeShopToPartner({ shopId: local.shopId, partnerId: partnerA.id, code: partnerA.referral_code });
      await eventoDePago(local.shopId, { horasDespues: 1 });
      await eventoDePago(local.shopId, { horasDespues: 2 });
      await eventoDePago(local.shopId, { horasDespues: 3 });

      await referrals.syncReferralLedgerInternal({ dryRun: false });

      const { data: rows } = await db()
        .from("referral_commission_ledger")
        .select("payment_sequence")
        .eq("shop_id", local.shopId)
        .order("payment_sequence");
      expect(rows).toHaveLength(2);
      expect(rows!.map((r) => r.payment_sequence)).toEqual([1, 2]);
    } finally {
      await db().from("referral_partners").update({ commission_months_override: null }).eq("id", partnerA.id);
    }
  });

  it("sin montos de MP la fila va a needs_review con comisión 0 y NO es pagable", async () => {
    await limpiarLedgerYEventos();
    await referrals.attributeShopToPartner({ shopId: local.shopId, partnerId: partnerA.id, code: partnerA.referral_code });
    await eventoDePago(local.shopId, { soloGross: true });

    await referrals.syncReferralLedgerInternal({ dryRun: false });

    const { data: rows } = await db()
      .from("referral_commission_ledger")
      .select("status, commission_amount, amount_source, payment_sequence")
      .eq("shop_id", local.shopId);
    expect(rows).toHaveLength(1);
    expect(rows![0].status).toBe("needs_review");
    expect(Number(rows![0].commission_amount)).toBe(0);
    expect(rows![0].amount_source).toBe("unknown");
    // Y ocupa secuencia: el siguiente pago es el #2, no el #1.
    expect(rows![0].payment_sequence).toBe(1);
  });

  it("el panel lista 'Te debo' solo lo pendiente y excluye needs_review", async () => {
    // needs_review esta separado a proposito: si estuviera en la lista de
    // pagos, el admin podria marcarlo pagado con un importe inventado.
    // `fetchReferralsAdminOverview` arranca con `requireSuperAdmin()`, que lee la
    // sesion del servidor. Se pasa por alto el guard: a esta prueba le interesa
    // la agregacion del panel (que separa "Te debo" de "A revisar"), no el auth,
    // que tiene sus propios tests.
// `fetchReferralsAdminOverview` devuelve los datos DIRECTOS (no envueltos en
    // `{success,data}`), asi que se leen los campos del overview tal cual.
    const overview = await referrals.fetchReferralsAdminOverview();
    const mios = overview.pendingTransfers.filter((t) => t.shopId === local.shopId);
    const miosReview = overview.needsReview.filter((t) => t.shopId === local.shopId);
    expect(mios).toHaveLength(0);
    expect(miosReview.length).toBeGreaterThan(0);
  });

  it("cerrar un needs_review con el neto verificado lo vuelve pagable", async () => {
    const supabase = db();
    const { data: row } = await supabase
      .from("referral_commission_ledger")
      .select("id, commission_percent")
      .eq("shop_id", local.shopId)
      .eq("status", "needs_review")
      .single();
    expect(row).toBeDefined();

    const res = await referrals.resolveNeedsReviewLedgerRow({ ledgerId: row!.id, netAmount: 38600 });
    expect(res.success).toBe(true);

    const { data: despues } = await supabase
      .from("referral_commission_ledger")
      .select("status, commission_amount, amount_source, net_amount")
      .eq("id", row!.id)
      .single();
    expect(despues?.status).toBe("pending");
    // Usa el % del partner, no el 100% por defecto.
    const esperado = Math.round(38600 * (Number(row!.commission_percent) / 100) * 100) / 100;
    expect(Math.abs(Number(despues?.commission_amount) - esperado)).toBeLessThanOrEqual(1);
    expect(despues?.amount_source).toBe("manual_review");
  });

  it("la RPC de pago marca paid, crea el payout y no toca otras filas", async () => {
    const supabase = db();
    // Un segundo local del mismo partner para comprobar que la RPC no paga de mas.
    const local2 = await crearLocalDePrueba("Referidos 2");
    creado.push(local2.shopId);
    extraLocales.push(local2);
    await referrals.attributeShopToPartner({ shopId: local2.shopId, partnerId: partnerA.id, code: partnerA.referral_code });
    await eventoDePago(local2.shopId);
    await referrals.syncReferralLedgerInternal({ dryRun: false });

    const { data: filas } = await supabase
      .from("referral_commission_ledger")
      .select("id, shop_id, status, commission_amount")
      .eq("partner_id", partnerA.id)
      .in("shop_id", [local.shopId, local2.shopId]);
    const delLocal1 = filas!.filter((f) => f.shop_id === local.shopId);
    expect(delLocal1.length).toBeGreaterThan(0);

    const res = await referrals.markReferralLedgerRowsPaid({ ledgerIds: delLocal1.map((f) => f.id) });
    expect(res.success).toBe(true);

    const { data: pagadas } = await supabase
      .from("referral_commission_ledger")
      .select("status, payout_id, paid_at")
      .eq("shop_id", local.shopId);
    for (const f of pagadas!) {
      expect(f.status).toBe("paid");
      expect(f.paid_at).not.toBeNull();
    }
    const payoutIds = new Set(pagadas!.map((f) => f.payout_id));
    expect(payoutIds.size).toBe(1);
    expect([...payoutIds][0]).toBeTruthy();

    // El payout suma exactamente lo pagado.
    const { data: payout } = await supabase
      .from("referral_commission_payouts")
      .select("amount, status, currency")
      .eq("id", [...payoutIds][0] as string)
      .single();
    const suma = delLocal1.reduce((s, f) => s + Number(f.commission_amount), 0);
    expect(Math.abs(Number(payout?.amount) - suma)).toBeLessThanOrEqual(1);
    expect(payout?.status).toBe("paid");

    // La otra fila (local2) sigue pendiente: la RPC solo toca las ids que le pasaron.
    const { data: otras } = await supabase
      .from("referral_commission_ledger")
      .select("status")
      .eq("shop_id", local2.shopId);
    expect(otras!.every((f) => f.status === "pending")).toBe(true);
  });

  it("volver a pagar las mismas filas no duplica el payout", async () => {
    const supabase = db();
    const antes = await supabase
      .from("referral_commission_payouts")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerA.id);
    const { data: pagadas } = await supabase
      .from("referral_commission_ledger")
      .select("id")
      .eq("shop_id", local.shopId)
      .eq("status", "paid");
    await referrals.markReferralLedgerRowsPaid({ ledgerIds: pagadas!.map((f) => f.id) });
    const { count } = await supabase
      .from("referral_commission_payouts")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerA.id);
    expect(count).toBe(antes.count);
  });

  it("desasignar el local cancela lo pendiente y conserva lo pagado", async () => {
    const supabase = db();
    await eventoDePago(local.shopId);
    await referrals.syncReferralLedgerInternal({ dryRun: false });
    const { data: filas } = await supabase
      .from("referral_commission_ledger")
      .select("status")
      .eq("shop_id", local.shopId);
    expect(filas!.some((f) => f.status === "paid")).toBe(true);
    expect(filas!.some((f) => f.status === "pending")).toBe(true);

    const res = await referrals.deleteReferralAttribution({ shopId: local.shopId });
    expect(res.success).toBe(true);

    const { data: despues } = await supabase
      .from("referral_commission_ledger")
      .select("status")
      .eq("shop_id", local.shopId);
    // Lo pagado no se toca: el vendedor ya recibio esa plata.
    expect(despues!.every((f) => f.status !== "pending")).toBe(true);
    const { data: attr } = await supabase
      .from("referral_attributions")
      .select("id")
      .eq("shop_id", local.shopId);
    expect(attr).toHaveLength(0);
  });
});
