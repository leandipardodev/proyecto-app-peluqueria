"use server";

import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getAuthSession, getShopId } from "@/lib/dashboard/auth-server";
import { getTodayArgentinaBounds } from "@/lib/argentina-time";
import "server-only";

function createAdminClient() {
  return createSsrClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll() { return []; }, setAll() {} },
    }
  );
}

export async function fetchDailyFinanceSummary(dateStr?: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const admin = createAdminClient();

  const { start: dayStart, end: dayEnd } = dateStr
    ? (() => {
        const [y, m, d] = dateStr.split("-").map(Number);
        const s = new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
        const e = new Date(Date.UTC(y, m - 1, d, 3 + 23, 59, 59, 999));
        return { start: s, end: e };
      })()
    : getTodayArgentinaBounds();

  const [completedAppts, expenses] = await Promise.all([
    admin
      .from("appointments")
      .select("id, services!appointments_service_id_fkey(price)")
      .eq("shop_id", shopId)
      .eq("status", "completed")
      .eq("is_paid", true)
      .gte("start_time", dayStart.toISOString())
      .lte("start_time", dayEnd.toISOString()),
    admin
      .from("finances")
      .select("id, amount, category, description, created_at")
      .eq("shop_id", shopId)
      .eq("type", "expense")
      .gte("created_at", dayStart.toISOString())
      .lte("created_at", dayEnd.toISOString())
      .order("created_at", { ascending: true }),
  ]);

  if (completedAppts.error) {
    console.error("[finances] completedAppts error:", completedAppts.error);
  }
  if (expenses.error) {
    console.error("[finances] expenses error:", expenses.error.message || JSON.stringify(expenses.error));
    throw new Error(expenses.error.message || "Error al consultar gastos — la tabla finances podría no existir");
  }

  const totalIncome = (completedAppts.data || []).reduce((sum, a) => {
    const svc = Array.isArray(a.services) ? a.services[0] : a.services;
    return sum + (svc?.price ?? 0);
  }, 0);

  const totalExpenses = (expenses.data || []).reduce((sum, e) => sum + e.amount, 0);

  return {
    date: dayStart.toISOString().split("T")[0],
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
    appointmentsCount: (completedAppts.data || []).length,
    expenses: (expenses.data || []).map(e => ({
      id: e.id,
      amount: e.amount,
      category: e.category,
      description: e.description,
      created_at: e.created_at,
    })),
  };
}

export async function createExpense(formData: FormData) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const amount = parseFloat(formData.get("amount") as string);
  const category = formData.get("category") as string;
  const description = formData.get("description") as string || null;

  if (isNaN(amount) || amount <= 0) {
    return { error: "El monto debe ser un número positivo" };
  }

  if (!category) {
    return { error: "La categoría es obligatoria" };
  }

  const admin = createAdminClient();

  const { error } = await admin.from("finances").insert({
    shop_id: shopId,
    amount,
    type: "expense",
    category,
    description,
  });

  if (error) {
    console.error("[createExpense] Supabase error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/finances");
  return { success: true };
}

export async function deleteExpense(id: string) {
  const session = await getAuthSession();
  const shopId = await getShopId(session);

  const admin = createAdminClient();

  const { error } = await admin
    .from("finances")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopId);

  if (error) {
    console.error("[deleteExpense] error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/finances");
  return { success: true };
}
