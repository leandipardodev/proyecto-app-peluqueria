"use server";

import { createServiceRoleClient, getCurrentUserRole, requireOwnerShopId, requireShopId, resolveAuthorizedShopId } from "@/lib/dashboard/auth/server";
import { createServerClient } from "@/lib/supabase/server";
import { revalidateDashboardSegments } from "@/lib/dashboard/shared/revalidate-dashboard";
import { getArgentinaDateString, getArgentinaDayBounds, getArgentinaNow } from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import "server-only";
import { createAdminClient } from "../appointments/shared";
import { collectedAmount } from "../appointments/paid-amount";

type Movement = {
  id: string;
  amount: number;
  description: string;
  created_at: string;
  type: "income" | "expense";
  status: string | null;
};

type AppointmentIncomeRow = {
  id: string;
  start_time: string;
  status: string;
  service_price: number | null;
  services: { price: number | null; name: string | null } | Array<{ price: number | null; name: string | null }> | null;
};

type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  created_at: string;
  happened_at: string | null;
};

type StaffProfileRow = {
  user_id: string;
  role: string;
  user_profiles: { name: string | null; email: string | null } | null;
};

type StaffAppointmentRow = {
  id: string;
  staff_id: string | null;
  service_id: string | null;
  start_time: string;
  status: string;
  is_paid: boolean | null;
  service_price: number | null;
  services: { price: number | null; name: string | null } | Array<{ price: number | null; name: string | null }> | null;
};

type StaffRuleRow = {
  id: string;
  model: "percentage" | "fixed_plus_percentage" | "service_specific";
  percentage_rate: number | null;
  fixed_amount: number | null;
  overrides_enabled: boolean | null;
};

/**
 * `MAX_*` son cortes de seguridad, no de diseño: una peluquería con 6 sillones
 * pasa facil los 500 turnos por mes que tenia antes, y un `limit` se come filas
 * en silencio (PostgREST no avisa). Por eso cada consulta pide `count` y las
 * acciones devuelven un `*Truncated`: la UI avisa "esto es un parcial" en vez
 * de mostrar un total mas bajo como si fuera el real.
 */
const MAX_INCOME_APPOINTMENTS = 5000;
const MAX_RANGE_MOVEMENTS = 1000;
const MAX_STAFF_APPOINTMENTS = 5000;
const MAX_LIQUIDATION_APPOINTMENTS = 5000;
const MAX_CASH_MOVEMENTS_LIST = 200;
const MAX_LIQUIDATIONS_HISTORY = 100;
/** Topes del cierre de caja: aca un truncado graba un numero IRREVERSIBLE. */
const MAX_SESSION_MOVEMENTS = 5000;
const MAX_SESSION_APPOINTMENTS = 5000;

export type FinanceData = {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  appointmentsCount: number;
  recentMovements: Movement[];
  expenses: Array<{
    id: string;
    amount: number;
    category: string;
    description: string | null;
    created_at: string;
  }>;
  /** Se llego al tope de turnos del rango: `totalIncome` es un parcial. */
  incomeTruncated: boolean;
  /** Se llego al tope de movimientos del rango: los dos totales son parciales. */
  movementsTruncated: boolean;
};

export type StaffProduction = {
  staffId: string;
  staffName: string;
  staffEmail: string;
  role: string;
  appointmentsCount: number;
  paidAppointmentsCount: number;
  paidRevenue: number;
  avgTicketPaid: number;
};

export type StaffLiquidationPreview = {
  liquidationId: string;
  staffId: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  grossRevenue: number;
  commissionAmount: number;
  bonusesAmount: number;
  deductionsAmount: number;
  finalPayable: number;
  itemsCount: number;
  /** La liquidacion de ese profesional y ese periodo ya estaba pagada: no se toco. */
  alreadyPaid?: boolean;
};

/** Fila del Historial: una liquidacion con sus numeros, de cualquier periodo. */
export type StaffLiquidationHistoryItem = {
  id: string;
  staffId: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  grossRevenue: number;
  commissionAmount: number;
  finalPayable: number;
  paidAmount: number;
  paidAt: string | null;
  createdAt: string;
};

export type StaffLiquidationListItem = {
  id: string;
  staffId: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  finalPayable: number;
  paidAmount: number;
  createdAt: string;
};

export type CashSessionSummary = {
  id: string;
  status: "open" | "closed" | "cancelled";
  openedAt: string;
  openingAmount: number;
  expectedAmount: number;
  countedAmount: number | null;
  differenceAmount: number | null;
  movementNet: number;
  appointmentIncome: number;
};

export type CashMovementItem = {
  id: string;
  movementType: string;
  paymentMethod: string;
  amount: number;
  category: string;
  description: string | null;
  happenedAt: string;
};

export type StaffLiquidationDetailItem = {
  id: string;
  serviceName: string;
  grossAmount: number;
  commissionAmount: number;
  netAmount: number;
  startTime: string | null;
};

async function requireActorUserId(): Promise<ActionResult<string>> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) return { success: false, error: "SESION_EXPIRADA" };
  return { success: true, data: user.id };
}

function toService(row: StaffAppointmentRow): { price: number | null; name: string | null } | null {
  if (!row.services) return null;
  return Array.isArray(row.services) ? row.services[0] || null : row.services;
}

const shopStaffCache = new Map<string, Promise<StaffProfileRow[]>>();

async function fetchShopStaff(admin: Awaited<ReturnType<typeof createAdminClient>>, shopId: string): Promise<StaffProfileRow[]> {
  const cached = shopStaffCache.get(shopId);
  if (cached) return cached;

  const promise = (async () => {
    const { data: memberships, error: membershipsError } = await admin
      .from("shop_memberships")
      .select("user_id, role")
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .in("role", ["owner", "admin", "staff"]);

    if (membershipsError) throw new Error(membershipsError.message);

    const userIds = (memberships || []).map((m) => m.user_id).filter(Boolean);
    if (userIds.length === 0) return [];

    const { data: profiles, error: profilesError } = await admin
      .from("user_profiles")
      .select("user_id, name, email")
      .in("user_id", userIds);

    if (profilesError) throw new Error(profilesError.message);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, { name: p.name, email: p.email }]));

    return (memberships || []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      user_profiles: profileMap.get(m.user_id) || null,
    })) as StaffProfileRow[];
  })();

  shopStaffCache.set(shopId, promise);
  promise.finally(() => shopStaffCache.delete(shopId));
  return promise;
}

