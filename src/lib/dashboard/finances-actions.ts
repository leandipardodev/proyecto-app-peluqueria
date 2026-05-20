"use server";

import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
import { createServerClient } from "@/lib/supabase/server";
import { revalidateDashboardSegments } from "@/lib/dashboard/revalidate-dashboard";
import { getArgentinaDateString, getArgentinaDayBounds } from "@/lib/argentina-time";
import type { ActionResult } from "@/lib/types";
import "server-only";

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
  services: { price: number | null; name: string | null } | Array<{ price: number | null; name: string | null }> | null;
};

type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  created_at: string;
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
  services: { price: number | null; name: string | null } | Array<{ price: number | null; name: string | null }> | null;
};

type StaffRuleRow = {
  id: string;
  model: "percentage" | "fixed_plus_percentage" | "service_specific";
  percentage_rate: number | null;
  fixed_amount: number | null;
};

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
};

export type StaffProduction = {
  staffId: string;
  staffName: string;
  staffEmail: string;
  role: string;
  appointmentsCount: number;
  paidAppointmentsCount: number;
  generatedRevenue: number;
  paidRevenue: number;
  avgTicketPaid: number;
  unpaidCompletedRevenue: number;
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

async function createAdminClient() {
  return createServiceRoleClient();
}

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

async function fetchShopStaff(admin: Awaited<ReturnType<typeof createAdminClient>>, shopId: string): Promise<StaffProfileRow[]> {
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
}

export async function fetchStaffProduction(fromDate?: string, toDate?: string, shopIdOverride?: string): Promise<ActionResult<StaffProduction[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
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
        .select("id, staff_id, service_id, start_time, status, is_paid, services:service_id(price, name)")
        .eq("shop_id", shopId)
        .in("status", ["completed", "confirmed", "scheduled"])
        .not("staff_id", "is", null)
        .gte("start_time", fromBounds.start.toISOString())
        .lte("start_time", toBounds.end.toISOString()),
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
        generatedRevenue: 0,
        paidRevenue: 0,
        avgTicketPaid: 0,
        unpaidCompletedRevenue: 0,
      });
    }

    for (const appt of appointments) {
      if (!appt.staff_id) continue;
      const row = stats.get(appt.staff_id);
      if (!row) continue;
      const amount = toService(appt)?.price || 0;

      row.appointmentsCount += 1;
      row.generatedRevenue += amount;
      if (appt.status === "completed" && appt.is_paid) {
        row.paidAppointmentsCount += 1;
        row.paidRevenue += amount;
      }
      if (appt.status === "completed" && !appt.is_paid) {
        row.unpaidCompletedRevenue += amount;
      }
    }

    const list = Array.from(stats.values())
      .map((s) => ({ ...s, avgTicketPaid: s.paidAppointmentsCount > 0 ? s.paidRevenue / s.paidAppointmentsCount : 0 }))
      .sort((a, b) => b.paidRevenue - a.paidRevenue);

    return { success: true, data: list };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar produccion por staff" };
  }
}

export async function upsertStaffCompensationRule(formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

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
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

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
        .select("id, model, percentage_rate, fixed_amount")
        .eq("shop_id", shopId)
        .eq("staff_user_id", staffUserId)
        .eq("is_active", true)
        .is("ends_on", null)
        .order("starts_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("appointments")
        .select("id, staff_id, service_id, start_time, status, is_paid, services:service_id(price, name)")
        .eq("shop_id", shopId)
        .eq("staff_id", staffUserId)
        .eq("status", "completed")
        .eq("is_paid", true)
        .gte("start_time", fromBounds.start.toISOString())
        .lte("start_time", toBounds.end.toISOString()),
    ]);

    if (apptsRes.error) return { success: false, error: apptsRes.error.message };
    if (rulesRes.error) return { success: false, error: rulesRes.error.message };

    const rule = rulesRes.data as StaffRuleRow | null;
    const rate = rule?.percentage_rate ?? 40;
    const fixed = rule?.fixed_amount ?? 0;
    const appointments = (apptsRes.data || []) as StaffAppointmentRow[];

    const grossRevenue = appointments.reduce((sum, appt) => sum + (toService(appt)?.price || 0), 0);
    const commissionAmount = (grossRevenue * rate) / 100 + fixed;
    const finalPayable = Math.max(0, commissionAmount + bonuses - deductions);

    const { data: liquidation, error: liquidationError } = await admin
      .from("staff_liquidations")
      .insert({
        shop_id: shopId,
        staff_user_id: staffUserId,
        period_start: periodStart,
        period_end: periodEnd,
        status: "draft",
        gross_revenue: grossRevenue,
        commission_amount: commissionAmount,
        bonuses_amount: bonuses,
        deductions_amount: deductions,
        final_payable: finalPayable,
      })
      .select("id")
      .single();

    if (liquidationError) return { success: false, error: liquidationError.message };

    if (appointments.length > 0) {
      const items = appointments.map((appt) => {
        const service = toService(appt);
        const gross = service?.price || 0;
        const commission = (gross * rate) / 100;
        return {
          shop_id: shopId,
          liquidation_id: liquidation.id,
          appointment_id: appt.id,
          service_id: appt.service_id,
          service_name_snapshot: service?.name || "Servicio",
          start_time_snapshot: appt.start_time,
          gross_amount: gross,
          commission_rate_snapshot: rate,
          commission_amount: commission,
          bonus_amount: 0,
          deduction_amount: 0,
          net_amount: commission,
        };
      });
      const { error: itemsError } = await admin.from("staff_liquidation_items").insert(items);
      if (itemsError) return { success: false, error: itemsError.message };
    }

    const staff = staffRows.find((s) => s.user_id === staffUserId);
    await revalidateDashboardSegments(shopId, ["/finances"]);

    return {
      success: true,
      data: {
        liquidationId: liquidation.id,
        staffId: staffUserId,
        staffName: staff?.user_profiles?.name || staff?.user_profiles?.email || "Staff",
        periodStart,
        periodEnd,
        grossRevenue,
        commissionAmount,
        bonusesAmount: bonuses,
        deductionsAmount: deductions,
        finalPayable,
        itemsCount: appointments.length,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear pre-liquidacion" };
  }
}

