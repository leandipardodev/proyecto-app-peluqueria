"use server";

import { createServiceRoleClient, requireShopId } from "@/lib/dashboard/auth-server";
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

async function createAdminClient() {
  return createServiceRoleClient();
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

    const incomeMovements: Movement[] = ((incomeAppts.data || []) as any[]).map((a) => {
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

    const expenseMovements: Movement[] = ((expensesResult.data || []) as any[]).map((e) => ({
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
        expenses: ((expensesResult.data || []) as any[]).map((e) => ({
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