export type StaffProductionResult = {
  rows: StaffProduction[];
  /** Se llego al tope de turnos del rango: los Cobrado son parciales. */
  truncated: boolean;
};

export async function fetchStaffProduction(fromDate?: string, toDate?: string, shopIdOverride?: string): Promise<ActionResult<StaffProductionResult>> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "member");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    // Staff cannot see economic data of any staff member
    const roleResult = await getCurrentUserRole(shopId);
    if (roleResult.success && roleResult.data?.role === "staff") {
      const admin = await createAdminClient();
      const staffRows = await fetchShopStaff(admin, shopId);
      return {
        success: true,
        data: {
          truncated: false,
          rows: staffRows.map((s) => ({
            staffId: s.user_id,
            staffName: s.user_profiles?.name || s.user_profiles?.email || "Sin nombre",
            staffEmail: s.user_profiles?.email || "",
            role: s.role,
            appointmentsCount: 0,
            paidAppointmentsCount: 0,
            paidRevenue: 0,
            avgTicketPaid: 0,
          })),
        },
      };
    }

    const admin = await createAdminClient();
    const today = getArgentinaDateString();
    const from = (fromDate || today).trim();
    const to = (toDate || today).trim();
    const fromBounds = getArgentinaDayBounds(from);
    const toBounds = getArgentinaDayBounds(to);

    const [staffRows, apptsRes] = await Promise.all([
      fetchShopStaff(admin, shopId),
      admin
        .from("appointments")
        .select("id, staff_id, service_id, start_time, status, is_paid, service_price, amount_paid, loyalty_discount_percent_applied, services:service_id(price, name)", { count: "exact" })
        .eq("shop_id", shopId)
        .in("status", ["completed"])
        .eq("is_paid", true)
        .not("staff_id", "is", null)
        .gte("start_time", fromBounds.start.toISOString())
        .lte("start_time", toBounds.end.toISOString())
        .limit(MAX_STAFF_APPOINTMENTS),
    ]);

    if (apptsRes.error) return { success: false, error: apptsRes.error.message };
    const appointments = (apptsRes.data || []) as StaffAppointmentRow[];

    const stats = new Map<string, StaffProduction>();
    for (const s of staffRows) {
      const name = s.user_profiles?.name || s.user_profiles?.email || "Sin nombre";
      stats.set(s.user_id, {
        staffId: s.user_id,
        staffName: name,
        staffEmail: s.user_profiles?.email || "",
        role: s.role,
        appointmentsCount: 0,
        paidAppointmentsCount: 0,
        paidRevenue: 0,
        avgTicketPaid: 0,
      });
    }

    for (const appt of appointments) {
      if (!appt.staff_id) continue;
      const row = stats.get(appt.staff_id);
      if (!row) continue;
      const amount = collectedAmount(appt);

      row.appointmentsCount += 1;
      row.paidAppointmentsCount += 1;
      row.paidRevenue += amount;
    }

    const list = Array.from(stats.values())
      .map((s) => ({ ...s, avgTicketPaid: s.paidAppointmentsCount > 0 ? s.paidRevenue / s.paidAppointmentsCount : 0 }))
      .sort((a, b) => b.paidRevenue - a.paidRevenue);

    return { success: true, data: { rows: list, truncated: (apptsRes.count ?? 0) > appointments.length } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar produccion por staff" };
  }
}

export async function upsertStaffCompensationRule(formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "owner");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const staffUserId = String(formData.get("staff_user_id") || "").trim();
    const startsOn = String(formData.get("starts_on") || "").trim();
    const percentageRate = Number(formData.get("percentage_rate") || 0);
    const fixedAmountRaw = String(formData.get("fixed_amount") || "").trim();
    const fixedAmount = fixedAmountRaw ? Number(fixedAmountRaw) : 0;
    const model = fixedAmount > 0 ? "fixed_plus_percentage" : "percentage";

    if (!staffUserId) return { success: false, error: "Staff invalido" };
    if (!startsOn) return { success: false, error: "Fecha de inicio requerida" };
    if (Number.isNaN(percentageRate) || percentageRate < 0 || percentageRate > 100) {
      return { success: false, error: "Porcentaje invalido" };
    }

    const admin = await createAdminClient();

    await admin
      .from("staff_compensation_rules")
      .update({ ends_on: startsOn, is_active: false, updated_at: new Date().toISOString() })
      .eq("shop_id", shopId)
      .eq("staff_user_id", staffUserId)
      .is("ends_on", null)
      .eq("is_active", true);

    const { error } = await admin.from("staff_compensation_rules").insert({
      shop_id: shopId,
      staff_user_id: staffUserId,
      model,
      percentage_rate: percentageRate,
      fixed_amount: fixedAmount,
      starts_on: startsOn,
      ends_on: null,
      is_active: true,
    });
    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/finances"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al guardar regla" };
  }
}