export async function fetchStaffLiquidations(fromDate?: string, toDate?: string, shopIdOverride?: string): Promise<ActionResult<StaffLiquidationListItem[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();
    const today = getArgentinaDateString();
    const from = (fromDate || today).trim();
    const to = (toDate || today).trim();

    const { data, error } = await admin
      .from("staff_liquidations")
      .select("id, staff_user_id, period_start, period_end, status, final_payable, paid_amount, created_at")
      .eq("shop_id", shopId)
      .gte("period_start", from)
      .lte("period_end", to)
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

export async function markStaffLiquidationPaid(liquidationId: string, paidAmount: number, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();
    const { error } = await admin
      .from("staff_liquidations")
      .update({ status: "paid", paid_amount: Math.max(0, paidAmount), paid_at: new Date().toISOString() })
      .eq("id", liquidationId)
      .eq("shop_id", shopId);

    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/finances"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al marcar liquidacion" };
  }
}

export async function fetchCashSession(shopIdOverride?: string): Promise<ActionResult<CashSessionSummary | null>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("cash_sessions")
      .select("id, status, opened_at, opening_amount, expected_amount, counted_amount, difference_amount")
      .eq("shop_id", shopId)
      .eq("status", "open")
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: true, data: null };
    return {
      success: true,
      data: {
        id: data.id,
        status: data.status,
        openedAt: data.opened_at,
        openingAmount: Number(data.opening_amount || 0),
        expectedAmount: Number(data.expected_amount || 0),
        countedAmount: data.counted_amount == null ? null : Number(data.counted_amount),
        differenceAmount: data.difference_amount == null ? null : Number(data.difference_amount),
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar caja" };
  }
}

export async function openCashSession(formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }
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
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const sessionId = String(formData.get("session_id") || "").trim();
    const countedAmount = Number(formData.get("counted_amount") || 0);
    const actorResult = await requireActorUserId();
    if (!actorResult.success || !actorResult.data) {
      return { success: false, error: actorResult.success ? "ACTOR_INVALIDO" : actorResult.error };
    }
    if (!sessionId) return { success: false, error: "Sesion de caja invalida" };

    const admin = await createAdminClient();
    const { data: moves, error: movesError } = await admin
      .from("cash_movements")
      .select("movement_type, amount")
      .eq("shop_id", shopId)
      .eq("cash_session_id", sessionId);
    if (movesError) return { success: false, error: movesError.message };

    const { data: session, error: sessionErr } = await admin
      .from("cash_sessions")
      .select("opening_amount")
      .eq("id", sessionId)
      .eq("shop_id", shopId)
      .single();
    if (sessionErr) return { success: false, error: sessionErr.message };

    const movementNet = (moves || []).reduce((sum, m) => {
      const amt = Number(m.amount || 0);
      return sum + (m.movement_type === "expense" || m.movement_type === "withdrawal" ? -amt : amt);
    }, 0);
    const expected = Number(session.opening_amount || 0) + movementNet;
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
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const amount = Number(formData.get("amount") || 0);
    const movementType = String(formData.get("movement_type") || "income");
    const paymentMethod = String(formData.get("payment_method") || "cash");
    const category = String(formData.get("category") || "General");
    const description = String(formData.get("description") || "") || null;
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
    });
    if (error) return { success: false, error: error.message };
    await revalidateDashboardSegments(shopId, ["/finances"]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al crear movimiento de caja" };
  }
}