export async function createStaffPreLiquidation(formData: FormData, shopIdOverride?: string): Promise<ActionResult<StaffLiquidationPreview>> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "owner");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const staffUserId = String(formData.get("staff_user_id") || "").trim();
    const periodStart = String(formData.get("period_start") || "").trim();
    const periodEnd = String(formData.get("period_end") || "").trim();
    const bonuses = Number(formData.get("bonuses_amount") || 0);
    const deductions = Number(formData.get("deductions_amount") || 0);

    if (!staffUserId || !periodStart || !periodEnd) return { success: false, error: "Datos incompletos" };

    const admin = await createAdminClient();
    const fromBounds = getArgentinaDayBounds(periodStart);
    const toBounds = getArgentinaDayBounds(periodEnd);

    const [staffRows, rulesRes, apptsRes] = await Promise.all([
      fetchShopStaff(admin, shopId),
      admin
        .from("staff_compensation_rules")
        .select("id, model, percentage_rate, fixed_amount, overrides_enabled")
        .eq("shop_id", shopId)
        .eq("staff_user_id", staffUserId)
        // La regla se busca POR PERIODO, no "la vigente". Antes tomaba
        // `is_active = true AND ends_on IS NULL`, o sea la de hoy: subir a
        // alguien de 40% a 50% el 15 de octubre re-preciaba setiembre, que ya
        // estaba liquidado. El modelo tiene `starts_on`/`ends_on` justamente
        // para esto, asi que se usa.
        .lte("starts_on", periodEnd)
        .or(`ends_on.is.null,ends_on.gte.${periodStart}`)
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("appointments")
        .select("id, staff_id, service_id, start_time, status, is_paid, service_price, amount_paid, loyalty_discount_percent_applied, services:service_id(price, name)", { count: "exact" })
        .eq("shop_id", shopId)
        .eq("staff_id", staffUserId)
        .eq("status", "completed")
        .eq("is_paid", true)
        .gte("start_time", fromBounds.start.toISOString())
        .lte("start_time", toBounds.end.toISOString())
        .limit(MAX_LIQUIDATION_APPOINTMENTS),
    ]);

    if (apptsRes.error) return { success: false, error: apptsRes.error.message };
    if (rulesRes.error) return { success: false, error: rulesRes.error.message };

    const rule = rulesRes.data as StaffRuleRow | null;
    const defaultRate = rule?.percentage_rate ?? 40;
    const fixed = rule?.fixed_amount ?? 0;
    const appointments = (apptsRes.data || []) as StaffAppointmentRow[];

    // Una liquidacion con el bruto parcial es peor que no liquidar: el monto que
    // se paga no es el que dice. Se corta el calculo y se pide achicar el rango.
    if ((apptsRes.count ?? 0) > appointments.length) {
      return {
        success: false,
        error: `Este profesional tiene mas de ${MAX_LIQUIDATION_APPOINTMENTS} turnos pagados en el periodo. No se puede liquidar con el rango tan largo: acortalo o dividi la liquidacion en dos.`,
      };
    }

    const overrideRateMap = new Map<string, number>();
    if (rule && (rule as any).overrides_enabled && rule.id) {
      const { data: overrides } = await admin
        .from("staff_commission_overrides")
        .select("service_id, percentage_rate")
        .eq("compensation_rule_id", rule.id);
      for (const ov of overrides ?? []) {
        overrideRateMap.set(ov.service_id, Number(ov.percentage_rate || 0));
      }
    }

    const getRate = (serviceId: string | null): number => {
      if (overrideRateMap.size > 0 && serviceId && overrideRateMap.has(serviceId)) {
        return overrideRateMap.get(serviceId)!;
      }
      return defaultRate;
    };

    const grossRevenue = appointments.reduce((sum, appt) => {
      const price = collectedAmount(appt);
      return sum + price;
    }, 0);
    const commissionAmount = (grossRevenue * defaultRate) / 100 + fixed;
    const finalPayable = Math.max(0, commissionAmount + bonuses - deductions);

    const amounts = {
      gross_revenue: grossRevenue,
      commission_amount: commissionAmount,
      bonuses_amount: bonuses,
      deductions_amount: deductions,
      final_payable: finalPayable,
    };

    // `idx_staff_liquidations_unique_period` (shop_id, staff_user_id,
    // period_start, period_end) where status <> 'cancelled' impide dos
    // liquidaciones del mismo profesional para el mismo periodo. Por eso el
    // segundo Calcular no duplicaba nada: reventaba con el error crudo del
    // indice. Ademas recalcular tiene que rehacer el detalle turno a turno.
    const { data: existing, error: existingError } = await admin
      .from("staff_liquidations")
      .select("id, status")
      .eq("shop_id", shopId)
      .eq("staff_user_id", staffUserId)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .neq("status", "cancelled")
      .maybeSingle();

    if (existingError) return { success: false, error: existingError.message };

    const staff = staffRows.find((s) => s.user_id === staffUserId);
    const staffName = staff?.user_profiles?.name || staff?.user_profiles?.email || "Staff";
    const preview = {
      staffId: staffUserId,
      staffName,
      periodStart,
      periodEnd,
      grossRevenue,
      commissionAmount,
      bonusesAmount: bonuses,
      deductionsAmount: deductions,
      finalPayable,
      itemsCount: appointments.length,
    };

    // Una liquidacion pagada ya es un comprobante: recalcular no la revierte ni
    // la pisa, se avisa.
    if (existing && existing.status === "paid") {
      return { success: true, data: { ...preview, liquidationId: existing.id, alreadyPaid: true } };
    }

    let liquidationId: string;
    if (existing) {
      liquidationId = existing.id;
      const { error: updateError } = await admin
        .from("staff_liquidations")
        .update(amounts)
        .eq("id", liquidationId)
        .eq("shop_id", shopId);
      if (updateError) return { success: false, error: updateError.message };

      // Los items son el turno a turno de este calculo. Sin borrarlos primero,
      // recalcular dejaria el detalle duplicado.
      const { error: clearItemsError } = await admin
        .from("staff_liquidation_items")
        .delete()
        .eq("liquidation_id", liquidationId);
      if (clearItemsError) return { success: false, error: clearItemsError.message };
    } else {
      const { data: liquidation, error: liquidationError } = await admin
        .from("staff_liquidations")
        .insert({
          shop_id: shopId,
          staff_user_id: staffUserId,
          period_start: periodStart,
          period_end: periodEnd,
          status: "draft",
          ...amounts,
        })
        .select("id")
        .single();

      // `23505` es la violacion de `idx_staff_liquidations_unique_period`. Pasa
      // cuando dos "Calcular" del mismo profesional y periodo llegan juntos (dos
      // pestanas, o doble clic): los dos leen "no existe" y los dos insertan.
      // El que pierde cae al camino del update en vez de mostrarle al usuario un
      // error crudo de Postgres. El indice es parcial (`status <> 'cancelled'`),
      // asi que no se puede resolver con `onConflict`.
      if (liquidationError?.code === "23505") {
        const { data:winner } = await admin
          .from("staff_liquidations")
          .select("id")
          .eq("shop_id", shopId)
          .eq("staff_user_id", staffUserId)
          .eq("period_start", periodStart)
          .eq("period_end", periodEnd)
          .neq("status", "cancelled")
          .maybeSingle();
        if (!winner) return { success: false, error: liquidationError.message };
        liquidationId = winner.id;
        const { error: updateError } = await admin
          .from("staff_liquidations")
          .update(amounts)
          .eq("id", liquidationId)
          .eq("shop_id", shopId);
        if (updateError) return { success: false, error: updateError.message };
        const { error: clearItemsError } = await admin
          .from("staff_liquidation_items")
          .delete()
          .eq("liquidation_id", liquidationId);
        if (clearItemsError) return { success: false, error: clearItemsError.message };
      } else {
        if (liquidationError) return { success: false, error: liquidationError.message };
        liquidationId = liquidation.id;
      }
    }

    if (appointments.length > 0) {
      const items = appointments.map((appt) => {
        const service = toService(appt);
        const gross = collectedAmount(appt);
        const effectiveRate = getRate(appt.service_id);
        const commission = (gross * effectiveRate) / 100;
        return {
          shop_id: shopId,
          liquidation_id: liquidationId,
          appointment_id: appt.id,
          service_id: appt.service_id,
          service_name_snapshot: service?.name || "Servicio",
          start_time_snapshot: appt.start_time,
          gross_amount: gross,
          commission_rate_snapshot: effectiveRate,
          commission_amount: commission,
          bonus_amount: 0,
          deduction_amount: 0,
          net_amount: commission,
        };
      });
      const { error: itemsError } = await admin.from("staff_liquidation_items").insert(items);
      if (itemsError) return { success: false, error: itemsError.message };
    }

    await revalidateDashboardSegments(shopId, ["/finances"]);

    return {
      success: true,
      data: { ...preview, liquidationId },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear pre-liquidacion" };
  }
}

export async function fetchStaffLiquidations(fromDate?: string, toDate?: string, shopIdOverride?: string): Promise<ActionResult<StaffLiquidationListItem[]>> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "member");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    // Staff cannot see liquidation data (economic data of other staff)
    const roleResult = await getCurrentUserRole(shopId);
    if (roleResult.success && roleResult.data?.role === "staff") {
      return { success: true, data: [] };
    }

    const admin = await createAdminClient();
    const today = getArgentinaDateString();
    const from = (fromDate || today).trim();
    const to = (toDate || today).trim();

    const { data, error } = await admin
      .from("staff_liquidations")
      .select("id, staff_user_id, period_start, period_end, status, final_payable, paid_amount, created_at")
      .eq("shop_id", shopId)
      // Solapamiento, no contencion: una liquidacion es de un rango (por ejemplo
      // toda la semana) y el filtro de la pagina puede ser un solo dia. Con
      // `period_start >= from` una liquidacion de lunes a domingo nunca entraba
      // con el filtro en "Hoy", que es el rango por defecto: el professional
      // aparecia sin liquidacion y su boton Pagar no existia.
      .lte("period_start", to)
      .gte("period_end", from)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const staffRows = await fetchShopStaff(admin, shopId);
    const staffNameMap = new Map(staffRows.map((s) => [s.user_id, s.user_profiles?.name || s.user_profiles?.email || "Staff"]));

    const list = (data || []).map((row) => ({
      id: row.id as string,
      staffId: row.staff_user_id as string,
      staffName: staffNameMap.get(row.staff_user_id as string) || "Staff",
      periodStart: row.period_start as string,
      periodEnd: row.period_end as string,
      status: row.status as string,
      finalPayable: Number(row.final_payable || 0),
      paidAmount: Number(row.paid_amount || 0),
      createdAt: row.created_at as string,
    }));

    return { success: true, data: list };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar liquidaciones" };
  }
}

/**
 * Historial completo, sin filtro de periodo. `fetchStaffLiquidations` exige que
 * la liquidacion este *dentro* del rango elegido, asi que con el filtro en un
 * dia noedia ni una: el Historial tiene que traerlas de cualquier fecha.
 */
export async function fetchStaffLiquidationsHistory(shopIdOverride?: string): Promise<ActionResult<StaffLiquidationHistoryItem[]>> {
  try {
    const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "member");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    // Staff cannot see liquidation data (economic data of other staff)
    const roleResult = await getCurrentUserRole(shopId);
    if (roleResult.success && roleResult.data?.role === "staff") {
      return { success: true, data: [] };
    }

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("staff_liquidations")
      .select("id, staff_user_id, period_start, period_end, status, gross_revenue, commission_amount, final_payable, paid_amount, paid_at, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(MAX_LIQUIDATIONS_HISTORY);

    if (error) return { success: false, error: error.message };

    const staffRows = await fetchShopStaff(admin, shopId);
    const staffNameMap = new Map(staffRows.map((s) => [s.user_id, s.user_profiles?.name || s.user_profiles?.email || "Staff"]));

    const list = (data || []).map((row) => ({
      id: row.id as string,
      staffId: row.staff_user_id as string,
      // Un profesional dado de baja ya no esta en `shop_memberships`: sin el
      // nombre quedaria "Staff" y el historial no diria a quien se le pago.
      staffName: staffNameMap.get(row.staff_user_id as string) || "Profesional dado de baja",
      periodStart: row.period_start as string,
      periodEnd: row.period_end as string,
      status: row.status as string,
      grossRevenue: Number(row.gross_revenue || 0),
      commissionAmount: Number(row.commission_amount || 0),
      finalPayable: Number(row.final_payable || 0),
      paidAmount: Number(row.paid_amount || 0),
      paidAt: (row.paid_at as string | null) || null,
      createdAt: row.created_at as string,
    }));

    return { success: true, data: list };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar el historial" };
  }
}