export async function fetchCashMovements(fromDate?: string, toDate?: string, shopIdOverride?: string): Promise<ActionResult<CashMovementItem[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }
    const today = getArgentinaDateString();
    const from = (fromDate || today).trim();
    const to = (toDate || today).trim();
    const fromBounds = getArgentinaDayBounds(from);
    const toBounds = getArgentinaDayBounds(to);

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("cash_movements")
      .select("id, movement_type, payment_method, amount, category, description, happened_at")
      .eq("shop_id", shopId)
      .gte("happened_at", fromBounds.start.toISOString())
      .lte("happened_at", toBounds.end.toISOString())
      .order("happened_at", { ascending: false })
      .limit(50);
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data || []).map((m) => ({
        id: m.id,
        movementType: m.movement_type,
        paymentMethod: m.payment_method,
        amount: Number(m.amount || 0),
        category: m.category,
        description: m.description,
        happenedAt: m.happened_at,
      })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar movimientos de caja" };
  }
}

export async function fetchFinanceData(fromDate?: string, toDate?: string, shopIdOverride?: string): Promise<ActionResult<FinanceData>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    console.log("[fetchFinanceData] fromDate:", fromDate, "toDate:", toDate, "shopId:", shopId);

    const admin = await createAdminClient();

    const today = getArgentinaDateString();
    const from = (fromDate || today).trim();
    const to = (toDate || today).trim();

    const fromBounds = getArgentinaDayBounds(from);
    const toBounds = getArgentinaDayBounds(to);

    const [incomeAppts, expensesResult] = await Promise.all([
      admin
        .from("appointments")
        .select("id, start_time, status, services:service_id(price, name)")
        .eq("shop_id", shopId)
        .in("status", ["scheduled", "confirmed", "completed"])
        .gte("start_time", fromBounds.start.toISOString())
        .lte("start_time", toBounds.end.toISOString()),
      admin
        .from("finances")
        .select("id, amount, category, description, created_at")
        .eq("shop_id", shopId)
        .eq("type", "expense")
        .gte("created_at", fromBounds.start.toISOString())
        .lte("created_at", toBounds.end.toISOString())
        .order("created_at", { ascending: true }),
    ]);

    if (incomeAppts.error) {
      console.error("[finances] incomeAppts error:", JSON.stringify(incomeAppts.error, null, 2));
      return { success: false, error: incomeAppts.error.message || "Error al consultar ingresos" };
    }
    if (expensesResult.error) {
      console.error("[finances] expenses error:", JSON.stringify(expensesResult.error, null, 2));
      return { success: false, error: expensesResult.error.message || "Error al consultar gastos" };
    }

    const incomeRows: AppointmentIncomeRow[] = (incomeAppts.data || []) as AppointmentIncomeRow[];
    const expenseRows: ExpenseRow[] = (expensesResult.data || []) as ExpenseRow[];

    const incomeMovements: Movement[] = incomeRows.map((a) => {
      const svc = Array.isArray(a.services) ? a.services[0] : a.services;
      return {
        id: a.id,
        amount: svc?.price ?? 0,
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
      created_at: e.created_at,
      type: "expense" as const,
      status: null,
    }));

    const allMovements = [...incomeMovements, ...expenseMovements]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const totalIncome = incomeMovements.reduce((sum, m) => sum + m.amount, 0);
    const totalExpenses = expenseMovements.reduce((sum, m) => sum + m.amount, 0);

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
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar finanzas" };
  }
}

export async function fetchStaffLiquidationItems(liquidationId: string, shopIdOverride?: string): Promise<ActionResult<StaffLiquidationDetailItem[]>> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
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
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }
    const today = getArgentinaDateString();
    const from = (fromDate || today).trim();
    const to = (toDate || today).trim();
    const fromBounds = getArgentinaDayBounds(from);
    const toBounds = getArgentinaDayBounds(to);

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("cash_sessions")
      .select("id, status, opened_at, opening_amount, expected_amount, counted_amount, difference_amount")
      .eq("shop_id", shopId)
      .gte("opened_at", fromBounds.start.toISOString())
      .lte("opened_at", toBounds.end.toISOString())
      .order("opened_at", { ascending: false })
      .limit(30);

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: (data || []).map((s) => ({
        id: s.id,
        status: s.status,
        openedAt: s.opened_at,
        openingAmount: Number(s.opening_amount || 0),
        expectedAmount: Number(s.expected_amount || 0),
        countedAmount: s.counted_amount == null ? null : Number(s.counted_amount),
        differenceAmount: s.difference_amount == null ? null : Number(s.difference_amount),
      })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error al cargar historial de caja" };
  }
}

export async function createExpense(formData: FormData, shopIdOverride?: string): Promise<ActionResult> {
  try {
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

    const amount = parseFloat(formData.get("amount") as string);
    const category = formData.get("category") as string;
    const description = formData.get("description") as string || null;

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
    let shopId: string | undefined = shopIdOverride;
    if (!shopId) {
      const shopIdResult = await requireShopId();
      if (!shopIdResult.success) return shopIdResult;
      shopId = shopIdResult.data;
      if (!shopId) return { success: false, error: "LOCAL_INVALIDO" };
    }

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