export async function markStaffLiquidationPaid(liquidationId: string, paidAmount: number, shopIdOverride?: string): Promise<ActionResult> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "owner");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const admin = await createAdminClient();
    // `neq("status","paid")` + `select(...)` hace el filtro en la misma
    // sentencia: si no vuelve ninguna fila, la liquidacion ya estaba pagada.
    // Antes hacia un update a ciegas y una segunda llamada de Pagar sobre una
    // liquidacion ya paga reescribia `paid_at`.
    //
    // `paid_amount` llega del cliente, asi que se re-lee el `final_payable` de la
    // fila: antes un `paid_amount = 0` manipulado dejaba la liquidacion en
    // "pagada" con $0 pagados y el Historial mostraba ese 0.
    const { data: updated, error } = await admin
      .from("staff_liquidations")
      .update({ status: "paid", paid_amount: Number(paidAmount) || 0, paid_at: new Date().toISOString() })
      .eq("id", liquidationId)
      .eq("shop_id", shopId)
      .neq("status", "paid")
      .select("id, staff_user_id, period_start, period_end, final_payable, paid_amount");

    if (error) return { success: false, error: error.message };
    if (!updated || updated.length === 0) {
      return { success: false, error: "Esta liquidacion ya estaba pagada" };
    }

    // Pagar la comision es plata que SALE del local, y antes no dejaba ningun
    // rastro: el Balance de Finanzas y el de Inicio no lo veian, asi que el
    // resultado del negocio salia inflado por el tamaño del equipo.
    //
    // Va a `finances` y NO a `cash_movements`: no se sabe si el dueño paid en
    // efectivo o por transferencia, y ponerlo en la caja seria inventar que
    // salio de la caja. Como `finances` no lleva `appointment_id`, lo cuentan
    // tanto `fetchFlowRange` (Inicio) como `fetchFinanceData` (Caja).
    const liquidacion = updated[0];
    const montoPagado = Number(liquidacion.paid_amount || 0);
    if (montoPagado > 0) {
      const staffRows = await fetchShopStaff(admin, shopId);
      const nombre = staffRows.find((s) => s.user_id === liquidacion.staff_user_id)?.user_profiles?.name || "Profesional";
      const { error: expenseError } = await admin.from("finances").insert({
        shop_id: shopId,
        type: "expense",
        category: "Comisiones",
        amount: montoPagado,
        description: `Comisión ${nombre} · ${liquidacion.period_start} a ${liquidacion.period_end}`,
        happened_at: new Date().toISOString(),
      });
      if (expenseError) {
        // El pago ya quedo registrado. Que falle el asiento no lo deshace, pero
        // avisarlo evita un Balance sin ver la salida.
        console.error("[finances] liquidacion pagada sin asiento de gasto:", expenseError.message);
      }
    }

    await revalidateDashboardSegments(shopId, ["/finances"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al marcar liquidacion" };
  }
}

export async function fetchCashSession(shopIdOverride?: string): Promise<ActionResult<CashSessionSummary | null>> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "member");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("cash_sessions")
      .select("id, status, opened_at, opening_amount, expected_amount, counted_amount, difference_amount")
      .eq("shop_id", shopId)
      .eq("status", "open")
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: true, data: null };
    const { data: sessionMoves, error: movesError } = await admin
      .from("cash_movements")
      .select("movement_type, amount")
      .eq("shop_id", shopId)
      .eq("cash_session_id", data.id)
      .limit(500);
    if (movesError) return { success: false, error: movesError.message };

    const movementNet = (sessionMoves || []).reduce((sum, m) => {
      const amt = Number(m.amount || 0);
      return sum + (m.movement_type === "expense" || m.movement_type === "withdrawal" ? -amt : amt);
    }, 0);

    let appointmentIncome = 0;
    if (data.status === "open") {
      const { data: sessionAppts } = await admin
        .from("appointments")
        .select("service_price, amount_paid, loyalty_discount_percent_applied, services:service_id(price)")
        .eq("shop_id", shopId)
        .eq("status", "completed")
        .eq("is_paid", true)
        .gte("start_time", data.opened_at)
        .lte("start_time", getArgentinaNow().toISOString())
        .limit(500);
      appointmentIncome = (sessionAppts || []).reduce((sum, a) => {
        const svc = Array.isArray(a.services) ? a.services[0] : a.services;
        const amount = collectedAmount(a);
        return sum + amount;
      }, 0);
    }

    const expectedAmount = data.status === "open"
      ? Number(data.opening_amount || 0) + movementNet + appointmentIncome
      : Number(data.expected_amount || 0);

    return {
      success: true,
      data: {
        id: data.id,
        status: data.status as "open" | "cancelled" | "closed",
        openedAt: data.opened_at,
        openingAmount: Number(data.opening_amount || 0),
        expectedAmount,
        countedAmount: data.counted_amount == null ? null : Number(data.counted_amount),
        differenceAmount: data.difference_amount == null ? null : Number(data.difference_amount),
        movementNet,
        appointmentIncome,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar caja" };
  }
}

export async function openCashSession(formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "owner");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const openingAmount = Number(formData.get("opening_amount") || 0);
    const actorResult = await requireActorUserId();
    if (!actorResult.success || !actorResult.data) {
      return { success: false, error: actorResult.success ? "ACTOR_INVALIDO" : actorResult.error };
    }
    const admin = await createAdminClient();
    const { error } = await admin.from("cash_sessions").insert({
      shop_id: shopId,
      opening_amount: Math.max(0, openingAmount),
      status: "open",
      opened_by: actorResult.data,
    });
    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/finances"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al abrir caja" };
  }
}

export async function closeCashSession(formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "owner");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const sessionId = String(formData.get("session_id") || "").trim();
    const countedAmount = Number(formData.get("counted_amount") || 0);
    const actorResult = await requireActorUserId();
    if (!actorResult.success || !actorResult.data) {
      return { success: false, error: actorResult.success ? "ACTOR_INVALIDO" : actorResult.error };
    }
    if (!sessionId) return { success: false, error: "Sesion de caja invalida" };

    const admin = await createAdminClient();
    // `count: "exact"` en las dos consultas de abajo. Este es el unico lugar de
    // la app donde un truncado es IRREVERSIBLE: `expected_amount` y
    // `difference_amount` se escriben y quedan grabados como el descuadre real
    // del archivo. Con el `.limit(500)` pelado, un local con mas de 500 turnos
    // pagados en el dia guardaba un "esperado" calculado sobre un subconjunto
    // arbitrario, y el Historial de caja mostraba ese numero para siempre.
    const { data: moves, error: movesError, count: movesCount } = await admin
      .from("cash_movements")
      .select("movement_type, amount", { count: "exact" })
      .eq("shop_id", shopId)
      .eq("cash_session_id", sessionId)
      .limit(MAX_SESSION_MOVEMENTS);
    if (movesError) return { success: false, error: movesError.message };
    if ((movesCount ?? 0) > (moves?.length ?? 0)) {
      return {
        success: false,
        error: `Esta caja tiene mas de ${MAX_SESSION_MOVEMENTS} movimientos y no se puede cerrar con un total parcial. Revisá los movimientos de la sesion.`,
      };
    }

    const { data: session, error: sessionErr } = await admin
      .from("cash_sessions")
      .select("opening_amount, opened_at")
      .eq("id", sessionId)
      .eq("shop_id", shopId)
      .single();
    if (sessionErr) return { success: false, error: sessionErr.message };

    const { data: sessionAppts, error: apptsError, count: apptsCount } = await admin
      .from("appointments")
      .select("service_price, amount_paid, loyalty_discount_percent_applied, services:service_id(price)", { count: "exact" })
      .eq("shop_id", shopId)
      .eq("status", "completed")
      .eq("is_paid", true)
      .gte("start_time", session.opened_at)
      .lte("start_time", getArgentinaNow().toISOString())
      .limit(MAX_SESSION_APPOINTMENTS);
    if (apptsError) return { success: false, error: apptsError.message };
    if ((apptsCount ?? 0) > (sessionAppts?.length ?? 0)) {
      return {
        success: false,
        error: `Esta caja tiene mas de ${MAX_SESSION_APPOINTMENTS} turnos pagados y no se puede cerrar con un total parcial.`,
      };
    }

    const appointmentIncome = (sessionAppts || []).reduce((sum, a) => {
      const svc = Array.isArray(a.services) ? a.services[0] : a.services;
      const amount = collectedAmount(a);
      return sum + amount;
    }, 0);

    const movementNet = (moves || []).reduce((sum, m) => {
      const amt = Number(m.amount || 0);
      return sum + (m.movement_type === "expense" || m.movement_type === "withdrawal" ? -amt : amt);
    }, 0);
    const expected = Number(session.opening_amount || 0) + movementNet + appointmentIncome;
    const diff = countedAmount - expected;

    const { error } = await admin
      .from("cash_sessions")
      .update({
        status: "closed",
        counted_amount: countedAmount,
        expected_amount: expected,
        difference_amount: diff,
        closed_at: new Date().toISOString(),
        closed_by: actorResult.data,
      })
      .eq("id", sessionId)
      .eq("shop_id", shopId)
      .eq("status", "open");
    if (error) return { success: false, error: error.message };

    await revalidateDashboardSegments(shopId, ["/finances"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cerrar caja" };
  }
}

export async function createCashMovement(formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "owner");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const rawAmount = formData.get("amount");
    const amount = Number(rawAmount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      return { success: false, error: "El monto debe ser un número positivo" };
    }
    const movementType = String(formData.get("movement_type") || "income");
    const paymentMethod = String(formData.get("payment_method") || "cash");
    const category = String(formData.get("category") || "General");
    const description = String(formData.get("description") || "") || null;
    const happenedAtRaw = formData.get("happened_at") as string | null;
    const happenedAt = happenedAtRaw?.trim() ? new Date(happenedAtRaw.trim()).toISOString() : new Date().toISOString();
    const actorResult = await requireActorUserId();
    if (!actorResult.success || !actorResult.data) {
      return { success: false, error: actorResult.success ? "ACTOR_INVALIDO" : actorResult.error };
    }

    const admin = await createAdminClient();
    const { data: session } = await admin
      .from("cash_sessions")
      .select("id")
      .eq("shop_id", shopId)
      .eq("status", "open")
      .maybeSingle();

    const { error } = await admin.from("cash_movements").insert({
      shop_id: shopId,
      cash_session_id: session?.id || null,
      created_by: actorResult.data,
      movement_type: movementType,
      amount,
      payment_method: paymentMethod,
      category,
      description,
      happened_at: happenedAt,
    });
    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/finances"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear movimiento de caja" };
  }
}

export type CashMovementsResult = {
  rows: CashMovementItem[];
  /** Movimientos que hay en el rango, mas alla de los que trae `rows`. */
  totalCount: number;
  /** `rows` esta recortado: el modal muestra una parte del periodo. */
  truncated: boolean;
};

export async function fetchCashMovements(fromDate?: string, toDate?: string, shopIdOverride?: string): Promise<ActionResult<CashMovementsResult>> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "member");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const today = getArgentinaDateString();
    const from = (fromDate || today).trim();
    const to = (toDate || today).trim();
    const fromBounds = getArgentinaDayBounds(from);
    const toBounds = getArgentinaDayBounds(to);

    const admin = await createAdminClient();
    // `count: "exact"` es lo que permite que el modal diga cuantos movimientos
    // hay de verdad. Antes contaba `data.length`, o sea el limite (50): con 80
    // movimientos en el periodo la UI decia "50".
    const { data, error, count } = await admin
      .from("cash_movements")
      .select("id, movement_type, payment_method, amount, category, description, happened_at", { count: "exact" })
      .eq("shop_id", shopId)
      .gte("happened_at", fromBounds.start.toISOString())
      .lte("happened_at", toBounds.end.toISOString())
      .order("happened_at", { ascending: false })
      .limit(MAX_CASH_MOVEMENTS_LIST);
    if (error) return { success: false, error: error.message };

    const rows = (data || []).map((m) => ({
      id: m.id,
      movementType: m.movement_type,
      paymentMethod: m.payment_method,
      amount: Number(m.amount || 0),
      category: m.category,
      description: m.description,
      happenedAt: m.happened_at,
    }));

    return {
      success: true,
      data: { rows, totalCount: count ?? rows.length, truncated: (count ?? rows.length) > rows.length },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar movimientos de caja" };
  }
}

export async function fetchFinanceData(fromDate?: string, toDate?: string, shopIdOverride?: string): Promise<ActionResult<FinanceData>> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "member");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const admin = await createAdminClient();

    const today = getArgentinaDateString();
    const from = (fromDate || today).trim();
    const to = (toDate || today).trim();

    const fromBounds = getArgentinaDayBounds(from);
    const toBounds = getArgentinaDayBounds(to);

    const [incomeAppts, expensesResult, cashMovesResult] = await Promise.all([
      admin
        .from("appointments")
        .select("id, start_time, status, service_price, amount_paid, loyalty_discount_percent_applied, services:service_id(price, name)", { count: "exact" })
        .eq("shop_id", shopId)
        .eq("status", "completed")
        .eq("is_paid", true)
        .gte("start_time", fromBounds.start.toISOString())
        .lte("start_time", toBounds.end.toISOString())
        .limit(MAX_INCOME_APPOINTMENTS),
      admin
        .from("finances")
        .select("id, amount, category, description, created_at, happened_at")
        .eq("shop_id", shopId)
        .eq("type", "expense")
        .gte("happened_at", fromBounds.start.toISOString())
        .lte("happened_at", toBounds.end.toISOString())
        .order("happened_at", { ascending: true }),
      admin
        .from("cash_movements")
        .select("id, movement_type, amount, category, description, happened_at", { count: "exact" })
        .eq("shop_id", shopId)
        .gte("happened_at", fromBounds.start.toISOString())
        .lte("happened_at", toBounds.end.toISOString())
        .limit(MAX_RANGE_MOVEMENTS),
    ]);

    if (incomeAppts.error) {
      console.error("[finances] incomeAppts error:", JSON.stringify(incomeAppts.error, null, 2));
      return { success: false, error: incomeAppts.error.message || "Error al consultar ingresos" };
    }
    if (expensesResult.error) {
      console.error("[finances] expenses error:", JSON.stringify(expensesResult.error, null, 2));
      return { success: false, error: expensesResult.error.message || "Error al consultar gastos" };
    }
    if (cashMovesResult.error) {
      console.error("[finances] cash moves error:", JSON.stringify(cashMovesResult.error, null, 2));
      return { success: false, error: cashMovesResult.error.message || "Error al consultar movimientos de caja" };
    }

    const incomeRows: AppointmentIncomeRow[] = (incomeAppts.data || []) as AppointmentIncomeRow[];
    const expenseRows: ExpenseRow[] = (expensesResult.data || []) as ExpenseRow[];
    const cashRows = (cashMovesResult.data || []) as Array<{ id: string; movement_type: string; amount: number | null; category: string | null; description: string | null; happened_at: string }>;

    const incomeMovements: Movement[] = incomeRows.map((a) => {
      const svc = Array.isArray(a.services) ? a.services[0] : a.services;
      const amount = collectedAmount(a);
      return {
        id: a.id,
        amount,
        description: svc?.name || "Servicio",
        created_at: a.start_time,
        type: "income" as const,
        status: a.status,
      };
    });

    const expenseMovements: Movement[] = expenseRows.map((e) => ({
      id: e.id,
      amount: e.amount,
      description: e.description || e.category || "Gasto",
      created_at: e.happened_at || e.created_at,
      type: "expense" as const,
      status: null,
    }));

    const manualIncomeMovements: Movement[] = cashRows
      .filter((m) => m.movement_type === "income")
      .map((m) => ({
        id: `cash-inc-${m.id}`,
        amount: Number(m.amount || 0),
        description: m.description || m.category || "Ingreso de caja",
        created_at: m.happened_at,
        type: "income" as const,
        status: null,
      }));

    const manualExpenseMovements: Movement[] = cashRows
      .filter((m) => m.movement_type === "expense" || m.movement_type === "withdrawal")
      .map((m) => ({
        id: `cash-exp-${m.id}`,
        amount: Number(m.amount || 0),
        description: m.description || m.category || (m.movement_type === "withdrawal" ? "Retiro de caja" : "Gasto de caja"),
        created_at: m.happened_at,
        type: "expense" as const,
        status: null,
      }));

    const allMovements = [...incomeMovements, ...manualIncomeMovements, ...expenseMovements, ...manualExpenseMovements]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const totalIncome = [...incomeMovements, ...manualIncomeMovements].reduce((sum, m) => sum + m.amount, 0);
    const totalExpenses = [...expenseMovements, ...manualExpenseMovements].reduce((sum, m) => sum + m.amount, 0);
    // `count` cuenta las filas que pasan los filtros ignorando el `limit`, asi
    // que si supera lo que volvio, se comieron filas.
    const incomeTruncated = (incomeAppts.count ?? 0) > incomeRows.length;
    const movementsTruncated = (cashMovesResult.count ?? 0) > cashRows.length;

    return {
      success: true,
      data: {
        totalIncome,
        totalExpenses,
        netBalance: totalIncome - totalExpenses,
        appointmentsCount: incomeMovements.length,
        recentMovements: allMovements,
        expenses: expenseRows.map((e) => ({
          id: e.id,
          amount: e.amount,
          category: e.category,
          description: e.description,
          created_at: e.created_at,
        })),
        incomeTruncated,
        movementsTruncated,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar finanzas" };
  }
}

export async function fetchStaffLiquidationItems(liquidationId: string, shopIdOverride?: string): Promise<ActionResult<StaffLiquidationDetailItem[]>> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "member");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    // Staff cannot see liquidation detail (economic data)
    const roleResult = await getCurrentUserRole(shopId);
    if (roleResult.success && roleResult.data?.role === "staff") {
      return { success: true, data: [] };
    }

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("staff_liquidation_items")
      .select("id, service_name_snapshot, gross_amount, commission_amount, net_amount, start_time_snapshot")
      .eq("shop_id", shopId)
      .eq("liquidation_id", liquidationId)
      .order("start_time_snapshot", { ascending: true });

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: (data || []).map((i) => ({
        id: i.id,
        serviceName: i.service_name_snapshot || "Servicio",
        grossAmount: Number(i.gross_amount || 0),
        commissionAmount: Number(i.commission_amount || 0),
        netAmount: Number(i.net_amount || 0),
        startTime: i.start_time_snapshot || null,
      })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar detalle" };
  }
}

export async function fetchCashSessionsHistory(fromDate?: string, toDate?: string, shopIdOverride?: string): Promise<ActionResult<CashSessionSummary[]>> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "member");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;
    const today = getArgentinaDateString();
    const from = (fromDate || today).trim();
    const to = (toDate || today).trim();
    const fromBounds = getArgentinaDayBounds(from);
    const toBounds = getArgentinaDayBounds(to);

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("cash_sessions")
      .select("id, status, opened_at, closed_at, opening_amount, expected_amount, counted_amount, difference_amount")
      .eq("shop_id", shopId)
      .gte("opened_at", fromBounds.start.toISOString())
      .lte("opened_at", toBounds.end.toISOString())
      .order("opened_at", { ascending: false })
      .limit(30);

    if (error) return { success: false, error: error.message };

    const sessionIds = (data || []).map((s) => s.id);

    const [movesBySession, apptsBySession] = await Promise.all([
      sessionIds.length > 0
        ? admin
            .from("cash_movements")
            .select("cash_session_id, movement_type, amount")
            .eq("shop_id", shopId)
            .in("cash_session_id", sessionIds)
        : Promise.resolve({ data: [] }),
      Promise.all(
        (data || []).map((s) =>
          admin
            .from("appointments")
            .select("service_price, amount_paid, loyalty_discount_percent_applied, services:service_id(price)")
            .eq("shop_id", shopId)
            .eq("status", "completed")
            .eq("is_paid", true)
            .gte("start_time", s.opened_at)
            .lte("start_time", s.closed_at || getArgentinaNow().toISOString())
        )
      ),
    ]);

    const movesMap = new Map<string, { type: string; amount: number }[]>();
    for (const m of movesBySession.data || []) {
      if (!m.cash_session_id) continue;
      const list = movesMap.get(m.cash_session_id) || [];
      list.push({ type: m.movement_type, amount: Number(m.amount || 0) });
      movesMap.set(m.cash_session_id, list);
    }

    return {
      success: true,
      data: (data || []).map((s, idx) => {
        const moves = movesMap.get(s.id) || [];
        const movementNet = moves.reduce((sum, m) => {
          return sum + (m.type === "expense" || m.type === "withdrawal" ? -m.amount : m.amount);
        }, 0);

        const appts = apptsBySession[idx]?.data || [];
        const appointmentIncome = appts.reduce((sum, a) => {
          const svc = Array.isArray(a.services) ? a.services[0] : a.services;
          return sum + collectedAmount(a);
        }, 0);

        return {
          id: s.id,
          status: s.status as "open" | "cancelled" | "closed",
          openedAt: s.opened_at,
          openingAmount: Number(s.opening_amount || 0),
          expectedAmount: Number(s.expected_amount || 0),
          countedAmount: s.counted_amount == null ? null : Number(s.counted_amount),
          differenceAmount: s.difference_amount == null ? null : Number(s.difference_amount),
          movementNet,
          appointmentIncome,
        };
      }),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar historial de caja" };
  }
}

export async function createExpense(formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "owner");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const amount = parseFloat(formData.get("amount") as string);
    const category = formData.get("category") as string;
    const description = formData.get("description") as string || null;
    const happenedAtRaw = formData.get("happened_at") as string | null;
    const happenedAt = happenedAtRaw?.trim() ? new Date(happenedAtRaw.trim()).toISOString() : new Date().toISOString();

    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: "El monto debe ser un número positivo" };
    }

    if (!category) {
      return { success: false, error: "La categoría es obligatoria" };
    }

    const admin = await createAdminClient();

    const { error } = await admin.from("finances").insert({
      shop_id: shopId,
      amount,
      type: "expense",
      category,
      description,
      happened_at: happenedAt,
    });

    if (error) {
      console.error("[createExpense] Supabase error:", error);
      return { success: false, error: error.message };
    }

    await revalidateDashboardSegments(shopId, ["/finances"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear gasto" };
  }
}

export async function deleteExpense(id: string, shopIdOverride?: string): Promise<ActionResult> {
  try {
        const shopIdResult = await resolveAuthorizedShopId(shopIdOverride, "owner");
    if (!shopIdResult.success) return shopIdResult;
    const shopId = shopIdResult.data;

    const admin = await createAdminClient();

    const { error } = await admin
      .from("finances")
      .delete()
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) {
      console.error("[deleteExpense] error:", error);
      return { success: false, error: error.message };
    }

    await revalidateDashboardSegments(shopId, ["/finances"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al eliminar gasto" };
  }
}
